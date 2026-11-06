import type {
  ServiceHealth,
  ServiceStatus,
  StatusResponse,
  UpdateCheckResponse,
  VersionResponse,
} from "@groovenet/contracts";
import { http } from "@/services/http";

export type VersionInfo = VersionResponse;
export type StatusInfo = StatusResponse;
export type UpdateInfo = UpdateCheckResponse;
export type { ServiceHealth, ServiceStatus };

export function fetchVersionInfo(): Promise<VersionInfo> {
  return http<VersionInfo>("/api/version");
}

export function fetchStatusInfo(): Promise<StatusInfo> {
  return http<StatusInfo>("/api/status");
}

export function fetchUpdateInfo(): Promise<UpdateInfo> {
  return http<UpdateInfo>("/api/update-check");
}
