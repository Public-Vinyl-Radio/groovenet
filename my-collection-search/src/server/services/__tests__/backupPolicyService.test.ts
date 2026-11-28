import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupPolicyService } from "../backupPolicyService";

const repo = vi.hoisted(() => ({
  findBackupPolicy: vi.fn(),
  upsertBackupPolicy: vi.fn(),
}));

vi.mock("@/server/repositories/settingsRepository", () => ({ settingsRepository: repo }));

const SAVED_AT = new Date("2026-11-27T12:00:00.000Z");
let stored: { policy: unknown; updated_at: Date } | null;

beforeEach(() => {
  vi.resetAllMocks();
  stored = null;
  repo.findBackupPolicy.mockImplementation(async () => stored);
  repo.upsertBackupPolicy.mockImplementation(async (policy: unknown) => {
    stored = { policy, updated_at: SAVED_AT };
    return stored;
  });
});

const service = new BackupPolicyService();
const save = (policy: unknown, updated_at = new Date("2024-06-01T00:00:00.000Z")) => {
  stored = { policy, updated_at };
};

describe("BackupPolicyService.getPolicy()", () => {
  it("returns the default policy, without writing, before anything is saved", async () => {
    const policy = await service.getPolicy();

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
    expect(policy.updated_at).toBe(new Date(0).toISOString());
    expect(repo.upsertBackupPolicy).not.toHaveBeenCalled();
  });

  it("reads back the saved policy with the row's updated_at", async () => {
    save({
      enabled: true,
      provider: "restic-b2",
      schedule_cron: "0 2 * * *",
      retention_preset: "archive",
      include_discogs_exports: false,
      include_essentia_files: false,
      include_uploads: true,
      remote: { enabled: false, include_database: true },
      local: { include_aac_audio: true },
    });

    const policy = await service.getPolicy();
    expect(policy.enabled).toBe(true);
    expect(policy.schedule_cron).toBe("0 2 * * *");
    expect(policy.retention_preset).toBe("archive");
    expect(policy.remote).toMatchObject({ enabled: false, include_database: true });
    expect(policy.local).toMatchObject({ include_aac_audio: true, include_lossless_audio: true });
    expect(policy.include_discogs_exports).toBe(false);
    expect(policy.include_essentia_files).toBe(false);
    expect(policy.include_uploads).toBe(true);
    expect(policy.updated_at).toBe("2024-06-01T00:00:00.000Z");
  });

  it("reads flat keys from before targets existed as the remote's, with lossless excluded", async () => {
    save({
      enabled: true,
      provider: "restic-b2",
      include_database: false,
      include_audio_files: true,
      include_album_covers: false,
    });
    const policy = await service.getPolicy();
    expect(policy.remote).toMatchObject({
      include_database: false,
      include_aac_audio: true,
      include_album_covers: false,
      include_lossless_audio: false,
    });
    expect(policy).not.toHaveProperty("include_audio_files");
  });

  it("prefers nested target choices over legacy keys", async () => {
    save({ include_audio_files: false, remote: { include_aac_audio: true } });
    expect((await service.getPolicy()).remote.include_aac_audio).toBe(true);
  });

  it("falls back to the default schedule when the stored one is blank", async () => {
    save({ schedule_cron: "   " });
    expect((await service.getPolicy()).schedule_cron).toBe("0 */6 * * *");
  });

  it("throws when the stored policy has an invalid provider", async () => {
    save({ provider: "s3-bad" });
    await expect(service.getPolicy()).rejects.toThrow("Invalid backup provider");
  });

  it("throws when the stored policy has an invalid retention preset", async () => {
    save({ retention_preset: "forever" });
    await expect(service.getPolicy()).rejects.toThrow("Invalid retention preset");
  });

  it("treats a stored value that is not an object as empty", async () => {
    save(null);
    expect((await service.getPolicy()).enabled).toBe(false);
  });
});

describe("BackupPolicyService.updatePolicy()", () => {
  it("merges a partial update, saves it without updated_at and returns the saved time", async () => {
    const updated = await service.updatePolicy({ enabled: true, schedule_cron: "0 3 * * *" });

    expect(updated.enabled).toBe(true);
    expect(updated.schedule_cron).toBe("0 3 * * *");
    expect(updated.provider).toBe("restic-b2");
    expect(updated.retention_preset).toBe("balanced");
    expect(updated.updated_at).toBe(SAVED_AT.toISOString());
    const [saved] = repo.upsertBackupPolicy.mock.calls[0];
    expect(saved).not.toHaveProperty("updated_at");
    expect(saved).toMatchObject({ enabled: true, schedule_cron: "0 3 * * *" });
  });

  it("persists, so the next getPolicy() reflects the update", async () => {
    await service.updatePolicy({ enabled: true, retention_preset: "aggressive" });
    const reread = await service.getPolicy();
    expect(reread.enabled).toBe(true);
    expect(reread.retention_preset).toBe("aggressive");
  });

  it("saves the full request the System page sends", async () => {
    const body = {
      enabled: true,
      schedule_cron: "0 0 * * *",
      retention_preset: "balanced" as const,
      include_discogs_exports: true,
      include_essentia_files: true,
      include_uploads: true,
      remote: {
        enabled: true,
        include_database: true,
        include_album_covers: true,
        include_aac_audio: true,
        include_lossless_audio: false,
      },
      local: {
        enabled: true,
        include_database: false,
        include_album_covers: false,
        include_aac_audio: false,
        include_lossless_audio: true,
      },
    };
    const updated = await service.updatePolicy(body);
    expect(updated).toMatchObject(body);
    expect(await service.getPolicy()).toMatchObject(body);
  });

  it("rejects a whitespace-only schedule_cron without saving", async () => {
    await expect(service.updatePolicy({ schedule_cron: "   " })).rejects.toThrow(
      "schedule_cron cannot be empty",
    );
    expect(repo.upsertBackupPolicy).not.toHaveBeenCalled();
  });

  it("rejects an invalid provider", async () => {
    await expect(service.updatePolicy({ provider: "bad-provider" as never })).rejects.toThrow(
      "Invalid backup provider",
    );
  });

  it("rejects an invalid retention preset", async () => {
    await expect(service.updatePolicy({ retention_preset: "never" as never })).rejects.toThrow(
      "Invalid retention preset",
    );
  });

  it("merges a partial target update without touching the other target", async () => {
    const updated = await service.updatePolicy({
      local: { include_aac_audio: true },
      remote: { include_lossless_audio: true },
    });
    expect(updated.local).toMatchObject({ include_aac_audio: true, include_lossless_audio: true });
    expect(updated.remote).toMatchObject({ include_lossless_audio: true, include_aac_audio: true });
    expect((await service.getPolicy()).local.include_aac_audio).toBe(true);
  });

  it("maps flat keys from an older client onto the remote and does not store them", async () => {
    const updated = await service.updatePolicy({
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
    const [saved] = repo.upsertBackupPolicy.mock.calls[0];
    expect(saved).not.toHaveProperty("include_audio_files");
    expect(saved).not.toHaveProperty("include_database");
  });

  it("trims whitespace from schedule_cron", async () => {
    const updated = await service.updatePolicy({ schedule_cron: "  0 1 * * *  " });
    expect(updated.schedule_cron).toBe("0 1 * * *");
  });
});
