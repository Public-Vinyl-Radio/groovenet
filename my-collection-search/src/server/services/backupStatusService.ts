import fs from "node:fs";
import path from "node:path";
import type { BackupStatus } from "@/types/backup";

// Scope to a subfolder of the working dir (/app in the container) rather than an
// import.meta.url-relative path, which resolves wrongly under Next standalone
// (it points into .next/) and makes the build trace the whole project.
const DUMPS_DIR = path.resolve(
  /* turbopackIgnore: true */ process.env.BACKUP_STATUS_DIR || path.resolve(process.cwd(), "dumps"),
);
const STATUS_PATH = path.join(/* turbopackIgnore: true */ DUMPS_DIR, "backup-status.json");

function ensureDumpsDir(): void {
  // turbopackIgnore: DUMPS_DIR is a runtime backups volume, not project files.
  if (!fs.existsSync(/* turbopackIgnore: true */ DUMPS_DIR)) {
    fs.mkdirSync(/* turbopackIgnore: true */ DUMPS_DIR, { recursive: true });
  }
}

export class BackupStatusService {
  getStatus(): BackupStatus | null {
    if (!fs.existsSync(/* turbopackIgnore: true */ STATUS_PATH)) {
      return null;
    }

    const raw = fs.readFileSync(/* turbopackIgnore: true */ STATUS_PATH, "utf8");
    return JSON.parse(raw) as BackupStatus;
  }

  writeStatus(status: Omit<BackupStatus, "stored_at">): BackupStatus {
    ensureDumpsDir();

    const nextStatus: BackupStatus = {
      ...status,
      stored_at: new Date().toISOString(),
    };

    fs.writeFileSync(
      /* turbopackIgnore: true */ STATUS_PATH,
      `${JSON.stringify(nextStatus, null, 2)}\n`,
      "utf8",
    );
    return nextStatus;
  }
}

export const backupStatusService = new BackupStatusService();
