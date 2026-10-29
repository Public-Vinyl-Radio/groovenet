export const shorthands = undefined;

export function up(pgm) {
  // Drop old PK
  pgm.dropConstraint("tracks", "tracks_pkey");
  // Add new compound PK
  pgm.addConstraint("tracks", "tracks_compound_pk", {
    primaryKey: ["track_id", "username"],
  });
}

export function down(pgm) {
  // Remove compound PK
  pgm.dropConstraint("tracks", "tracks_compound_pk");
  // Restore old PK
  pgm.addConstraint("tracks", "tracks_pkey", {
    primaryKey: ["track_id"],
  });
}
