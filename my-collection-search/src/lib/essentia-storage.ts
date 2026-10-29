import fs from "fs";
import path from "path";

// Scope to a subfolder of the working dir (/app in the container). Avoids an
// import.meta.url-relative path, which resolves wrongly under Next standalone
// (it points into .next/) and makes the build trace the whole project.
const DEFAULT_ESSENTIA_DATA_DIR = path.resolve(process.cwd(), "essentia-data");

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getEssentiaDataDir(): string {
  return process.env.ESSENTIA_DATA_DIR || DEFAULT_ESSENTIA_DATA_DIR;
}

function assertWithinDataDir(filePath: string): void {
  const dir = getEssentiaDataDir();
  // turbopackIgnore: these operate on the runtime essentia-data volume, not
  // project files — keep the build from tracing the whole project.
  const resolved = path.resolve(/* turbopackIgnore: true */ filePath);
  const base = path.resolve(/* turbopackIgnore: true */ dir) + path.sep;
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
}

export function getEssentiaAnalysisPath(trackId: string, friendId: number): string {
  const fileName = `${safePart(trackId)}_${friendId}.json`;
  const filePath = path.join(/* turbopackIgnore: true */ getEssentiaDataDir(), fileName);
  assertWithinDataDir(filePath);
  return filePath;
}

export function writeEssentiaAnalysis(
  trackId: string,
  friendId: number,
  analysis: unknown,
): string {
  const dir = getEssentiaDataDir();
  // turbopackIgnore: the essentia data dir is a runtime volume, not project
  // files — don't trace it (and the whole project) into the build.
  fs.mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
  const filePath = getEssentiaAnalysisPath(trackId, friendId);
  const payload = {
    track_id: trackId,
    friend_id: friendId,
    saved_at: new Date().toISOString(),
    analysis,
  };
  fs.writeFileSync(
    /* turbopackIgnore: true */ filePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  return filePath;
}

export function readEssentiaAnalysis(
  trackId: string,
  friendId: number,
): {
  file_path: string;
  payload: unknown;
} | null {
  const filePath = getEssentiaAnalysisPath(trackId, friendId);
  if (!fs.existsSync(/* turbopackIgnore: true */ filePath)) return null;
  const raw = fs.readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
  return {
    file_path: filePath,
    payload: JSON.parse(raw),
  };
}
