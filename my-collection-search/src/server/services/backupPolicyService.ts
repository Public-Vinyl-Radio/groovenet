import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { BackupPolicy, BackupPolicyUpdate, BackupTargetPolicy } from "@/types/backup";
import { BACKUP_PROVIDERS, BACKUP_RETENTION_PRESETS } from "@/types/backup";

const CONFIG_DIR = path.resolve(process.cwd(), "config");
const POLICY_PATH = path.join(CONFIG_DIR, "backup-policy.yml");

// The remote keeps AAC but not lossless FLACs (they are re-downloadable and large);
// the local disk is the opposite, so lossless has a home that is not metered storage.
const DEFAULT_REMOTE: BackupTargetPolicy = {
  enabled: true,
  include_database: true,
  include_album_covers: true,
  include_aac_audio: true,
  include_lossless_audio: false,
};
const DEFAULT_LOCAL: BackupTargetPolicy = {
  enabled: true,
  include_database: false,
  include_album_covers: false,
  include_aac_audio: false,
  include_lossless_audio: true,
};

const DEFAULT_POLICY: BackupPolicy = {
  enabled: false,
  provider: "restic-b2",
  schedule_cron: "0 */6 * * *",
  retention_preset: "balanced",
  include_discogs_exports: true,
  include_essentia_files: true,
  include_uploads: false,
  remote: DEFAULT_REMOTE,
  local: DEFAULT_LOCAL,
  updated_at: new Date(0).toISOString(),
};

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
}

function parseTarget(
  raw: unknown,
  defaults: BackupTargetPolicy,
  legacy?: Record<string, unknown>,
): BackupTargetPolicy {
  const obj = asRecord(raw);
  const pick = (key: keyof BackupTargetPolicy, fallback: unknown) => Boolean(obj[key] ?? fallback);
  return {
    enabled: pick("enabled", defaults.enabled),
    include_database: pick(
      "include_database",
      legacy?.include_database ?? defaults.include_database,
    ),
    include_album_covers: pick(
      "include_album_covers",
      legacy?.include_album_covers ?? defaults.include_album_covers,
    ),
    // `include_audio_files` was a single audio switch that, before lossless, meant AAC.
    include_aac_audio: pick(
      "include_aac_audio",
      legacy?.include_audio_files ?? defaults.include_aac_audio,
    ),
    include_lossless_audio: pick("include_lossless_audio", defaults.include_lossless_audio),
  };
}

function parsePolicy(raw: unknown): Omit<BackupPolicy, "updated_at"> {
  const obj = asRecord(raw);

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
    include_discogs_exports: Boolean(
      obj.include_discogs_exports ?? DEFAULT_POLICY.include_discogs_exports,
    ),
    include_essentia_files: Boolean(
      obj.include_essentia_files ?? DEFAULT_POLICY.include_essentia_files,
    ),
    include_uploads: Boolean(obj.include_uploads ?? DEFAULT_POLICY.include_uploads),
    // A file written before targets existed carries the remote's choices as flat
    // keys; they become the remote's, with lossless excluded.
    remote: parseTarget(obj.remote, DEFAULT_REMOTE, obj),
    local: parseTarget(obj.local, DEFAULT_LOCAL),
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

    // Clients from before targets existed send the remote's choices as flat keys.
    const {
      remote,
      local,
      include_database,
      include_album_covers,
      include_audio_files,
      ...shared
    } = updates;
    const legacy: Partial<BackupTargetPolicy> = {};
    if (typeof include_database === "boolean") legacy.include_database = include_database;
    if (typeof include_album_covers === "boolean")
      legacy.include_album_covers = include_album_covers;
    if (typeof include_audio_files === "boolean") legacy.include_aac_audio = include_audio_files;
    const next: BackupPolicy = {
      ...current,
      ...shared,
      remote: { ...current.remote, ...legacy, ...remote },
      local: { ...current.local, ...local },
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
