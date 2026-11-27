import fs from "node:fs";
import path from "node:path";
import type { BackupStatus, BackupTarget } from "@/types/backup";

// Scope to a subfolder of the working dir (/app in the container) rather than an
// import.meta.url-relative path, which resolves wrongly under Next standalone
// (it points into .next/) and makes the build trace the whole project.
const DUMPS_DIR = path.resolve(
  /* turbopackIgnore: true */ process.env.BACKUP_STATUS_DIR || path.resolve(process.cwd(), "dumps"),
);
// The remote keeps its original file name so an existing install's last result survives.
const STATUS_FILES: Record<BackupTarget, string> = {
  remote: "backup-status.json",
  local: "backup-status-local.json",
};

function statusPath(target: BackupTarget): string {
  return path.join(/* turbopackIgnore: true */ DUMPS_DIR, STATUS_FILES[target]);
}

function ensureDumpsDir(): void {
  // turbopackIgnore: DUMPS_DIR is a runtime backups volume, not project files.
  if (!fs.existsSync(/* turbopackIgnore: true */ DUMPS_DIR)) {
    fs.mkdirSync(/* turbopackIgnore: true */ DUMPS_DIR, { recursive: true });
  }
}

export class BackupStatusService {
  getStatus(target: BackupTarget = "remote"): BackupStatus | null {
    const file = statusPath(target);
    if (!fs.existsSync(/* turbopackIgnore: true */ file)) {
      return null;
    }

    const raw = fs.readFileSync(/* turbopackIgnore: true */ file, "utf8");
    return JSON.parse(raw) as BackupStatus;
  }

  writeStatus(
    status: Omit<BackupStatus, "stored_at">,
    target: BackupTarget = "remote",
  ): BackupStatus {
    ensureDumpsDir();

    const nextStatus: BackupStatus = {
      ...status,
      stored_at: new Date().toISOString(),
    };

    fs.writeFileSync(
      /* turbopackIgnore: true */ statusPath(target),
      `${JSON.stringify(nextStatus, null, 2)}\n`,
      "utf8",
    );
    return nextStatus;
  }
}

export const backupStatusService = new BackupStatusService();
