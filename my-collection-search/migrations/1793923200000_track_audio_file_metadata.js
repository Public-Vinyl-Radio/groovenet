export const up = (pgm) => {
  pgm.addColumns("tracks", {
    audio_source: {
      type: "text",
      check: "audio_source IN ('apple_music', 'youtube', 'soundcloud', 'upload', 'unknown')",
    },
    audio_codec: { type: "text" },
    audio_container: { type: "text" },
    audio_sample_rate: { type: "integer" },
    audio_bit_depth: { type: "integer" },
    audio_bitrate: { type: "integer" },
    audio_channels: { type: "integer" },
    audio_size_bytes: { type: "bigint" },
    audio_lossless: { type: "boolean" },
    audio_probed_at: { type: "timestamptz" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("tracks", [
    "audio_source",
    "audio_codec",
    "audio_container",
    "audio_sample_rate",
    "audio_bit_depth",
    "audio_bitrate",
    "audio_channels",
    "audio_size_bytes",
    "audio_lossless",
    "audio_probed_at",
  ]);
};
