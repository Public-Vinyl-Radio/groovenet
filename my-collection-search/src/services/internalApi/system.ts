import { http } from "@/services/http";

export interface VersionInfo {
  version: string;
  gitSha: string | null;
  builtAt: string | null;
  nodeEnv: string;
}

export type ServiceStatus = "up" | "down" | "unknown";

export interface ServiceHealth {
  service: string;
  status: ServiceStatus;
  latencyMs: number | null;
  detail?: string;
  meta?: Record<string, unknown>;
}

export interface StatusInfo {
  services: ServiceHealth[];
  checkedAt: string;
}

export interface UpdateInfo {
  current: string;
  comparable: boolean;
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  error: string | null;
}

export function fetchVersionInfo(): Promise<VersionInfo> {
  return http<VersionInfo>("/api/version");
}

export function fetchStatusInfo(): Promise<StatusInfo> {
  return http<StatusInfo>("/api/status");
}

export function fetchUpdateInfo(): Promise<UpdateInfo> {
  return http<UpdateInfo>("/api/update-check");
}
