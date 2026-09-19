export const BACKUP_PROVIDERS = ["restic-b2"] as const;
export type BackupProvider = (typeof BACKUP_PROVIDERS)[number];

export const BACKUP_RETENTION_PRESETS = ["aggressive", "balanced", "archive"] as const;
export type BackupRetentionPreset = (typeof BACKUP_RETENTION_PRESETS)[number];

export type BackupPolicy = {
  enabled: boolean;
  provider: BackupProvider;
  schedule_cron: string;
  retention_preset: BackupRetentionPreset;
  include_database: boolean;
  include_audio_files: boolean;
  include_album_covers: boolean;
  include_discogs_exports: boolean;
  include_essentia_files: boolean;
  include_uploads: boolean;
  updated_at: string;
};

export type BackupPolicyUpdate = Partial<
  Omit<BackupPolicy, "provider" | "updated_at"> & {
    provider: BackupProvider;
  }
>;

export type BackupSnapshotSummary = {
  id: string;
  short_id: string | null;
  time: string;
  hostname: string | null;
  paths: string[];
  tags: string[];
};

export type BackupMetrics = {
  captured_at: string;
  local_source_bytes: number;
  snapshot_count: number | null;
  remote_repository_bytes: number | null;
  recent_snapshots: BackupSnapshotSummary[];
  error?: string;
};

export type BackupStatus = {
  started_at: string;
  finished_at: string;
  stored_at: string;
  status: "success" | "failed" | "skipped";
  reason: string;
  backed_up_paths: string[];
  snapshot: BackupSnapshotSummary | null;
  error?: string;
  missing_env?: string[];
};
