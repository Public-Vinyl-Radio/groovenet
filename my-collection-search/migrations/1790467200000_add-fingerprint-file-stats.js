/**
 * The size and modification time of the audio a fingerprint was taken from
 * (#303).
 *
 * `audio_sha256` already says whether stored work is still right, but finding
 * out means reading the whole file — for a library that is ~150 GB. With the
 * file's size and mtime alongside, a periodic pass can `stat` every file and
 * hash only the ones that moved, which is what makes checking the whole index
 * for replaced audio cheap enough to do hourly.
 *
 * Nullable: existing rows gain them the first time the pass hashes them and
 * finds the audio unchanged, without being re-fingerprinted.
 */
export const up = (pgm) => {
  pgm.addColumns("track_fingerprints", {
    audio_size_bytes: { type: "bigint" },
    // Milliseconds, not nanoseconds: ns since the epoch is ~1.8e18, past what
    // a JSON number carries exactly on the way through the app.
    audio_mtime_ms: { type: "bigint" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("track_fingerprints", ["audio_size_bytes", "audio_mtime_ms"]);
};
