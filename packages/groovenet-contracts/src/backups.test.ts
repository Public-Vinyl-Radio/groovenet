import { describe, expect, it } from "vitest";
import {
  BACKUP_PROVIDERS,
  BACKUP_TARGETS,
  BACKUP_RETENTION_PRESETS,
  backupListResponseSchema,
  backupHealthResponseSchema,
  backupPolicyUpdateSchema,
  backupStatusGetResponseSchema,
  backupStatusRunResponseSchema,
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

  it("validates per-target policy updates and keeps unknown target fields", () => {
    expect(
      backupPolicyUpdateSchema.parse({
        remote: { include_lossless_audio: false, future: 1 },
        local: { enabled: true },
      }),
    ).toEqual({
      remote: { include_lossless_audio: false, future: 1 },
      local: { enabled: true },
    });
    expect(
      backupPolicyUpdateSchema.safeParse({ local: { include_lossless_audio: "yes" } }).success,
    ).toBe(false);
    expect(BACKUP_TARGETS).toEqual(["remote", "local"]);
  });

  it("carries an optional local target in the status response", () => {
    const status = {
      started_at: "a",
      finished_at: "b",
      stored_at: "c",
      status: "failed",
      reason: "mount-marker-missing",
      backed_up_paths: [],
      snapshot: null,
      error: "no marker",
    };
    const health = { healthy: false, status: "unhealthy", reason: "backup-failed" };
    expect(backupStatusGetResponseSchema.parse({ status: null }).local).toBeUndefined();
    expect(
      backupStatusGetResponseSchema.parse({ status: null, local: { status, health } }).local
        ?.health,
    ).toEqual(health);
    expect(
      backupStatusRunResponseSchema.parse({ status, local: { status } }).local?.status,
    ).toEqual(status);
    expect(
      backupHealthResponseSchema.parse({
        status: "unhealthy",
        local: { healthy: false, status: "unhealthy" },
      }).local?.healthy,
    ).toBe(false);
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
