import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunCommand, mockDbQuery } = vi.hoisted(() => ({
  mockRunCommand: vi.fn(),
  mockDbQuery: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ dbQuery: mockDbQuery }));
vi.mock("@/server/services/databaseBackupService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/databaseBackupService")>()),
  runCommand: mockRunCommand,
}));

import {
  backupFileType,
  buildRestorePrepSql,
  classifyBackupFile,
  createRestoreLineFilter,
  withoutPublicSchemaEntry,
  restoreDatabaseFromFile,
  restoreDatabaseFromStream,
  sqlBackupHasSchema,
} from "../restoreService";

let tmpDir: string;

function writeTmp(name: string, content: string): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, content);
  return file;
}

function filterAll(backupType: "schema+data" | "data-only", lines: string[]): string[] {
  const filter = createRestoreLineFilter(backupType);
  return lines.map(filter).filter((line): line is string => line !== null);
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new Blob([text]).stream();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-service-test-"));
  vi.stubEnv("DATABASE_URL", "postgres://djplaylist:secret@db:5432/app");
  // `pg_restore -l -f <list>` writes the archive listing the restore reads back.
  mockRunCommand.mockReset().mockImplementation(async (command: string, args: string[]) => {
    if (command === "pg_restore" && args[0] === "-l") fs.writeFileSync(args[2], "");
  });
  mockDbQuery.mockReset().mockResolvedValue({ rows: [{ count: "3" }] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("backupFileType()", () => {
  it.each([
    ["a.dump", "dump"],
    ["a.BACKUP", "dump"],
    ["a.sql", "sql"],
    ["a", "sql"],
  ])("%s is %s", (name, type) => {
    expect(backupFileType(name)).toBe(type);
  });
});

describe("sqlBackupHasSchema()", () => {
  it("detects schema statements", async () => {
    expect(await sqlBackupHasSchema(writeTmp("a.sql", "SET x;\nCREATE TABLE t (id int);\n"))).toBe(true);
  });

  it("reports data-only files", async () => {
    expect(
      await sqlBackupHasSchema(writeTmp("a.sql", "COPY public.tracks (id) FROM stdin;\n1\n\\.\n"))
    ).toBe(false);
  });

  it("finds a marker split across read chunks", async () => {
    // fs read streams default to 64 KiB chunks; straddle the first boundary.
    const padding = "-".repeat(64 * 1024 - 6);
    expect(await sqlBackupHasSchema(writeTmp("a.sql", `${padding}CREATE TABLE t ();\n`))).toBe(true);
  });
});

describe("classifyBackupFile()", () => {
  it("treats custom dumps as schema+data without reading them", async () => {
    await expect(classifyBackupFile("backup.dump", "/does/not/exist")).resolves.toEqual({
      fileType: "dump",
      backupType: "schema+data",
    });
  });

  it("classifies sql by content", async () => {
    await expect(
      classifyBackupFile("backup.sql", writeTmp("a.sql", "ALTER TABLE t ADD c int;\n"))
    ).resolves.toEqual({ fileType: "sql", backupType: "schema+data" });
    await expect(
      classifyBackupFile("backup.sql", writeTmp("b.sql", "INSERT INTO t VALUES (1);\n"))
    ).resolves.toEqual({ fileType: "sql", backupType: "data-only" });
  });
});

describe("buildRestorePrepSql()", () => {
  it("uses TRUNCATE for data-only restores", () => {
    const sql = buildRestorePrepSql("data-only", "djplaylist");
    expect(sql).toContain("TRUNCATE TABLE");
    expect(sql).toContain("tablename <> 'pgmigrations'");
    expect(sql).not.toContain("DROP SCHEMA");
  });

  it("recreates public with its extensions for schema+data restores", () => {
    const sql = buildRestorePrepSql("schema+data", "djplaylist");
    // The app role is the bootstrap superuser, so DROP OWNED always fails.
    expect(sql).not.toContain("DROP OWNED");
    expect(sql).toContain("DROP SCHEMA IF EXISTS public CASCADE;");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS %I SCHEMA public");
    expect(sql).toContain('GRANT ALL ON SCHEMA public TO "djplaylist";');
  });
});

describe("withoutPublicSchemaEntry()", () => {
  it("drops only the public schema entry", () => {
    const list = [
      ";     Format: CUSTOM",
      "7; 2615 16385 SCHEMA - public djplaylist",
      "8; 2615 16400 SCHEMA - public_archive djplaylist",
      "4120; 0 0 COMMENT - SCHEMA public djplaylist",
      "218; 1259 16825 TABLE public friends djplaylist",
    ].join("\n");
    expect(withoutPublicSchemaEntry(list)).toBe(
      [
        ";     Format: CUSTOM",
        "8; 2615 16400 SCHEMA - public_archive djplaylist",
        "4120; 0 0 COMMENT - SCHEMA public djplaylist",
        "218; 1259 16825 TABLE public friends djplaylist",
      ].join("\n")
    );
  });
});

describe("createRestoreLineFilter()", () => {
  it("makes the dump's CREATE SCHEMA public idempotent", () => {
    expect(
      filterAll("schema+data", [
        "SET x;",
        "CREATE SCHEMA public;",
        "ALTER SCHEMA public OWNER TO pg_database_owner;",
      ])
    ).toEqual([
      "SET x;",
      "CREATE SCHEMA IF NOT EXISTS public;",
      "ALTER SCHEMA public OWNER TO pg_database_owner;",
    ]);
  });

  it("never rewrites COPY data rows", () => {
    expect(
      filterAll("schema+data", [
        "COPY public.notes (body) FROM stdin;",
        "CREATE SCHEMA public;",
        "\\.",
        "CREATE SCHEMA public;",
      ])
    ).toEqual([
      "COPY public.notes (body) FROM stdin;",
      "CREATE SCHEMA public;",
      "\\.",
      "CREATE SCHEMA IF NOT EXISTS public;",
    ]);
  });

  it("drops pgmigrations COPY blocks from data-only backups", () => {
    expect(
      filterAll("data-only", [
        "COPY public.pgmigrations (id, name, run_on) FROM stdin;",
        "1\tinit\t2025-01-01",
        "\\.",
        "COPY public.tracks (id) FROM stdin;",
        "1",
        "\\.",
      ])
    ).toEqual([
      "-- COPY pgmigrations skipped",
      "COPY public.tracks (id) FROM stdin;",
      "1",
      "\\.",
    ]);
  });

  it("drops single- and multi-line pgmigrations INSERTs from data-only backups", () => {
    expect(
      filterAll("data-only", [
        "INSERT INTO public.pgmigrations VALUES (1, 'a');",
        "INSERT INTO public.pgmigrations VALUES",
        "  (2, 'b'),",
        "  (3, 'c');",
        "INSERT INTO public.tracks VALUES (1);",
        "CREATE SCHEMA public;",
      ])
    ).toEqual([
      "-- INSERT pgmigrations skipped",
      "-- INSERT pgmigrations skipped",
      "INSERT INTO public.tracks VALUES (1);",
      "CREATE SCHEMA public;",
    ]);
  });
});

describe("restoreDatabaseFromFile()", () => {
  it("rebuilds public, then restores a custom dump without its schema entry", async () => {
    let restoredList = "";
    mockRunCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command !== "pg_restore") return;
      if (args[0] === "-l") {
        fs.writeFileSync(
          args[2],
          "; Archive\n7; 2615 16385 SCHEMA - public djplaylist\n218; 1259 16825 TABLE public friends djplaylist\n"
        );
      } else {
        restoredList = fs.readFileSync(args[args.indexOf("-L") + 1], "utf8");
      }
    });

    const file = writeTmp("upload.dump", "PGDMP");
    const result = await restoreDatabaseFromFile(file, "backup.dump");

    const calls = mockRunCommand.mock.calls;
    expect(calls.map(([command]) => command)).toEqual(["psql", "pg_restore", "pg_restore"]);
    expect(calls[1][1]).toEqual(["-l", "-f", expect.stringMatching(/restore\.list$/), file]);
    const [, args, options] = calls[2];
    expect(args).toEqual([
      "-h", "db", "-p", "5432", "-U", "djplaylist", "-d", "app",
      "--single-transaction", "--no-owner", "--no-acl",
      "-L", expect.stringMatching(/restore-filtered\.list$/),
      file,
    ]);
    expect(args).not.toContain("--clean");
    expect(options.env.PGPASSWORD).toBe("secret");
    expect(restoredList).toBe("; Archive\n218; 1259 16825 TABLE public friends djplaylist\n");
    expect(result).toEqual({
      message: "Database schema and data restored successfully.",
      backupType: "schema+data",
      fileType: "dump",
      reindex: { albumsIndexed: 3, tracksIndexed: 3, warning: null },
    });
  });

  it("preps then restores a schema+data sql backup through the line filter", async () => {
    const seen: Record<string, string> = {};
    mockRunCommand.mockImplementation(async (_command: string, args: string[]) => {
      const file = args[args.indexOf("-f") + 1];
      seen[path.basename(file)] = fs.readFileSync(file, "utf8");
    });

    // No trailing newline, so the last line arrives as the generator's remainder.
    const file = writeTmp("upload.sql", "CREATE SCHEMA public;\nCREATE TABLE t (id int);");
    const result = await restoreDatabaseFromFile(file, "backup.sql");

    expect(mockRunCommand.mock.calls.map(([command]) => command)).toEqual(["psql", "psql"]);
    expect(seen["restore-clean.sql"]).toContain("DROP SCHEMA IF EXISTS public CASCADE;");
    expect(seen["restore-filtered.sql"]).toBe(
      "CREATE SCHEMA IF NOT EXISTS public;\nCREATE TABLE t (id int);\n"
    );
    expect(mockRunCommand.mock.calls[1][1]).toContain("--single-transaction");
    expect(result.backupType).toBe("schema+data");
    expect(result.fileType).toBe("sql");
  });

  it("migrates, truncates and strips pgmigrations for a data-only sql backup", async () => {
    const seen: Record<string, string> = {};
    mockRunCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command !== "psql") return;
      const file = args[args.indexOf("-f") + 1];
      seen[path.basename(file)] = fs.readFileSync(file, "utf8");
    });

    const file = writeTmp(
      "upload.sql",
      "COPY public.pgmigrations (id) FROM stdin;\n1\n\\.\nINSERT INTO public.pgmigrations VALUES (1);\n"
    );
    const result = await restoreDatabaseFromFile(file, "backup.sql");

    expect(mockRunCommand.mock.calls[0].slice(0, 2)).toEqual(["npm", ["run", "migrate", "up"]]);
    expect(seen["restore-clean.sql"]).toContain("TRUNCATE TABLE");
    expect(seen["restore-filtered.sql"]).toBe(
      "-- COPY pgmigrations skipped\n-- INSERT pgmigrations skipped\n"
    );
    expect(result.backupType).toBe("data-only");
  });

  it("keeps a line longer than one read chunk intact", async () => {
    const seen: string[] = [];
    mockRunCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command === "psql") seen.push(fs.readFileSync(args[args.indexOf("-f") + 1], "utf8"));
    });
    const longLine = `CREATE TABLE t (c text DEFAULT '${"x".repeat(100 * 1024)}');`;
    await restoreDatabaseFromFile(writeTmp("upload.sql", `${longLine}\n`), "backup.sql");
    expect(seen.at(-1)).toBe(`${longLine}\n`);
  });

  it("drops a final line the filter removes", async () => {
    const seen: string[] = [];
    mockRunCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command === "psql") seen.push(fs.readFileSync(args[args.indexOf("-f") + 1], "utf8"));
    });
    const file = writeTmp("upload.sql", "INSERT INTO public.pgmigrations VALUES\n  (1);");
    await restoreDatabaseFromFile(file, "backup.sql");
    expect(seen.at(-1)).toBe("-- INSERT pgmigrations skipped\n");
  });

  it("reports a reindex warning instead of failing the restore", async () => {
    mockDbQuery.mockRejectedValue(new Error("relation albums does not exist"));
    const result = await restoreDatabaseFromFile(writeTmp("u.dump", ""), "b.dump");
    expect(result.reindex).toEqual({
      albumsIndexed: 0,
      tracksIndexed: 0,
      warning: "relation albums does not exist",
    });
  });

  it("stringifies a non-Error reindex failure", async () => {
    mockDbQuery.mockRejectedValue("boom");
    const result = await restoreDatabaseFromFile(writeTmp("u.dump", ""), "b.dump");
    expect(result.reindex.warning).toBe("boom");
  });

  it("defaults missing counts to zero", async () => {
    mockDbQuery.mockResolvedValue({ rows: [] });
    const result = await restoreDatabaseFromFile(writeTmp("u.dump", ""), "b.dump");
    expect(result.reindex).toEqual({ albumsIndexed: 0, tracksIndexed: 0, warning: null });
  });

  it("propagates a failed restore command and still cleans up", async () => {
    const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("groovenet-restore-work-"));
    mockRunCommand.mockRejectedValue(new Error("pg_restore exited with code 1: bad archive"));
    await expect(restoreDatabaseFromFile(writeTmp("u.dump", ""), "b.dump")).rejects.toThrow(
      "bad archive"
    );
    const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("groovenet-restore-work-"));
    expect(after).toEqual(before);
  });
});

describe("restoreDatabaseFromStream()", () => {
  it("streams the upload to disk under the right extension, then restores it", async () => {
    let restoredPath = "";
    let restoredContent = "";
    mockRunCommand.mockImplementation(async (command: string, args: string[]) => {
      if (command !== "pg_restore") return;
      if (args[0] === "-l") fs.writeFileSync(args[2], "");
      restoredPath = args.at(-1)!;
      restoredContent = fs.readFileSync(restoredPath, "utf8");
    });

    const result = await restoreDatabaseFromStream(streamOf("PGDMP-bytes"), "backup.dump");

    expect(path.basename(restoredPath)).toBe("restore.dump");
    expect(restoredContent).toBe("PGDMP-bytes");
    expect(fs.existsSync(restoredPath)).toBe(false);
    expect(result.fileType).toBe("dump");
  });

  it("stores sql uploads as restore.sql", async () => {
    const result = await restoreDatabaseFromStream(streamOf("CREATE TABLE t ();\n"), "backup.sql");
    expect(result.fileType).toBe("sql");
  });
});
