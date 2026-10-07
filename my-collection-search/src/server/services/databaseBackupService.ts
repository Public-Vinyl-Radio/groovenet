import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// The app image installs the client tools from the PostgreSQL 16 packages.
export const PG_DUMP_BIN = "/usr/lib/postgresql/16/bin/pg_dump";

// Only plain names with one of these extensions are served or deleted. `.sql`
// covers the plain-format backups made before #459.
const BACKUP_EXTENSIONS = new Set([".dump", ".sql"]);
const PARTIAL_SUFFIX = ".partial";
const STDERR_TAIL_BYTES = 8 * 1024;

export type PgConnection = {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
};

export type BackupFile = {
  filename: string;
  size_bytes: number;
  modified_at: string;
};

export function getBackupDir(): string {
  return path.resolve(process.cwd(), "dumps");
}

// DATABASE_URL wins over the discrete POSTGRES_* variables, field by field.
export function resolvePgConnection(
  env: Record<string, string | undefined> = process.env
): PgConnection {
  // Empty URL parts fall through to the POSTGRES_* variables below.
  let fromUrl: Partial<PgConnection> = {};
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      fromUrl = {
        host: url.hostname,
        port: url.port,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ""),
      };
    } catch {
      // Fall back to the discrete variables.
    }
  }

  const connection = {
    host: fromUrl.host || env.POSTGRES_HOST || "localhost",
    port: fromUrl.port || env.POSTGRES_PORT || "5432",
    user: fromUrl.user || env.POSTGRES_USER || "",
    password: fromUrl.password || env.POSTGRES_PASSWORD || "",
    database: fromUrl.database || env.POSTGRES_DB || "",
  };
  if (!connection.user || !connection.database) {
    throw new Error("Database connection info not available");
  }
  return connection;
}

export function pgConnectionArgs(pg: PgConnection): string[] {
  return ["-h", pg.host, "-p", pg.port, "-U", pg.user, "-d", pg.database];
}

// The password travels in the environment only, never in argv or logs.
export function pgEnv(pg: PgConnection): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: pg.password };
}

/**
 * Run a command to completion without buffering its output. Resolves on exit
 * code 0; otherwise rejects with the tail of stderr, which is what explains a
 * pg_dump or psql failure.
 */
export function runCommand(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = Buffer.alloc(0);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > STDERR_TAIL_BYTES) {
        stderr = stderr.subarray(stderr.length - STDERR_TAIL_BYTES);
      }
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const name = path.basename(command);
      const status = signal ? `signal ${signal}` : `code ${code}`;
      const detail = stderr.toString("utf8").trim();
      reject(new Error(`${name} exited with ${status}${detail ? `: ${detail}` : ""}`));
    });
  });
}

/**
 * Dump the public schema in custom format straight to `outPath`. pg_dump writes
 * the file itself, so the dump never passes through Node's memory (#459). It
 * writes to a `.partial` sibling that is renamed on success and removed on
 * failure, so a half-written dump is never listed or served.
 */
export async function runPgDump(outPath: string, pg: PgConnection = resolvePgConnection()) {
  const partialPath = `${outPath}${PARTIAL_SUFFIX}`;
  try {
    await runCommand(
      PG_DUMP_BIN,
      [...pgConnectionArgs(pg), "-F", "c", "--no-acl", "-n", "public", "-f", partialPath],
      { env: pgEnv(pg) }
    );
    await fs.promises.rename(partialPath, outPath);
  } catch (error) {
    await fs.promises.rm(partialPath, { force: true });
    throw error;
  }
}

/** Create a new custom-format backup in the backups directory. */
export async function createBackup(
  options: { prefix?: string; now?: Date } = {}
): Promise<{ filename: string; path: string }> {
  const dir = getBackupDir();
  await fs.promises.mkdir(dir, { recursive: true });

  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const unique = Math.floor(Math.random() * 1e6);
  const filename = `${options.prefix ?? "pg-backup"}-${stamp}-${unique}.dump`;
  const outPath = path.join(dir, filename);

  await runPgDump(outPath);
  return { filename, path: outPath };
}

/** Backup files, newest first. */
export async function listBackups(): Promise<BackupFile[]> {
  const dir = getBackupDir();
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: BackupFile[] = [];
  for (const name of names) {
    if (!BACKUP_EXTENSIONS.has(path.extname(name))) continue;
    const stat = await fs.promises.stat(path.join(dir, name));
    if (!stat.isFile()) continue;
    files.push({
      filename: name,
      size_bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    });
  }
  return files.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
}

/**
 * Map a user-supplied filename to a path in the backups directory, or null if
 * it is not a plain backup filename (path traversal, hidden or partial files).
 */
export function resolveBackupPath(filename: string): string | null {
  if (!filename || path.basename(filename) !== filename || filename.startsWith(".")) {
    return null;
  }
  if (!BACKUP_EXTENSIONS.has(path.extname(filename))) return null;
  return path.join(getBackupDir(), filename);
}

export async function deleteBackup(
  filename: string
): Promise<"deleted" | "not-found" | "invalid"> {
  const filePath = resolveBackupPath(filename);
  if (!filePath) return "invalid";
  try {
    await fs.promises.unlink(filePath);
    return "deleted";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "not-found";
    throw error;
  }
}
