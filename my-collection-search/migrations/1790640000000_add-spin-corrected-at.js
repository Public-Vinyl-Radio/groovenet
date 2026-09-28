/**
 * When a detected spin was corrected by hand (#336).
 *
 * Editing an automatic spin keeps its provenance and its link to the detection
 * that made it — that link is how we measure how often the listener is wrong —
 * and records the correction here instead. Null for spins never corrected, and
 * for manual spins, whose edits are not corrections of anything.
 */
export const up = (pgm) => {
  pgm.addColumns("spin_sessions", {
    corrected_at: { type: "timestamptz" },
  });
};

export const down = (pgm) => {
  pgm.dropColumns("spin_sessions", ["corrected_at"]);
};
