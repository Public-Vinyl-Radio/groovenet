import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dbQuery } from "@/lib/serverDb";
import {
  pgConnectionArgs,
  pgEnv,
  resolvePgConnection,
  runCommand,
} from "@/server/services/databaseBackupService";

type BackupType = "schema+data" | "data-only";
type FileType = "sql" | "dump";

type RestoreResult = {
  message: string;
  backupType: BackupType;
  fileType: FileType;
  reindex: {
    albumsIndexed: number;
    tracksIndexed: number;
    warning: string | null;
  };
};

const SCHEMA_MARKERS = ["CREATE TABLE", "CREATE SCHEMA", "ALTER TABLE"];
const MARKER_OVERLAP = Math.max(...SCHEMA_MARKERS.map((marker) => marker.length));

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function backupFileType(fileName: string): FileType {
  const ext = path.extname(fileName).toLowerCase();
  return ext === ".dump" || ext === ".backup" ? "dump" : "sql";
}

/**
 * Whether a plain SQL backup carries schema. Scans the file in chunks rather
 * than reading it whole: a dump can exceed V8's maximum string length (#459).
 * pg_dump writes schema before data, so a schema-bearing file returns early.
 */
export async function sqlBackupHasSchema(filePath: string): Promise<boolean> {
  let carry = "";
  for await (const chunk of fs.createReadStream(filePath, { encoding: "utf8" })) {
    const text = carry + (chunk as string);
    if (SCHEMA_MARKERS.some((marker) => text.includes(marker))) return true;
    carry = text.slice(-MARKER_OVERLAP);
  }
  return false;
}

export async function classifyBackupFile(
  fileName: string,
  filePath: string
): Promise<{ fileType: FileType; backupType: BackupType }> {
  const fileType = backupFileType(fileName);
  if (fileType === "dump") return { fileType, backupType: "schema+data" };
  return {
    fileType,
    backupType: (await sqlBackupHasSchema(filePath)) ? "schema+data" : "data-only",
  };
}

export function buildRestorePrepSql(
  backupType: BackupType,
  pgUser: string
): string {
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

/**
 * Drop the `SCHEMA - public` entry from a `pg_restore -l` listing. A `-n public`
 * archive carries one, so restoring it would either recreate the schema the
 * prep step already rebuilt, or with `--clean` try to drop it, which fails
 * because the vector and pg_trgm extensions live in it (#459). The listing is
 * one line per archive entry, so it is small enough to read whole.
 */
export function withoutPublicSchemaEntry(list: string): string {
  return list
    .split("\n")
    .filter((line) => !/^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s/.test(line))
    .join("\n");
}

/**
 * A stateful per-line filter for plain SQL backups, applied while streaming.
 * Returns the line to write, or null to drop it. COPY data blocks pass through
 * untouched, so a row can never be mistaken for a statement.
 *
 * - schema+data: the prep step has already recreated public, so the dump's own
 *   CREATE SCHEMA would fail under ON_ERROR_STOP; make it idempotent.
 * - data-only: migrations run separately, so drop the pgmigrations rows.
 */
export function createRestoreLineFilter(
  backupType: BackupType
): (line: string) => string | null {
  let state: "statement" | "copy" | "skip-copy" | "skip-insert" = "statement";

  return (line) => {
    if (state === "copy" || state === "skip-copy") {
      const skipping = state === "skip-copy";
      if (line === "\\.") state = "statement";
      return skipping ? null : line;
    }
    if (state === "skip-insert") {
      if (line.trimEnd().endsWith(";")) state = "statement";
      return null;
    }

    if (backupType === "data-only") {
      if (/^COPY\s+public\.pgmigrations\s/.test(line)) {
        state = "skip-copy";
        return "-- COPY pgmigrations skipped";
      }
      if (/^INSERT INTO\s+public\.pgmigrations\b/.test(line)) {
        if (!line.trimEnd().endsWith(";")) state = "skip-insert";
        return "-- INSERT pgmigrations skipped";
      }
    } else if (line === "CREATE SCHEMA public;") {
      return "CREATE SCHEMA IF NOT EXISTS public;";
    }

    if (/^COPY\s.*\sFROM stdin;$/.test(line)) state = "copy";
    return line;
  };
}

/**
 * Stream `inputPath` through the line filter into `outputPath`. A `pipeline`,
 * not a write/drain loop: an errored write stream never emits `drain`, and
 * pipeline tears every stage down instead of hanging.
 */
async function filterSqlFile(
  inputPath: string,
  outputPath: string,
  backupType: BackupType
): Promise<void> {
  const filter = createRestoreLineFilter(backupType);
  await pipeline(
    fs.createReadStream(inputPath, { encoding: "utf8" }),
    async function* (source: AsyncIterable<string>) {
      let pending = "";
      for await (const chunk of source) {
        const lines = (pending + chunk).split("\n");
        // split() always returns at least one element: the unfinished line.
        pending = lines.pop() as string;
        const kept = lines.map(filter).filter((line) => line !== null);
        if (kept.length > 0) yield `${kept.join("\n")}\n`;
      }
      if (pending) {
        const last = filter(pending);
        if (last !== null) yield `${last}\n`;
      }
    },
    fs.createWriteStream(outputPath, { encoding: "utf8" })
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

/**
 * Restore from a backup file already on disk. Every step streams from disk or
 * runs as a child process, so neither the file size nor the restore time is
 * bounded by Node's memory or blocks the event loop.
 */
export async function restoreDatabaseFromFile(
  filePath: string,
  fileName: string
): Promise<RestoreResult> {
  const { fileType, backupType } = await classifyBackupFile(fileName, filePath);
  const pg = resolvePgConnection();
  const env = pgEnv(pg);
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "groovenet-restore-work-"));

  try {
    if (backupType === "data-only") {
      await runCommand("npm", ["run", "migrate", "up"], { env });
    }

    const cleanPath = path.join(workDir, "restore-clean.sql");
    await fs.promises.writeFile(cleanPath, `${buildRestorePrepSql(backupType, pg.user)}\n`);
    await runCommand(
      "psql",
      [...pgConnectionArgs(pg), "-v", "ON_ERROR_STOP=1", "-f", cleanPath],
      { env }
    );

    if (fileType === "dump") {
      // Restore into the public schema the prep step just rebuilt, skipping the
      // archive's own entry for it (see withoutPublicSchemaEntry).
      const listPath = path.join(workDir, "restore.list");
      await runCommand("pg_restore", ["-l", "-f", listPath, filePath], { env });
      const filteredListPath = path.join(workDir, "restore-filtered.list");
      await fs.promises.writeFile(
        filteredListPath,
        withoutPublicSchemaEntry(await fs.promises.readFile(listPath, "utf8"))
      );
      await runCommand(
        "pg_restore",
        [
          ...pgConnectionArgs(pg),
          "--single-transaction",
          "--no-owner",
          "--no-acl",
          "-L",
          filteredListPath,
          filePath,
        ],
        { env }
      );
    } else {
      const filteredPath = path.join(workDir, "restore-filtered.sql");
      await filterSqlFile(filePath, filteredPath, backupType);
      await runCommand(
        "psql",
        [
          ...pgConnectionArgs(pg),
          "--single-transaction",
          "-v",
          "ON_ERROR_STOP=1",
          "-q",
          "-f",
          filteredPath,
        ],
        { env }
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
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

/** Stream an uploaded backup to a temp file, then restore from it. */
export async function restoreDatabaseFromStream(
  body: ReadableStream<Uint8Array>,
  fileName: string
): Promise<RestoreResult> {
  const uploadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "groovenet-restore-"));
  try {
    const uploadPath = path.join(
      uploadDir,
      backupFileType(fileName) === "dump" ? "restore.dump" : "restore.sql"
    );
    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      fs.createWriteStream(uploadPath)
    );
    return await restoreDatabaseFromFile(uploadPath, fileName);
  } finally {
    await fs.promises.rm(uploadDir, { recursive: true, force: true });
  }
}
