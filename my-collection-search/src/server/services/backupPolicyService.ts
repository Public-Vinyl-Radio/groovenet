import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { BackupPolicy, BackupPolicyUpdate } from "@/types/backup";
import { BACKUP_PROVIDERS, BACKUP_RETENTION_PRESETS } from "@/types/backup";

const CONFIG_DIR = path.resolve(process.cwd(), "config");
const POLICY_PATH = path.join(CONFIG_DIR, "backup-policy.yml");

const DEFAULT_POLICY: BackupPolicy = {
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
  updated_at: new Date(0).toISOString(),
};

function parsePolicy(raw: unknown): Omit<BackupPolicy, "updated_at"> {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};

  const provider = String(obj.provider ?? DEFAULT_POLICY.provider);
  if (!BACKUP_PROVIDERS.includes(provider as (typeof BACKUP_PROVIDERS)[number])) {
    throw new Error("Invalid backup provider in policy file");
  }

  const retention = String(obj.retention_preset ?? DEFAULT_POLICY.retention_preset);
  if (!BACKUP_RETENTION_PRESETS.includes(retention as (typeof BACKUP_RETENTION_PRESETS)[number])) {
    throw new Error("Invalid retention preset in policy file");
  }

  return {
    enabled: Boolean(obj.enabled ?? DEFAULT_POLICY.enabled),
    provider: provider as BackupPolicy["provider"],
    schedule_cron:
      String(obj.schedule_cron ?? DEFAULT_POLICY.schedule_cron).trim() ||
      DEFAULT_POLICY.schedule_cron,
    retention_preset: retention as BackupPolicy["retention_preset"],
    include_database: Boolean(obj.include_database ?? DEFAULT_POLICY.include_database),
    include_audio_files: Boolean(obj.include_audio_files ?? DEFAULT_POLICY.include_audio_files),
    include_album_covers: Boolean(obj.include_album_covers ?? DEFAULT_POLICY.include_album_covers),
    include_discogs_exports: Boolean(
      obj.include_discogs_exports ?? DEFAULT_POLICY.include_discogs_exports,
    ),
    include_essentia_files: Boolean(
      obj.include_essentia_files ?? DEFAULT_POLICY.include_essentia_files,
    ),
    include_uploads: Boolean(obj.include_uploads ?? DEFAULT_POLICY.include_uploads),
  };
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function writePolicyFile(policy: BackupPolicy): void {
  ensureConfigDir();
  const doc = yaml.stringify(policy);
  fs.writeFileSync(POLICY_PATH, doc, "utf8");
}

export class BackupPolicyService {
  getPolicy(): BackupPolicy {
    if (!fs.existsSync(POLICY_PATH)) {
      const policy: BackupPolicy = {
        ...DEFAULT_POLICY,
        updated_at: new Date().toISOString(),
      };
      writePolicyFile(policy);
      return policy;
    }

    const rawText = fs.readFileSync(POLICY_PATH, "utf8");
    const parsed = yaml.parse(rawText);
    const normalized = parsePolicy(parsed);
    const updated_at =
      typeof (parsed as { updated_at?: unknown })?.updated_at === "string"
        ? (parsed as { updated_at: string }).updated_at
        : new Date().toISOString();

    return {
      ...normalized,
      updated_at,
    };
  }

  updatePolicy(updates: BackupPolicyUpdate): BackupPolicy {
    const current = this.getPolicy();

    const next: BackupPolicy = {
      ...current,
      ...updates,
      schedule_cron: (updates.schedule_cron ?? current.schedule_cron).trim(),
      updated_at: new Date().toISOString(),
    };

    if (!next.schedule_cron) {
      throw new Error("schedule_cron cannot be empty");
    }

    if (!BACKUP_PROVIDERS.includes(next.provider)) {
      throw new Error("Invalid backup provider");
    }

    if (!BACKUP_RETENTION_PRESETS.includes(next.retention_preset)) {
      throw new Error("Invalid retention preset");
    }

    writePolicyFile(next);
    return next;
  }
}

export const backupPolicyService = new BackupPolicyService();
