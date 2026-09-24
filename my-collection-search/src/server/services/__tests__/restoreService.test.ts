import { describe, expect, it } from "vitest";
import {
  buildRestorePrepSql,
  classifyBackup,
  tolerateExistingPublicSchema,
} from "../restoreService";

describe("classifyBackup()", () => {
  it("classifies custom dumps as schema+data", () => {
    const result = classifyBackup("backup.dump", Buffer.from("ignored"));
    expect(result).toEqual({ fileType: "dump", backupType: "schema+data" });
  });

  it("detects schema-bearing sql backups", () => {
    const result = classifyBackup(
      "backup.sql",
      Buffer.from("CREATE TABLE tracks (id int);\n")
    );
    expect(result).toEqual({ fileType: "sql", backupType: "schema+data" });
  });

  it("detects data-only sql backups", () => {
    const result = classifyBackup(
      "backup.sql",
      Buffer.from("COPY public.tracks (track_id) FROM stdin;\n")
    );
    expect(result).toEqual({ fileType: "sql", backupType: "data-only" });
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

describe("tolerateExistingPublicSchema()", () => {
  it("makes the dump's CREATE SCHEMA public idempotent", () => {
    const sql = "SET x;\nCREATE SCHEMA public;\nALTER SCHEMA public OWNER TO pg_database_owner;\n";
    expect(tolerateExistingPublicSchema(sql)).toBe(
      "SET x;\nCREATE SCHEMA IF NOT EXISTS public;\nALTER SCHEMA public OWNER TO pg_database_owner;\n"
    );
  });
});
