import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));

import {
  PG_DUMP_BIN,
  createBackup,
  deleteBackup,
  getBackupDir,
  listBackups,
  resolveBackupPath,
  resolvePgConnection,
  runCommand,
  runPgDump,
} from "../databaseBackupService";

type FakeChild = EventEmitter & { stderr: EventEmitter };

/** A spawn stand-in: runs `behave` on the next tick, then exits with its result. */
function fakeSpawn(
  behave: (args: string[]) => { code?: number | null; signal?: string; stderr?: string; error?: Error }
) {
  mockSpawn.mockImplementation((_command: string, args: string[]) => {
    const child = new EventEmitter() as FakeChild;
    child.stderr = new EventEmitter();
    setImmediate(() => {
      const result = behave(args);
      if (result.error) {
        child.emit("error", result.error);
        return;
      }
      if (result.stderr) child.stderr.emit("data", Buffer.from(result.stderr));
      child.emit("close", result.code ?? null, result.signal ?? null);
    });
    return child;
  });
}

const pg = { host: "db", port: "5432", user: "u", password: "secret", database: "app" };

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-service-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  mockSpawn.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolvePgConnection()", () => {
  it("reads and decodes DATABASE_URL", () => {
    expect(
      resolvePgConnection({ DATABASE_URL: "postgres://us%40r:p%3Ass@host:6543/mydb" })
    ).toEqual({ host: "host", port: "6543", user: "us@r", password: "p:ss", database: "mydb" });
  });

  it("falls back to POSTGRES_* fields missing from the URL", () => {
    expect(
      resolvePgConnection({
        DATABASE_URL: "postgres://user@host/mydb",
        POSTGRES_PASSWORD: "pw",
        POSTGRES_PORT: "5433",
      })
    ).toEqual({ host: "host", port: "5433", user: "user", password: "pw", database: "mydb" });
  });

  it("uses POSTGRES_* when DATABASE_URL is absent or unparseable", () => {
    expect(
      resolvePgConnection({
        DATABASE_URL: "not a url",
        POSTGRES_USER: "user",
        POSTGRES_DB: "mydb",
      })
    ).toEqual({ host: "localhost", port: "5432", user: "user", password: "", database: "mydb" });
  });

  it("throws when user or database is missing", () => {
    expect(() => resolvePgConnection({ POSTGRES_USER: "user" })).toThrow(
      "Database connection info not available"
    );
    expect(() => resolvePgConnection({ POSTGRES_DB: "mydb" })).toThrow(
      "Database connection info not available"
    );
  });
});

describe("runCommand()", () => {
  it("resolves on exit code 0", async () => {
    fakeSpawn(() => ({ code: 0 }));
    await expect(runCommand("psql", ["-c", "select 1"])).resolves.toBeUndefined();
    expect(mockSpawn).toHaveBeenCalledWith("psql", ["-c", "select 1"], {
      env: process.env,
      stdio: ["ignore", "ignore", "pipe"],
    });
  });

  it("rejects with the exit code and stderr", async () => {
    fakeSpawn(() => ({ code: 1, stderr: "connection refused\n" }));
    await expect(runCommand("/usr/bin/psql", [])).rejects.toThrow(
      "psql exited with code 1: connection refused"
    );
  });

  it("keeps only the tail of a long stderr", async () => {
    fakeSpawn(() => ({ code: 2, stderr: `${"x".repeat(20_000)}END` }));
    const error = await runCommand("pg_dump", []).catch((e: Error) => e);
    expect((error as Error).message.endsWith("END")).toBe(true);
    expect((error as Error).message.length).toBeLessThan(9_000);
  });

  it("reports a signal, with no stderr", async () => {
    fakeSpawn(() => ({ signal: "SIGKILL" }));
    await expect(runCommand("pg_dump", [])).rejects.toThrow(/^pg_dump exited with signal SIGKILL$/);
  });

  it("rejects when the process cannot start", async () => {
    fakeSpawn(() => ({ error: new Error("spawn pg_dump ENOENT") }));
    await expect(runCommand("pg_dump", [])).rejects.toThrow("spawn pg_dump ENOENT");
  });
});

describe("runPgDump()", () => {
  it("has pg_dump write a partial file, then renames it", async () => {
    fakeSpawn((args) => {
      fs.writeFileSync(args[args.indexOf("-f") + 1], "dump-bytes");
      return { code: 0 };
    });

    const outPath = path.join(tmpDir, "out.dump");
    await runPgDump(outPath, pg);

    const [command, args, options] = mockSpawn.mock.calls[0];
    expect(command).toBe(PG_DUMP_BIN);
    expect(args).toEqual([
      "-h", "db", "-p", "5432", "-U", "u", "-d", "app",
      "-F", "c", "--no-acl", "-n", "public", "-f", `${outPath}.partial`,
    ]);
    expect(args.join(" ")).not.toContain("secret");
    expect(options.env.PGPASSWORD).toBe("secret");
    expect(fs.readFileSync(outPath, "utf8")).toBe("dump-bytes");
    expect(fs.existsSync(`${outPath}.partial`)).toBe(false);
  });

  it("removes the partial file and rethrows when pg_dump fails", async () => {
    fakeSpawn((args) => {
      fs.writeFileSync(args[args.indexOf("-f") + 1], "half a dump");
      return { code: 1, stderr: "pg_dump: error: query failed" };
    });

    const outPath = path.join(tmpDir, "out.dump");
    await expect(runPgDump(outPath, pg)).rejects.toThrow("pg_dump: error: query failed");
    expect(fs.existsSync(`${outPath}.partial`)).toBe(false);
    expect(fs.existsSync(outPath)).toBe(false);
  });

  it("resolves the connection from the environment by default", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://envuser:pw@envhost:5432/envdb");
    fakeSpawn((args) => {
      fs.writeFileSync(args[args.indexOf("-f") + 1], "");
      return { code: 0 };
    });
    await runPgDump(path.join(tmpDir, "out.dump"));
    expect(mockSpawn.mock.calls[0][1]).toContain("envhost");
    vi.unstubAllEnvs();
  });
});

describe("createBackup()", () => {
  it("creates the backups directory and a timestamped custom dump", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:pw@db:5432/app");
    fakeSpawn((args) => {
      fs.writeFileSync(args[args.indexOf("-f") + 1], "dump");
      return { code: 0 };
    });

    const result = await createBackup({
      prefix: "pg-backup-restic",
      now: new Date("2026-10-07T12:34:56.789Z"),
    });

    expect(result.filename).toMatch(/^pg-backup-restic-2026-10-07T12-34-56-789Z-\d+\.dump$/);
    expect(result.path).toBe(path.join(getBackupDir(), result.filename));
    expect(fs.readFileSync(result.path, "utf8")).toBe("dump");
    vi.unstubAllEnvs();
  });

  it("defaults the prefix to pg-backup", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://u:pw@db:5432/app");
    fakeSpawn((args) => {
      fs.writeFileSync(args[args.indexOf("-f") + 1], "");
      return { code: 0 };
    });
    const { filename } = await createBackup();
    expect(filename).toMatch(/^pg-backup-\d{4}-/);
    vi.unstubAllEnvs();
  });
});

describe("listBackups()", () => {
  it("returns an empty list when the directory does not exist", async () => {
    await expect(listBackups()).resolves.toEqual([]);
  });

  it("rethrows other readdir errors", async () => {
    fs.writeFileSync(path.join(tmpDir, "dumps"), "not a directory");
    await expect(listBackups()).rejects.toThrow();
  });

  it("lists .dump and .sql files newest first, skipping everything else", async () => {
    const dir = getBackupDir();
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "old.sql"), "abc");
    fs.writeFileSync(path.join(dir, "new.dump"), "abcdef");
    fs.writeFileSync(path.join(dir, "writing.dump.partial"), "");
    fs.writeFileSync(path.join(dir, ".backup-run.lock"), "");
    fs.mkdirSync(path.join(dir, "folder.dump"));
    fs.utimesSync(path.join(dir, "old.sql"), new Date("2026-01-01"), new Date("2026-01-01"));
    fs.utimesSync(path.join(dir, "new.dump"), new Date("2026-02-01"), new Date("2026-02-01"));

    await expect(listBackups()).resolves.toEqual([
      { filename: "new.dump", size_bytes: 6, modified_at: "2026-02-01T00:00:00.000Z" },
      { filename: "old.sql", size_bytes: 3, modified_at: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});

describe("resolveBackupPath()", () => {
  it("accepts plain backup filenames", () => {
    expect(resolveBackupPath("a.dump")).toBe(path.join(getBackupDir(), "a.dump"));
    expect(resolveBackupPath("a.sql")).toBe(path.join(getBackupDir(), "a.sql"));
  });

  it.each(["", "../a.dump", "sub/a.dump", ".hidden.dump", "a.dump.partial", "a.txt"])(
    "rejects %j",
    (filename) => {
      expect(resolveBackupPath(filename)).toBeNull();
    }
  );
});

describe("deleteBackup()", () => {
  it("deletes an existing backup", async () => {
    fs.mkdirSync(getBackupDir());
    const file = path.join(getBackupDir(), "a.dump");
    fs.writeFileSync(file, "");
    await expect(deleteBackup("a.dump")).resolves.toBe("deleted");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("reports a missing backup", async () => {
    await expect(deleteBackup("missing.dump")).resolves.toBe("not-found");
  });

  it("refuses an invalid filename", async () => {
    await expect(deleteBackup("../etc/passwd.sql")).resolves.toBe("invalid");
  });

  it("rethrows other unlink errors", async () => {
    fs.mkdirSync(path.join(getBackupDir(), "dir.dump"), { recursive: true });
    await expect(deleteBackup("dir.dump")).rejects.toThrow();
  });
});
