import { describe, expect, it } from "vitest";
import {
  BACKUP_PROVIDERS,
  BACKUP_RETENTION_PRESETS,
  backupListResponseSchema,
  backupPolicyUpdateSchema,
  backupStatusSchema,
} from "./backups.js";

describe("backup contracts", () => {
  it("publishes the provider and retention enums", () => {
    expect(BACKUP_PROVIDERS).toEqual(["restic-b2"]);
    expect(BACKUP_RETENTION_PRESETS).toEqual(["aggressive", "balanced", "archive"]);
  });

  it("keeps policy updates permissive and validates known fields", () => {
    expect(backupPolicyUpdateSchema.parse({ enabled: true, future_option: "kept" })).toEqual({
      enabled: true,
      future_option: "kept",
    });
    expect(backupPolicyUpdateSchema.safeParse({ provider: "unknown" }).success).toBe(false);
  });

  it("preserves additional backup wire fields", () => {
    const list = backupListResponseSchema.parse({
      files: ["backup.dump"],
      backups: [{ filename: "backup.dump", size_bytes: 12, modified_at: "now", future: true }],
    });
    expect(list.backups[0].future).toBe(true);
    expect(
      backupStatusSchema.parse({
        started_at: "now",
        finished_at: "now",
        stored_at: "now",
        status: "success",
        reason: "ok",
        backed_up_paths: [],
        snapshot: null,
        worker_field: 1,
      }),
    ).toHaveProperty("worker_field", 1);
  });
});
