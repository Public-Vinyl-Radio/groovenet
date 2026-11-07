import type { TrackAudioFileFields } from "@groovenet/contracts";

export type AudioSource = NonNullable<TrackAudioFileFields["audio_source"]>;

export type AudioSourceClassification = {
  source: AudioSource;
  /** The rule that decided, for reports and debugging. */
  reason: string;
  /**
   * Opus/WebM with no URL tag: yt-dlp's usual YouTube output, but a file
   * someone converted would look the same. Recorded as `unknown` and counted
   * apart, rather than guessed.
   */
  weakYoutubeHint: boolean;
};

type ProbeLike = {
  streams?: Array<{ codec_type?: string; codec_name?: string; tags?: Record<string, unknown> }>;
  format?: { format_name?: string; tags?: Record<string, unknown> };
};

/** Tags from the container and the audio stream, keys lower-cased. Stream tags win. */
function collectTags(probe: ProbeLike): Record<string, string> {
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const merged: Record<string, string> = {};
  for (const source of [probe.format?.tags, audio?.tags]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (typeof value === "string" || typeof value === "number") {
        merged[key.toLowerCase()] = String(value);
      }
    }
  }
  return merged;
}

/** Atoms Apple's own tooling writes and that gamdl's output keeps. */
const APPLE_ID_TAGS = ["itunsmpb", "apid", "cnid", "plid", "atid", "geid", "xid"];
/** Where yt-dlp and friends leave the page URL they downloaded from. */
const URL_TAGS = ["purl", "comment", "description", "synopsis", "source", "www"];
/** yt-dlp's default `... [<11-char id>].ext` name, if a file ever keeps it. */
const YT_DLP_FILENAME = /\[[\w-]{11}\]\.\w+$/;
/** `/api/tracks/upload` names its output `audio_<epoch ms>_<random>.<m4a|mp3>`. */
const UPLOAD_FILENAME = /^audio_\d{10,}_\d+\.(?:m4a|mp3)$/;

/**
 * Work out where a local audio file came from, from its ffprobe output and its
 * file name. Rules run in order and the first match wins:
 *
 * 1. Apple Music (gamdl): Apple's ID atoms or `com.apple.iTunes` keys, or the
 *    `Core Media Audio` handler that Apple's muxer writes into every stream.
 * 2. YouTube / SoundCloud (yt-dlp): a source URL in a tag, the
 *    `... produced by Google Inc.` handler YouTube's m4a streams carry (yt-dlp
 *    remuxes with ffmpeg, which keeps it), or yt-dlp's file name pattern.
 * 3. Upload: the name `/api/tracks/upload` gives its output.
 * 4. Otherwise `unknown`.
 */
export function classifyAudioSource(probe: unknown, filename: string): AudioSourceClassification {
  const data = (probe ?? {}) as ProbeLike;
  const tags = collectTags(data);
  const base = filename.split("/").pop() ?? filename;
  const result = (source: AudioSource, reason: string, weakYoutubeHint = false) => ({
    source,
    reason,
    weakYoutubeHint,
  });

  if (APPLE_ID_TAGS.some((key) => key in tags)) return result("apple_music", "apple id atom");
  if (Object.keys(tags).some((key) => key.startsWith("com.apple.itunes"))) {
    return result("apple_music", "com.apple.iTunes key");
  }
  if (tags.handler_name === "Core Media Audio") return result("apple_music", "Core Media handler");

  for (const key of URL_TAGS) {
    const value = tags[key]?.toLowerCase();
    if (!value) continue;
    if (/youtube\.com|youtu\.be/.test(value)) return result("youtube", `${key} url`);
    if (/soundcloud\.com/.test(value)) return result("soundcloud", `${key} url`);
  }
  if (tags.handler_name?.toLowerCase().includes("produced by google")) {
    return result("youtube", "Google handler");
  }
  if (YT_DLP_FILENAME.test(base)) return result("youtube", "yt-dlp filename");

  if (UPLOAD_FILENAME.test(base)) return result("upload", "upload filename");

  const codec = data.streams?.find((stream) => stream.codec_type === "audio")?.codec_name;
  const formats = data.format?.format_name?.split(",") ?? [];
  const weak = codec === "opus" || formats.includes("webm");
  return result("unknown", weak ? "opus/webm without url" : "no signal", weak);
}
