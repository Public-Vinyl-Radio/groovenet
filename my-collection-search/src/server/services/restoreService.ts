import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { dbQuery } from "@/lib/serverDb";

type RestorePgConfig = {
  db: string;
  user: string;
  pass: string;
  host: string;
  port: string;
};

type RestoreResult = {
  message: string;
  backupType: "schema+data" | "data-only";
  fileType: "sql" | "dump";
  reindex: {
    albumsIndexed: number;
    tracksIndexed: number;
    warning: string | null;
  };
};

function parsePgUrl(pgUrl: string) {
  try {
    const url = new URL(pgUrl);
    return {
      user: url.username,
      pass: url.password,
      host: url.hostname,
      port: url.port || "5432",
      db: url.pathname.replace(/^\//, ""),
    };
  } catch {
    return {};
  }
}

function getPgConfig(): RestorePgConfig {
  const fromUrl = process.env.DATABASE_URL
    ? parsePgUrl(process.env.DATABASE_URL)
    : {};
  return {
    db: String(fromUrl.db || process.env.POSTGRES_DB || "mydb"),
    user: String(fromUrl.user || process.env.POSTGRES_USER || "myuser"),
    pass: String(fromUrl.pass || process.env.POSTGRES_PASSWORD || "mypassword"),
    host: String(fromUrl.host || process.env.POSTGRES_HOST || "db"),
    port: String(fromUrl.port || process.env.POSTGRES_PORT || "5432"),
  };
}

function runShell(cmd: string, pass: string): void {
  execSync(cmd, {
    stdio: "pipe",
    env: { ...process.env, PGPASSWORD: pass },
  });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function classifyBackup(fileName: string, content: Buffer): {
  fileType: "sql" | "dump";
  backupType: "schema+data" | "data-only";
} {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".dump" || ext === ".backup") {
    return { fileType: "dump", backupType: "schema+data" };
  }
  const text = content.toString("utf8");
  const hasSchema =
    text.includes("CREATE TABLE") ||
    text.includes("CREATE SCHEMA") ||
    text.includes("ALTER TABLE");
  return {
    fileType: "sql",
    backupType: hasSchema ? "schema+data" : "data-only",
  };
}

export function buildRestorePrepSql(
  backupType: "schema+data" | "data-only",
  pgUser: string
): string | null {
  if (backupType === "data-only") {
    return `
DO $$
DECLARE
  tables_to_truncate text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO tables_to_truncate
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> 'pgmigrations';

  IF tables_to_truncate IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
  END IF;
END $$;
`.trim();
  }

  // Backups are dumped with `-n public`, so they recreate the public schema but
  // not the extensions living in it (vector, pg_trgm). Rebuild public empty with
  // those extensions in place. DROP OWNED can't be used: the app role is the
  // bootstrap superuser and owns the system catalogs.
  return `
DO $$
DECLARE
  public_extensions text[];
  ext text;
BEGIN
  SELECT coalesce(array_agg(e.extname), '{}')
    INTO public_extensions
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE n.nspname = 'public';

  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public;

  FOREACH ext IN ARRAY public_extensions LOOP
    EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I SCHEMA public', ext);
  END LOOP;
END $$;
GRANT ALL ON SCHEMA public TO ${quoteIdentifier(pgUser)};
GRANT ALL ON SCHEMA public TO public;
`.trim();
}

// The prep step has already recreated public, so the dump's own CREATE SCHEMA
// would fail under ON_ERROR_STOP.
export function tolerateExistingPublicSchema(sqlContent: string): string {
  return sqlContent.replace(
    /^CREATE SCHEMA public;$/m,
    "CREATE SCHEMA IF NOT EXISTS public;"
  );
}

function removePgMigrationsData(sqlContent: string): string {
  const withoutCopy = sqlContent.replace(
    /COPY\s+public\.pgmigrations\s+\([^)]+\)\s+FROM\s+stdin;[\s\S]*?\\\.\s*$/gm,
    "-- COPY pgmigrations skipped"
  );
  return withoutCopy.replace(
    /^INSERT INTO\s+public\.pgmigrations[\s\S]*?;$/gm,
    "-- INSERT pgmigrations skipped"
  );
}

async function reindexSearch(): Promise<{
  albumsIndexed: number;
  tracksIndexed: number;
  warning: string | null;
}> {
  try {
    const [{ rows: albumsRows }, { rows: tracksRows }] = await Promise.all([
      dbQuery<{ count: string }>("SELECT COUNT(*)::text AS count FROM albums"),
      dbQuery<{ count: string }>("SELECT COUNT(*)::text AS count FROM tracks"),
    ]);
    return {
      albumsIndexed: Number(albumsRows[0]?.count ?? 0),
      tracksIndexed: Number(tracksRows[0]?.count ?? 0),
      warning: null,
    };
  } catch (error) {
    return {
      albumsIndexed: 0,
      tracksIndexed: 0,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function restoreDatabaseFromUpload(file: File): Promise<RestoreResult> {
  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "groovenet-restore-"));

  const content = Buffer.from(await file.arrayBuffer());
  const { fileType, backupType } = classifyBackup(file.name, content);
  try {
    const restorePath = path.join(
      restoreDir,
      fileType === "dump" ? "restore.dump" : "restore.sql"
    );
    fs.writeFileSync(restorePath, content);

    const pg = getPgConfig();

    if (backupType === "data-only") {
      runShell("npm run migrate up", pg.pass);
    }

    const prepSql =
      fileType === "dump" && backupType === "schema+data"
        ? null
        : buildRestorePrepSql(backupType, pg.user);
    if (prepSql) {
      const cleanPath = path.join(restoreDir, "restore-clean.sql");
      fs.writeFileSync(cleanPath, `${prepSql}\n`);
      runShell(
        `psql -U ${pg.user} -h ${pg.host} -p ${pg.port} -d ${pg.db} -v ON_ERROR_STOP=1 -f '${cleanPath}'`,
        pg.pass
      );
    }

    if (fileType === "dump") {
      runShell(
        `pg_restore -U ${pg.user} -h ${pg.host} -p ${pg.port} -d ${pg.db} --single-transaction --clean --if-exists --no-owner --no-acl '${restorePath}'`,
        pg.pass
      );
    } else {
      const sqlContent = fs.readFileSync(restorePath, "utf8");
      const filteredPath = path.join(restoreDir, "restore-filtered.sql");
      // Only strip pgmigrations for data-only backups — migrations run separately for those.
      // For schema+data backups, pgmigrations is in the dump and must be restored as-is.
      const finalContent =
        backupType === "data-only"
          ? removePgMigrationsData(sqlContent)
          : tolerateExistingPublicSchema(sqlContent);
      fs.writeFileSync(filteredPath, finalContent);
      runShell(
        `psql -U ${pg.user} -h ${pg.host} -p ${pg.port} -d ${pg.db} --single-transaction -v ON_ERROR_STOP=1 -q -f '${filteredPath}'`,
        pg.pass
      );
    }

    const reindex = await reindexSearch();
    return {
      message: "Database schema and data restored successfully.",
      backupType,
      fileType,
      reindex,
    };
  } finally {
    fs.rmSync(restoreDir, { recursive: true, force: true });
  }
}
