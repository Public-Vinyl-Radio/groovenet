/**
 * How loud each window was, in dBFS (#282 follow-up).
 *
 * An idle analog chain's hiss matched a quiet stretch of a reference track at
 * 0.876 — twice, at the same spot — and passed the variety check that refuses
 * digital silence. Loudness tells them apart, but the floor that does so
 * depends on the listener and the records, so it is set from these values.
 * Null for rows written before this, and for chunks that could not be decoded.
 */
export const up = (pgm) => {
  pgm.addColumns("play_detections", {
    level_dbfs: { type: "real" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("play_detections", ["level_dbfs"]);
};
