import { http } from "../http";
import type {
  BackupCreateResponse,
  BackupDeleteResponse,
  BackupListResponse,
} from "@groovenet/client";
export type { BackupFile } from "@groovenet/client";

export function backupDatabase() {
  return http<BackupCreateResponse>("/api/backup", {
    method: "POST",
  });
}

export function fetchBackups() {
  return http<BackupListResponse>("/api/backups", {
    method: "GET",
  });
}

export function deleteBackup(filename: string) {
  return http<BackupDeleteResponse>(`/api/backups/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}
