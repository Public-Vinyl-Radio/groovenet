import path from "path";
import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";

const execFileAsync = promisify(execFile);

export type AttachedPicStream = {
  index?: number;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  disposition?: {
    attached_pic?: number;
    default?: number;
  };
  codec_type?: string;
};

function extractYearFromTag(value: string): number | null {
  const trimmed = value.trim();
  for (let i = 0; i <= trimmed.length - 4; i += 1) {
    const chunk = trimmed.slice(i, i + 4);
    if (!/^\d{4}$/.test(chunk)) continue;
    const year = Number.parseInt(chunk, 10);
    if (year >= 1800 && year <= 2100) return year;
  }
  return null;
}

export class TrackAudioMetadataService {
  normalizeAudioFilename(raw: string): string {
    let value = raw.trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // ignore malformed encoding and use raw value
    }

    if (value.startsWith("http://") || value.startsWith("https://")) {
      try {
        const parsed = new URL(value);
        const nested = parsed.searchParams.get("filename");
        if (nested) value = nested;
        else value = path.basename(parsed.pathname);
      } catch {
        // keep original
      }
    }

    value = value.replace(/^\/+/, "");
    value = value.replace(/^app\/audio\//, "");
    value = value.replace(/^audio\//, "");
    return value;
  }

  resolveAudioFilePath(filename: string): string | null {
    const audioDir = process.env.AUDIO_DIR || "/app/audio";
    const normalized = this.normalizeAudioFilename(filename);
    if (!normalized) return null;

    const root = path.resolve(/* turbopackIgnore: true */ audioDir);
    const primary = path.resolve(/* turbopackIgnore: true */ audioDir, normalized);
    // turbopackIgnore: these resolve within the runtime /app/audio volume
    // (user data), not project files — don't trace them into the build.
    if (
      primary.startsWith(root) &&
      fs.existsSync(/* turbopackIgnore: true */ primary) &&
      fs.statSync(/* turbopackIgnore: true */ primary).isFile()
    ) {
      return primary;
    }

    const base = path.basename(normalized);
    const fallback = path.resolve(/* turbopackIgnore: true */ audioDir, base);
    if (
      fallback.startsWith(root) &&
      fs.existsSync(/* turbopackIgnore: true */ fallback) &&
      fs.statSync(/* turbopackIgnore: true */ fallback).isFile()
    ) {
      return fallback;
    }

    return null;
  }

  async runFfprobe(filePath: string, showEntries?: string): Promise<unknown> {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      ...(showEntries ? ["-show_entries", showEntries] : ["-show_format", "-show_streams"]),
      filePath,
    ];
    const { stdout } = await execFileAsync("ffprobe", args);
    return JSON.parse(stdout);
  }

  /** Decodes an attached-picture stream to PNG bytes, without touching disk. */
  async extractAttachedPic(filePath: string, streamIndex: number): Promise<Buffer> {
    const { stdout } = await execFileAsync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        filePath,
        "-map",
        `0:${streamIndex}`,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-c:v",
        "png",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
    );
    return stdout;
  }

  getAttachedPicStream(probe: unknown): AttachedPicStream | null {
    const streams =
      probe &&
      typeof probe === "object" &&
      "streams" in probe &&
      Array.isArray((probe as { streams?: unknown[] }).streams)
        ? ((probe as { streams: AttachedPicStream[] }).streams ?? [])
        : [];

    return (
      streams.find(
        (s) =>
          s?.disposition?.attached_pic === 1 ||
          (s?.codec_type === "video" && s?.disposition?.default === 0)
      ) ?? null
    );
  }

  extractYearFromProbe(probe: unknown): number | null {
    const tags =
      probe &&
      typeof probe === "object" &&
      "format" in probe &&
      (probe as { format?: { tags?: Record<string, unknown> } }).format?.tags &&
      typeof (probe as { format?: { tags?: Record<string, unknown> } }).format?.tags ===
        "object"
        ? (probe as { format: { tags: Record<string, unknown> } }).format.tags
        : null;

    if (!tags) return null;

    const preferred = [
      "date",
      "year",
      "originaldate",
      "original_date",
      "release_date",
      "creation_time",
    ];
    for (const key of preferred) {
      const value = tags[key];
      if (typeof value !== "string") continue;
      const year = extractYearFromTag(value);
      if (year) return year;
    }

    for (const value of Object.values(tags)) {
      if (typeof value !== "string") continue;
      const year = extractYearFromTag(value);
      if (year) return year;
    }

    return null;
  }

  extractComposerFromProbe(probe: unknown): string | null {
    const tags =
      probe &&
      typeof probe === "object" &&
      "format" in probe &&
      (probe as { format?: { tags?: Record<string, unknown> } }).format?.tags &&
      typeof (probe as { format?: { tags?: Record<string, unknown> } }).format?.tags ===
        "object"
        ? (probe as { format: { tags: Record<string, unknown> } }).format.tags
        : null;

    if (!tags) return null;

    const composerKeys = ["composer", "COMPOSER", "Composer", "TPE2", "TCOM"];
    for (const key of composerKeys) {
      const value = tags[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }
}

export const trackAudioMetadataService = new TrackAudioMetadataService();
