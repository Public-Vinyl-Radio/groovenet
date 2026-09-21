/** Automatic sessions retain their source detection for replay-safe aggregation. */
export const up = (pgm) => {
  pgm.dropConstraint("spin_sessions", "spin_sessions_selection_mode_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_selection_mode_check", {
    check: "selection_mode IN ('sides', 'tracks', 'automatic')",
  });
  pgm.addColumns("spin_sessions", {
    provenance: { type: "varchar(20)", notNull: true, default: "manual" },
    source_id: { type: "varchar(255)" },
    detection_id: { type: "uuid", references: "play_detections(id)", onDelete: "SET NULL" },
    confidence: { type: "real" },
  });
  pgm.addConstraint("spin_sessions", "spin_sessions_provenance_check", {
    check: "provenance IN ('manual', 'automatic')",
  });
  pgm.addConstraint("spin_sessions", "spin_sessions_automatic_payload_check", {
    check: "(provenance = 'manual' AND source_id IS NULL AND detection_id IS NULL) OR (provenance = 'automatic' AND source_id IS NOT NULL AND detection_id IS NOT NULL)",
  });
  pgm.createIndex("spin_sessions", "detection_id", {
    name: "spin_sessions_automatic_detection_unique",
    unique: true,
    where: "detection_id IS NOT NULL",
  });
};

export const down = (pgm) => {
  pgm.dropIndex("spin_sessions", "detection_id", { name: "spin_sessions_automatic_detection_unique" });
  pgm.dropConstraint("spin_sessions", "spin_sessions_automatic_payload_check");
  pgm.dropConstraint("spin_sessions", "spin_sessions_provenance_check");
  pgm.dropColumns("spin_sessions", ["provenance", "source_id", "detection_id", "confidence"]);
  pgm.dropConstraint("spin_sessions", "spin_sessions_selection_mode_check");
  pgm.addConstraint("spin_sessions", "spin_sessions_selection_mode_check", { check: "selection_mode IN ('sides', 'tracks')" });
};
