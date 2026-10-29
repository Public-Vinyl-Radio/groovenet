export const shorthands = undefined;

export function up(pgm) {
  pgm.addColumn("tracks", {
    spotify_url: { type: "text", notNull: false },
  });
  pgm.createIndex("tracks", "spotify_url");
}

export function down(pgm) {
  pgm.dropIndex("tracks", "spotify_url");
  pgm.dropColumn("tracks", "spotify_url");
}
