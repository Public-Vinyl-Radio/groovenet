import type {
  OrphanScanStartResponse,
  OrphansResponse,
  ServiceHealth,
  ServiceStatus,
  StatusResponse,
  StorageResponse,
  UpdateCheckResponse,
  VersionResponse,
} from "@groovenet/contracts";
import { http } from "@/services/http";

export type VersionInfo = VersionResponse;
export type StatusInfo = StatusResponse;
export type UpdateInfo = UpdateCheckResponse;
export type { OrphansResponse, ServiceHealth, ServiceStatus };

export function fetchVersionInfo(): Promise<VersionInfo> {
  return http<VersionInfo>("/api/version");
}

export function fetchStatusInfo(): Promise<StatusInfo> {
  return http<StatusInfo>("/api/status");
}

export function fetchUpdateInfo(): Promise<UpdateInfo> {
  return http<UpdateInfo>("/api/update-check");
}

export type StorageInfo = StorageResponse;

export function fetchStorageInfo(): Promise<StorageInfo> {
  return http<StorageInfo>("/api/system/storage");
}

export function fetchStorageOrphans(limit = 5): Promise<OrphansResponse> {
  return http<OrphansResponse>(`/api/system/storage/orphans?limit=${limit}`);
}

export function startStorageOrphanScan(): Promise<OrphanScanStartResponse> {
  return http<OrphanScanStartResponse>("/api/system/storage/orphans/scan", { method: "POST" });
}
