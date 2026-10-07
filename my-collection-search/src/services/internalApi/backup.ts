import { http } from "../http";

export type BackupFile = {
  filename: string;
  size_bytes: number;
  modified_at: string;
};

export function backupDatabase() {
  return http<{ message: string; filename: string; format: "custom" }>(
    "/api/backup",
    { method: "POST" }
  );
}

export function fetchBackups() {
  return http<{ files: Array<string>; backups: Array<BackupFile> }>(
    "/api/backups",
    { method: "GET" }
  );
}

export function deleteBackup(filename: string) {
  return http<{ deleted: string }>(
    `/api/backups/${encodeURIComponent(filename)}`,
    { method: "DELETE" }
  );
}
