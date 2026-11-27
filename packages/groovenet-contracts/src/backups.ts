import { z } from "zod";

export const BACKUP_PROVIDERS = ["restic-b2"] as const;
export const BACKUP_RETENTION_PRESETS = ["aggressive", "balanced", "archive"] as const;
export const backupProviderSchema = z.enum(BACKUP_PROVIDERS);
export const backupRetentionPresetSchema = z.enum(BACKUP_RETENTION_PRESETS);
export type BackupProvider = z.infer<typeof backupProviderSchema>;
export type BackupRetentionPreset = z.infer<typeof backupRetentionPresetSchema>;
/** What one backup target (the remote or the optional local disk) includes. */
export const BACKUP_TARGETS = ["remote", "local"] as const;
export const backupTargetSchema = z.enum(BACKUP_TARGETS);
export type BackupTarget = z.infer<typeof backupTargetSchema>;
const backupTargetPolicyShape = z.object({
  enabled: z.boolean(),
  include_database: z.boolean(),
  include_album_covers: z.boolean(),
  include_aac_audio: z.boolean(),
  include_lossless_audio: z.boolean(),
});
export const backupTargetPolicySchema = backupTargetPolicyShape.passthrough();
export type BackupTargetPolicy = z.infer<typeof backupTargetPolicyShape>;
const backupPolicyShape = z.object({
  enabled: z.boolean(),
  provider: backupProviderSchema,
  schedule_cron: z.string().min(1),
  retention_preset: backupRetentionPresetSchema,
  /** Remote-only extras; the local disk carries the four media/database choices. */
  include_discogs_exports: z.boolean(),
  include_essentia_files: z.boolean(),
  include_uploads: z.boolean(),
  remote: backupTargetPolicySchema,
  local: backupTargetPolicySchema,
  updated_at: z.string(),
});
export const backupPolicySchema = backupPolicyShape.passthrough();
export type BackupPolicy = z.infer<typeof backupPolicyShape>;
const backupTargetPolicyUpdateShape = z.object({
  enabled: z.boolean().optional(),
  include_database: z.boolean().optional(),
  include_album_covers: z.boolean().optional(),
  include_aac_audio: z.boolean().optional(),
  include_lossless_audio: z.boolean().optional(),
});
export const backupPolicyUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: backupProviderSchema.optional(),
    schedule_cron: z.string().min(1).optional(),
    retention_preset: backupRetentionPresetSchema.optional(),
    include_discogs_exports: z.boolean().optional(),
    include_essentia_files: z.boolean().optional(),
    include_uploads: z.boolean().optional(),
    remote: backupTargetPolicyUpdateShape.passthrough().optional(),
    local: backupTargetPolicyUpdateShape.passthrough().optional(),
  })
  .passthrough();
export type BackupPolicyUpdate = z.infer<typeof backupPolicyUpdateSchema>;
export const backupPolicyGetResponseSchema = z.object({ policy: backupPolicySchema });
export type BackupPolicyGetResponse = z.infer<typeof backupPolicyGetResponseSchema>;
export const backupPolicyPutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  policy: backupPolicySchema,
});
export type BackupPolicyPutResponse = z.infer<typeof backupPolicyPutResponseSchema>;
const backupSnapshotSummaryShape = z.object({
  id: z.string(),
  short_id: z.string().nullable(),
  time: z.string().meta({ format: "date-time" }),
  hostname: z.string().nullable(),
  paths: z.array(z.string()),
  tags: z.array(z.string()),
});
export const backupSnapshotSummarySchema = backupSnapshotSummaryShape.passthrough();
export type BackupSnapshotSummary = z.infer<typeof backupSnapshotSummaryShape>;
const backupStatusShape = z.object({
  started_at: z.string(),
  finished_at: z.string(),
  stored_at: z.string(),
  status: z.enum(["success", "failed", "skipped"]),
  reason: z.string(),
  backed_up_paths: z.array(z.string()),
  snapshot: backupSnapshotSummarySchema.nullable(),
  error: z.string().optional(),
  missing_env: z.array(z.string()).optional(),
});
export const backupStatusSchema = backupStatusShape.passthrough();
export type BackupStatus = z.infer<typeof backupStatusShape>;
const backupMetricsShape = z.object({
  captured_at: z.string(),
  local_source_bytes: z.number().nonnegative(),
  snapshot_count: z.number().int().nonnegative().nullable(),
  remote_repository_bytes: z.number().nonnegative().nullable(),
  recent_snapshots: z.array(backupSnapshotSummarySchema),
  error: z.string().optional(),
});
export const backupMetricsSchema = backupMetricsShape.passthrough();
export type BackupMetrics = z.infer<typeof backupMetricsShape>;
/** One target's verdict against `BACKUP_HEALTH_MAX_AGE_HOURS`, as the System page shows it. */
export const backupTargetHealthSchema = z.object({
  healthy: z.boolean(),
  status: z.enum(["ok", "disabled", "unhealthy"]),
  reason: z.enum(["no-backup-status", "backup-failed", "backup-overdue"]).optional(),
  age_hours: z.number().optional(),
});
export type BackupTargetHealth = z.infer<typeof backupTargetHealthSchema>;
/**
 * The local disk target. Present only when the host configured one
 * (`LOCAL_BACKUP_PATH`); absent means no local target and nothing to show.
 */
export const backupLocalTargetStatusSchema = z.object({
  status: backupStatusSchema.nullable(),
  metrics: backupMetricsSchema.optional(),
  health: backupTargetHealthSchema.optional(),
});
export type BackupLocalTargetStatus = z.infer<typeof backupLocalTargetStatusSchema>;
export const backupStatusGetResponseSchema = z.object({
  status: backupStatusSchema.nullable(),
  metrics: backupMetricsSchema.optional(),
  health: backupTargetHealthSchema.optional(),
  max_age_hours: z.number().optional(),
  local: backupLocalTargetStatusSchema.optional(),
});
export type BackupStatusGetResponse = z.infer<typeof backupStatusGetResponseSchema>;
export const backupStatusRunResponseSchema = z.object({
  status: backupStatusSchema.nullable(),
  local: z.object({ status: backupStatusSchema.nullable() }).optional(),
});
export type BackupStatusRunResponse = z.infer<typeof backupStatusRunResponseSchema>;
export const backupFileSchema = z
  .object({
    filename: z.string(),
    size_bytes: z.number().int(),
    modified_at: z.string().meta({ format: "date-time" }),
  })
  .passthrough();
export type BackupFile = z.infer<typeof backupFileSchema>;
export const backupListResponseSchema = z.object({
  files: z.array(z.string()),
  backups: z.array(backupFileSchema),
});
export type BackupListResponse = z.infer<typeof backupListResponseSchema>;
export const backupDeleteResponseSchema = z.object({ deleted: z.string() });
export type BackupDeleteResponse = z.infer<typeof backupDeleteResponseSchema>;
export const backupCreateResponseSchema = z.object({
  message: z.string(),
  filename: z.string(),
  format: z.literal("custom"),
});
export type BackupCreateResponse = z.infer<typeof backupCreateResponseSchema>;
export const restoreResponseSchema = z
  .object({
    message: z.string(),
    backupType: z.enum(["schema+data", "data-only"]),
    fileType: z.enum(["sql", "dump"]),
    reindex: z
      .object({
        albumsIndexed: z.number().int(),
        tracksIndexed: z.number().int(),
        warning: z.string().nullable(),
      })
      .passthrough(),
  })
  .passthrough();
export type RestoreResponse = z.infer<typeof restoreResponseSchema>;
export const backupHealthResponseSchema = z
  .object({
    healthy: z.boolean().optional(),
    status: z.enum(["ok", "disabled", "unhealthy"]),
    reason: z
      .enum(["no-backup-status", "backup-failed", "backup-overdue", "status-unavailable"])
      .optional(),
    age_hours: z.number().optional(),
    finished_at: z.string().optional(),
    max_age_hours: z.number().optional(),
    /** The local disk target's own verdict, when one is configured. */
    local: z
      .object({
        healthy: z.boolean(),
        status: z.enum(["ok", "disabled", "unhealthy"]),
        reason: z.enum(["no-backup-status", "backup-failed", "backup-overdue"]).optional(),
        age_hours: z.number().optional(),
        finished_at: z.string().optional(),
        error: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();
export type BackupHealthResponse = z.infer<typeof backupHealthResponseSchema>;

export const backupJsonSchemas = {
  BackupProvider: z.toJSONSchema(backupProviderSchema),
  BackupRetentionPreset: z.toJSONSchema(backupRetentionPresetSchema),
  BackupTarget: z.toJSONSchema(backupTargetSchema),
  BackupTargetPolicy: z.toJSONSchema(backupTargetPolicySchema),
  BackupPolicy: z.toJSONSchema(backupPolicySchema),
  BackupPolicyUpdate: z.toJSONSchema(backupPolicyUpdateSchema, { io: "input" }),
  BackupPolicyGetResponse: z.toJSONSchema(backupPolicyGetResponseSchema),
  BackupPolicyPutResponse: z.toJSONSchema(backupPolicyPutResponseSchema),
  BackupSnapshotSummary: z.toJSONSchema(backupSnapshotSummarySchema),
  BackupStatus: z.toJSONSchema(backupStatusSchema),
  BackupMetrics: z.toJSONSchema(backupMetricsSchema),
  BackupTargetHealth: z.toJSONSchema(backupTargetHealthSchema),
  BackupStatusGetResponse: z.toJSONSchema(backupStatusGetResponseSchema),
  BackupStatusRunResponse: z.toJSONSchema(backupStatusRunResponseSchema),
  BackupFile: z.toJSONSchema(backupFileSchema),
  BackupListResponse: z.toJSONSchema(backupListResponseSchema),
  BackupDeleteResponse: z.toJSONSchema(backupDeleteResponseSchema),
  BackupCreateResponse: z.toJSONSchema(backupCreateResponseSchema),
  RestoreResponse: z.toJSONSchema(restoreResponseSchema),
  BackupHealthResponse: z.toJSONSchema(backupHealthResponseSchema),
} as const;
