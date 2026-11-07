import type { Track } from "@/types/track";

export function formatSampleRate(hz?: number | null): string {
  return hz && hz > 0 ? `${hz / 1000} kHz` : "Unknown";
}

export function formatFileSize(bytes?: number | string | null): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "Unknown";
  return value >= 1e9 ? `${(value / 1e9).toFixed(2)} GB` : `${(value / 1e6).toFixed(1)} MB`;
}

/** Local quality uses stored measurements; stream quality is explicitly nominal. */
export function fileInfo(track: Track) {
  const streamed = !track.local_audio_url;
  const source = streamed
    ? track.apple_music_url
      ? "apple_music"
      : track.youtube_url
        ? "youtube"
        : track.soundcloud_url
          ? "soundcloud"
          : "unknown"
    : (track.audio_source ?? "unknown");
  const codec = streamed ? (source === "apple_music" ? "aac" : null) : track.audio_codec;
  const bitrate = streamed ? (source === "apple_music" ? 256000 : null) : track.audio_bitrate;
  const lossless = streamed ? (codec ? false : null) : track.audio_lossless;
  const quality = [
    codec?.toUpperCase() ?? "Quality unknown",
    lossless
      ? track.audio_bit_depth && track.audio_sample_rate
        ? `${track.audio_bit_depth}/${track.audio_sample_rate / 1000}`
        : ""
      : bitrate
        ? `${Math.round(bitrate / 1000)}`
        : "",
  ]
    .filter(Boolean)
    .join(" ");
  const path = track.local_audio_url;
  return {
    streamed,
    source,
    lossless,
    label: `${quality}${streamed ? " · Stream" : ""}`,
    details: [
      ["Codec", codec?.toUpperCase() ?? "Unknown"],
      ["Container", streamed ? "Not measured" : (track.audio_container ?? "Unknown")],
      ["Sample rate", streamed ? "Not measured" : formatSampleRate(track.audio_sample_rate)],
      [
        "Bit depth",
        !streamed && track.audio_bit_depth ? `${track.audio_bit_depth} bit` : "Unknown",
      ],
      ["Bitrate", bitrate ? `${Math.round(bitrate / 1000)} kbps` : "Unknown"],
      ["Channels", !streamed && track.audio_channels ? `${track.audio_channels}` : "Unknown"],
      ["Size", streamed ? "Not measured" : formatFileSize(track.audio_size_bytes)],
      ["File name", path ? path.split("/").pop()! : "No local file"],
    ],
  };
}

export const fileSources = {
  apple_music: { label: "Apple Music", stroke: "solid" },
  youtube: { label: "YouTube", stroke: "dashed" },
  soundcloud: { label: "SoundCloud", stroke: "dashed" },
  upload: { label: "Upload", stroke: "dotted" },
  unknown: { label: "Unknown", stroke: "double" },
} as const;
