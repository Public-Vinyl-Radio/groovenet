import { z } from "zod";
import {
  aiPromptSettingsGetResponseSchema,
  aiPromptSettingsPutBodySchema,
  aiPromptSettingsPutResponseSchema,
  aiPromptSettingsQuerySchema,
  backupPolicyGetResponseSchema,
  backupPolicyPutBodySchema,
  backupPolicyPutResponseSchema,
  backupPolicySchema,
  backupMetricsSchema,
  backupStatusGetResponseSchema,
  backupStatusSchema,
  defaultLibrarySettingsGetResponseSchema,
  defaultLibrarySettingsPutBodySchema,
  defaultLibrarySettingsPutResponseSchema,
  embeddingPromptSettingsGetResponseSchema,
  embeddingPromptSettingsPutBodySchema,
  embeddingPromptSettingsPutResponseSchema,
  embeddingPromptSettingsQuerySchema,
  gamdlConnectionTestResponseSchema,
  gamdlSettingsGetResponseSchema,
  gamdlSettingsPutBodySchema,
  gamdlSettingsPutResponseSchema,
  gamdlSettingsResetBodySchema,
  gamdlSettingsResetResponseSchema,
  gamdlSettingsSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type AiPromptSettingsQuery = z.input<typeof aiPromptSettingsQuerySchema>;
export type AiPromptSettingsResponse = z.infer<
  typeof aiPromptSettingsGetResponseSchema
>;
export type UpdateAiPromptSettingsBody = z.input<
  typeof aiPromptSettingsPutBodySchema
>;
export type UpdateAiPromptSettingsResponse = z.infer<
  typeof aiPromptSettingsPutResponseSchema
>;
export type EmbeddingPromptSettingsQuery = z.input<
  typeof embeddingPromptSettingsQuerySchema
>;
export type EmbeddingPromptSettingsResponse = z.infer<
  typeof embeddingPromptSettingsGetResponseSchema
>;
export type UpdateEmbeddingPromptSettingsBody = z.input<
  typeof embeddingPromptSettingsPutBodySchema
>;
export type UpdateEmbeddingPromptSettingsResponse = z.infer<
  typeof embeddingPromptSettingsPutResponseSchema
>;
export type GamdlSettings = z.infer<typeof gamdlSettingsSchema>;
export type GamdlSettingsResponse = z.infer<typeof gamdlSettingsGetResponseSchema>;
export type UpdateGamdlSettingsBody = z.input<typeof gamdlSettingsPutBodySchema>;
export type UpdateGamdlSettingsResponse = z.infer<
  typeof gamdlSettingsPutResponseSchema
>;
export type ResetGamdlSettingsBody = z.input<typeof gamdlSettingsResetBodySchema>;
export type ResetGamdlSettingsResponse = z.infer<
  typeof gamdlSettingsResetResponseSchema
>;
export type GamdlConnectionTestResponse = z.infer<
  typeof gamdlConnectionTestResponseSchema
>;
export type BackupPolicy = z.infer<typeof backupPolicySchema>;
export type BackupPolicyResponse = z.infer<typeof backupPolicyGetResponseSchema>;
export type UpdateBackupPolicyBody = z.input<typeof backupPolicyPutBodySchema>;
export type UpdateBackupPolicyResponse = z.infer<
  typeof backupPolicyPutResponseSchema
>;
export type BackupStatus = z.infer<typeof backupStatusSchema>;
export type BackupMetrics = z.infer<typeof backupMetricsSchema>;
export type BackupStatusResponse = z.infer<typeof backupStatusGetResponseSchema>;
export type DefaultLibrarySettingsResponse = z.infer<
  typeof defaultLibrarySettingsGetResponseSchema
>;
export type UpdateDefaultLibrarySettingsBody = z.input<
  typeof defaultLibrarySettingsPutBodySchema
>;
export type UpdateDefaultLibrarySettingsResponse = z.infer<
  typeof defaultLibrarySettingsPutResponseSchema
>;

export async function fetchDefaultLibrarySettings(): Promise<DefaultLibrarySettingsResponse> {
  return await http<DefaultLibrarySettingsResponse>(
    "/api/settings/default-library",
    {
      method: "GET",
      cache: "no-store",
    }
  );
}

export async function updateDefaultLibrarySettings(
  body: UpdateDefaultLibrarySettingsBody
): Promise<UpdateDefaultLibrarySettingsResponse> {
  return await http<UpdateDefaultLibrarySettingsResponse>(
    "/api/settings/default-library",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchAiPromptSettings(
  query: AiPromptSettingsQuery = {}
): Promise<AiPromptSettingsResponse> {
  const params = new URLSearchParams();
  if (typeof query.friend_id === "number") {
    params.set("friend_id", String(query.friend_id));
  }
  const search = params.toString();
  const path = search ? `/api/settings/ai-prompt?${search}` : "/api/settings/ai-prompt";
  return await http<AiPromptSettingsResponse>(path, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateAiPromptSettings(
  body: UpdateAiPromptSettingsBody
): Promise<UpdateAiPromptSettingsResponse> {
  return await http<UpdateAiPromptSettingsResponse>("/api/settings/ai-prompt", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchEmbeddingPromptSettings(
  query: EmbeddingPromptSettingsQuery = {}
): Promise<EmbeddingPromptSettingsResponse> {
  const params = new URLSearchParams();
  if (typeof query.friend_id === "number") {
    params.set("friend_id", String(query.friend_id));
  }
  const search = params.toString();
  const path = search
    ? `/api/settings/embedding-prompt?${search}`
    : "/api/settings/embedding-prompt";
  return await http<EmbeddingPromptSettingsResponse>(path, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateEmbeddingPromptSettings(
  body: UpdateEmbeddingPromptSettingsBody
): Promise<UpdateEmbeddingPromptSettingsResponse> {
  return await http<UpdateEmbeddingPromptSettingsResponse>(
    "/api/settings/embedding-prompt",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function fetchGamdlSettings(
  friendId: number
): Promise<GamdlSettingsResponse> {
  const params = new URLSearchParams({
    friend_id: String(friendId),
  });
  return await http<GamdlSettingsResponse>(`/api/settings/gamdl?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function updateGamdlSettings(
  body: UpdateGamdlSettingsBody
): Promise<UpdateGamdlSettingsResponse> {
  return await http<UpdateGamdlSettingsResponse>("/api/settings/gamdl", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function resetGamdlSettings(
  body: ResetGamdlSettingsBody
): Promise<ResetGamdlSettingsResponse> {
  return await http<ResetGamdlSettingsResponse>("/api/settings/gamdl/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reset_settings", ...body }),
  });
}

export async function testGamdlConnection(): Promise<GamdlConnectionTestResponse> {
  return await http<GamdlConnectionTestResponse>("/api/settings/gamdl/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "test_connection" }),
  });
}

export async function fetchBackupPolicy(): Promise<BackupPolicyResponse> {
  return await http<BackupPolicyResponse>("/api/settings/backup", {
    method: "GET",
    cache: "no-store",
  });
}

export async function fetchBackupStatus(): Promise<BackupStatusResponse> {
  return await http<BackupStatusResponse>("/api/settings/backup/status", {
    method: "GET",
    cache: "no-store",
  });
}

export async function runBackupNow(): Promise<BackupStatusResponse> {
  return await http<BackupStatusResponse>("/api/settings/backup/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

export async function updateBackupPolicy(
  body: UpdateBackupPolicyBody
): Promise<UpdateBackupPolicyResponse> {
  return await http<UpdateBackupPolicyResponse>("/api/settings/backup", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
