import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";

let tmpDir: string;
let service: any;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-policy-test-"));
  // Spy before resetting modules so the fresh import picks up the mocked cwd
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.resetModules();
  const { BackupPolicyService } = await import("../backupPolicyService");
  service = new BackupPolicyService();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const policyPath = () => path.join(tmpDir, "config", "backup-policy.yml");

describe("BackupPolicyService.getPolicy()", () => {
  it("creates and returns a default policy when no file exists", () => {
    const policy = service.getPolicy();

    expect(policy.enabled).toBe(false);
    expect(policy.provider).toBe("restic-b2");
    expect(policy.schedule_cron).toBe("0 */6 * * *");
    expect(policy.retention_preset).toBe("balanced");
    // The remote keeps AAC but not lossless; the local disk is lossless only.
    expect(policy.remote).toEqual({
      enabled: true,
      include_database: true,
      include_album_covers: true,
      include_aac_audio: true,
      include_lossless_audio: false,
    });
    expect(policy.local).toEqual({
      enabled: true,
      include_database: false,
      include_album_covers: false,
      include_aac_audio: false,
      include_lossless_audio: true,
    });
    expect(policy.include_discogs_exports).toBe(true);
    expect(policy.include_essentia_files).toBe(true);
    expect(policy.include_uploads).toBe(false);
    expect(typeof policy.updated_at).toBe("string");
  });

  it("writes the policy file on first call", () => {
    service.getPolicy();
    expect(fs.existsSync(policyPath())).toBe(true);
  });

  it("reads back a previously written policy", () => {
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    const written = {
      enabled: true,
      provider: "restic-b2",
      schedule_cron: "0 2 * * *",
      retention_preset: "archive",
      include_database: true,
      include_audio_files: false,
      include_album_covers: false,
      include_discogs_exports: false,
      include_essentia_files: false,
      include_uploads: true,
      updated_at: "2024-06-01T00:00:00.000Z",
    };
    fs.writeFileSync(policyPath(), yaml.stringify(written), "utf8");

    const policy = service.getPolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.schedule_cron).toBe("0 2 * * *");
    expect(policy.retention_preset).toBe("archive");
    // A file from before targets existed: its flat choices become the remote's.
    expect(policy.remote).toMatchObject({
      include_database: true,
      include_aac_audio: false,
      include_album_covers: false,
      include_lossless_audio: false,
    });
    expect(policy.include_discogs_exports).toBe(false);
    expect(policy.include_essentia_files).toBe(false);
    expect(policy.include_uploads).toBe(true);
    expect(policy.updated_at).toBe("2024-06-01T00:00:00.000Z");
  });

  it("reads an existing install's flat file as the remote, with lossless now excluded", () => {
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      policyPath(),
      yaml.stringify({
        enabled: true,
        provider: "restic-b2",
        include_database: true,
        include_audio_files: true,
        include_album_covers: true,
      }),
      "utf8",
    );
    const policy = service.getPolicy();
    expect(policy.remote).toMatchObject({ include_aac_audio: true, include_lossless_audio: false });
    // Nothing flat is carried forward.
    expect(policy).not.toHaveProperty("include_audio_files");
  });

  it("reads nested target choices, which win over legacy keys", () => {
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      policyPath(),
      yaml.stringify({
        include_audio_files: false,
        remote: { enabled: false, include_aac_audio: true, include_lossless_audio: true },
        local: { include_database: true, include_aac_audio: true },
      }),
      "utf8",
    );
    const policy = service.getPolicy();
    expect(policy.remote).toMatchObject({
      enabled: false,
      include_aac_audio: true,
      include_lossless_audio: true,
    });
    expect(policy.local).toMatchObject({
      enabled: true,
      include_database: true,
      include_aac_audio: true,
      include_lossless_audio: true,
    });
  });

  it("falls back to a current timestamp when updated_at is absent in the file", () => {
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    const withoutUpdatedAt = {
      enabled: false,
      provider: "restic-b2",
      schedule_cron: "0 */6 * * *",
      retention_preset: "balanced",
      include_database: true,
      include_audio_files: true,
      include_album_covers: true,
      include_discogs_exports: true,
      include_essentia_files: true,
      include_uploads: false,
    };
    fs.writeFileSync(policyPath(), yaml.stringify(withoutUpdatedAt), "utf8");

    const policy = service.getPolicy();
    const ts = new Date(policy.updated_at).getTime();
    // Should be a recent timestamp, not the epoch
    expect(ts).toBeGreaterThan(Date.now() - 5000);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it("throws when the policy file contains an invalid provider", () => {
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      policyPath(),
      yaml.stringify({ provider: "s3-bad", retention_preset: "balanced" }),
      "utf8",
    );
    expect(() => service.getPolicy()).toThrow("Invalid backup provider");
  });

  it("throws when the policy file contains an invalid retention preset", () => {
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.writeFileSync(
      policyPath(),
      yaml.stringify({ provider: "restic-b2", retention_preset: "forever" }),
      "utf8",
    );
    expect(() => service.getPolicy()).toThrow("Invalid retention preset");
  });
});

describe("BackupPolicyService.updatePolicy()", () => {
  it("persists a partial update and returns the merged policy", () => {
    service.getPolicy(); // initialise defaults
    const updated = service.updatePolicy({ enabled: true, schedule_cron: "0 3 * * *" });

    expect(updated.enabled).toBe(true);
    expect(updated.schedule_cron).toBe("0 3 * * *");
    // unchanged defaults preserved
    expect(updated.provider).toBe("restic-b2");
    expect(updated.retention_preset).toBe("balanced");
  });

  it("updates updated_at on every call", async () => {
    const first = service.getPolicy();
    await new Promise((r) => setTimeout(r, 5));
    const second = service.updatePolicy({ enabled: true });

    expect(new Date(second.updated_at).getTime()).toBeGreaterThan(
      new Date(first.updated_at).getTime(),
    );
  });

  it("persists so the next getPolicy() reflects the update", () => {
    service.updatePolicy({ enabled: true, retention_preset: "aggressive" });
    const reread = service.getPolicy();

    expect(reread.enabled).toBe(true);
    expect(reread.retention_preset).toBe("aggressive");
  });

  it("throws when schedule_cron is set to a whitespace-only string", () => {
    service.getPolicy();
    expect(() => service.updatePolicy({ schedule_cron: "   " })).toThrow(
      "schedule_cron cannot be empty",
    );
  });

  it("throws when provider is invalid", () => {
    service.getPolicy();
    expect(() => service.updatePolicy({ provider: "bad-provider" as never })).toThrow(
      "Invalid backup provider",
    );
  });

  it("throws when retention_preset is invalid", () => {
    service.getPolicy();
    expect(() => service.updatePolicy({ retention_preset: "never" as never })).toThrow(
      "Invalid retention preset",
    );
  });

  it("merges a partial target update without touching the other target", () => {
    service.getPolicy();
    const updated = service.updatePolicy({
      local: { include_aac_audio: true },
      remote: { include_lossless_audio: true },
    });
    expect(updated.local).toMatchObject({ include_aac_audio: true, include_lossless_audio: true });
    expect(updated.remote).toMatchObject({ include_lossless_audio: true, include_aac_audio: true });
    expect(service.getPolicy().local.include_aac_audio).toBe(true);
  });

  it("maps flat keys from an older client onto the remote and does not persist them", () => {
    service.getPolicy();
    const updated = service.updatePolicy({
      include_database: false,
      include_album_covers: false,
      include_audio_files: false,
      include_uploads: true,
    } as never);
    expect(updated.remote).toMatchObject({
      include_database: false,
      include_album_covers: false,
      include_aac_audio: false,
    });
    expect(updated.include_uploads).toBe(true);
    const written = yaml.parse(fs.readFileSync(policyPath(), "utf8"));
    expect(written).not.toHaveProperty("include_audio_files");
    expect(written).not.toHaveProperty("include_database");
  });

  it("trims whitespace from schedule_cron", () => {
    service.getPolicy();
    const updated = service.updatePolicy({ schedule_cron: "  0 1 * * *  " });
    expect(updated.schedule_cron).toBe("0 1 * * *");
  });
});
