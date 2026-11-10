import type { TrackAudioFileFields } from "@groovenet/contracts";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";
import { stripNullBytes } from "@/lib/stripNullBytes";

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

const losslessCodecs = new Set([
  "alac",
  "flac",
  "wavpack",
  "ape",
  "tta",
  "truehd",
  "mlp",
  "shorten",
]);
const positiveInteger = (value: unknown): number | null => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

/** Convert ffprobe's audio stream and container information to persisted fields. */
export function audioFieldsFromProbe(probe: unknown): Omit<TrackAudioFileFields, "audio_source"> {
  const data = (probe ?? {}) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const stream = data.streams?.find((entry) => entry.codec_type === "audio") ?? {};
  const format = data.format ?? {};
  const codec = typeof stream.codec_name === "string" ? stream.codec_name : null;
  const lossless = codec === null ? null : losslessCodecs.has(codec) || codec.startsWith("pcm_");
  const formats = typeof format.format_name === "string" ? format.format_name.split(",") : [];
  const container = formats.includes("m4a")
    ? "m4a"
    : formats.includes("webm")
      ? "webm"
      : (formats[0] ?? null);
  const pcmDepth = codec?.match(/^pcm_[suf](\d+)/)?.[1];
  const sampleDepth =
    typeof stream.sample_fmt === "string"
      ? stream.sample_fmt.match(/^(?:s|u|flt|dbl)(\d+)?p?$/)
      : null;
  return {
    audio_codec: codec,
    audio_container: container,
    audio_sample_rate: positiveInteger(stream.sample_rate),
    audio_bit_depth: lossless
      ? (positiveInteger(stream.bits_per_raw_sample) ??
        positiveInteger(stream.bits_per_sample) ??
        positiveInteger(pcmDepth) ??
        positiveInteger(sampleDepth?.[1]))
      : null,
    audio_bitrate: positiveInteger(stream.bit_rate) ?? positiveInteger(format.bit_rate),
    audio_channels: positiveInteger(stream.channels),
    audio_size_bytes: positiveInteger(format.size),
    audio_lossless: lossless,
    audio_probed_at: new Date().toISOString(),
  };
}

/** Text tags read from the file itself: never user-edited, always from the audio. */
export type EmbeddedTags = {
  composer: string | null;
  /** Genre names as the file spells them (Apple/ID3 taxonomy, not Groovenet's). */
  genres: string[];
  lyrics: string | null;
};

export const EMPTY_EMBEDDED_TAGS: EmbeddedTags = { composer: null, genres: [], lyrics: null };

/**
 * ffprobe lowercases ID3 frames (TCOM, TCON, USLT) and MP4 atoms (©wrt, ©gen, ©lyr)
 * to `composer`, `genre`, `lyrics`, but Vorbis/FLAC keeps the file's own case, and
 * a few muxers leave the raw frame id or an alias. Keys are matched case-insensitively.
 * `TPE2` is deliberately absent: it is the album artist, not the composer.
 */
const COMPOSER_KEYS = ["composer", "tcom", "©wrt", "wrt"];
const GENRE_KEYS = ["genre", "tcon", "©gen", "gen"];
const LYRICS_KEYS = ["lyrics", "unsyncedlyrics", "unsynced lyrics", "uslt", "©lyr", "lyr"];

/** Format tags win; stream tags (Ogg, some Matroska) fill the gaps. */
function collectTags(probe: unknown): Map<string, string> {
  const data = (probe ?? {}) as {
    format?: { tags?: Record<string, unknown> };
    streams?: Array<{ tags?: Record<string, unknown> }>;
  };
  const sources = [data.format?.tags, ...(data.streams ?? []).map((stream) => stream?.tags)];
  const tags = new Map<string, string>();
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      const lower = key.toLowerCase();
      if (typeof value === "string" && !tags.has(lower)) tags.set(lower, value);
    }
  }
  return tags;
}

function firstTag(tags: Map<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const value = tags.get(key);
    if (value !== undefined && stripNullBytes(value).trim().length > 0) return value;
  }
  return null;
}

/**
 * A NUL is ID3v2.4's separator between values, so it splits before it is
 * stripped; whatever remains is trimmed and de-duplicated case-insensitively.
 */
function splitValues(raw: string, delimiter: RegExp): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const part of raw.split("\u0000").flatMap((chunk) => chunk.split(delimiter))) {
    const value = stripNullBytes(part).trim();
    if (value && !seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      values.push(value);
    }
  }
  return values;
}

/**
 * Composers, joined as `A, B`. Splits on `;` `/` `&` `,` (gamdl joins with ` & `,
 * ID3v2.3 with `/`); `normalizeComposer` downstream splits on the same set, so a
 * `Last, First` name round-trips unchanged.
 */
export function composerFromTags(tags: Map<string, string>): string | null {
  const raw = firstTag(tags, COMPOSER_KEYS);
  const names = raw === null ? [] : splitValues(raw, /[;/&,]/);
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * Genres split only on NUL and `;`. `/` and `&` live inside Apple's own names
 * (`Hip-Hop/Rap`, `R&B/Soul`, `Drum & Bass`), and ffprobe cannot say whether a `/`
 * was a separator, so keeping the value whole is the lossless choice.
 */
export function genresFromTags(tags: Map<string, string>): string[] {
  const raw = firstTag(tags, GENRE_KEYS);
  return raw === null ? [] : splitValues(raw, /;/);
}

export function lyricsFromTags(tags: Map<string, string>): string | null {
  const raw = firstTag(tags, LYRICS_KEYS);
  const lyrics = raw === null ? "" : stripNullBytes(raw).replace(/\r\n?/g, "\n").trim();
  return lyrics.length > 0 ? lyrics : null;
}

/** Composer, genre and lyrics from an ffprobe result. Missing or empty tags give nulls. */
export function embeddedTagsFromProbe(probe: unknown): EmbeddedTags {
  const tags = collectTags(probe);
  return {
    composer: composerFromTags(tags),
    genres: genresFromTags(tags),
    lyrics: lyricsFromTags(tags),
  };
}

export class TrackAudioMetadataService {
  /** All file writers use this path, including removal and replacement. */
  async fieldsForLocalAudio(
    filename: string | null,
    source?: TrackAudioFileFields["audio_source"],
  ): Promise<TrackAudioFileFields> {
    return (await this.inspectLocalAudio(filename, source)).fields;
  }

  /**
   * One ffprobe for everything read from a file: the `audio_*` columns and the
   * embedded text tags. The write paths persist both from this single probe.
   */
  async inspectLocalAudio(
    filename: string | null,
    source?: TrackAudioFileFields["audio_source"],
  ): Promise<{ fields: TrackAudioFileFields; tags: EmbeddedTags | null }> {
    if (!filename) {
      return {
        tags: null,
        fields: {
          audio_source: null,
          audio_codec: null,
          audio_container: null,
          audio_sample_rate: null,
          audio_bit_depth: null,
          audio_bitrate: null,
          audio_channels: null,
          audio_size_bytes: null,
          audio_lossless: null,
          audio_probed_at: null,
        },
      };
    }
    const filePath = this.resolveAudioFilePath(filename);
    if (!filePath) throw new Error("Local audio file not found");
    const probe = await this.runFfprobe(filePath);
    return {
      fields: { ...audioFieldsFromProbe(probe), audio_source: source ?? "unknown" },
      tags: embeddedTagsFromProbe(probe),
    };
  }

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
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
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
          (s?.codec_type === "video" && s?.disposition?.default === 0),
      ) ?? null
    );
  }

  extractYearFromProbe(probe: unknown): number | null {
    const tags =
      probe &&
      typeof probe === "object" &&
      "format" in probe &&
      (probe as { format?: { tags?: Record<string, unknown> } }).format?.tags &&
      typeof (probe as { format?: { tags?: Record<string, unknown> } }).format?.tags === "object"
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
    return embeddedTagsFromProbe(probe).composer;
  }
}

export const trackAudioMetadataService = new TrackAudioMetadataService();
