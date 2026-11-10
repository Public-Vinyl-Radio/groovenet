/**
 * Text tags read from the audio file itself (#673).
 *
 * - `tracks.audio_file_genre`: the genre the file declares, kept apart from
 *   `local_tags`/`track_genres` (the DJ's own genre, #368). It is Apple/ID3
 *   taxonomy, not Groovenet's, so it is evidence and never a genre assignment.
 * - `tracks.embedded_tags_read_at`: when the tags were last read, so the backfill
 *   can skip a track whose file has not changed since.
 * - `track_lyrics`: a side table, not a column. Lyrics are copyrighted and large,
 *   and `tracks` is read with `SELECT *` by search, friend views, reindexing and
 *   the embedding pipeline; a column would put every lyric in all of them. A
 *   separate table is read only by a query that names it. `source` records who
 *   wrote the row so an embedded re-read can never overwrite a user's edit.
 *
 * `tracks.composer` already exists and is filled only when empty (no schema change).
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const up = (pgm) => {
  pgm.addColumns("tracks", {
    audio_file_genre: { type: "text[]" },
    embedded_tags_read_at: { type: "timestamptz" },
  });

  pgm.createTable("track_lyrics", {
    track_id: { type: "varchar(255)", notNull: true },
    friend_id: { type: "integer", notNull: true },
    lyrics: { type: "text", notNull: true },
    source: {
      type: "text",
      notNull: true,
      default: "embedded",
      check: "source IN ('embedded', 'user')",
    },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("track_lyrics", "track_lyrics_pkey", {
    primaryKey: ["track_id", "friend_id"],
  });
  pgm.addConstraint("track_lyrics", "track_lyrics_track_fk", {
    foreignKeys: {
      columns: ["track_id", "friend_id"],
      references: "tracks(track_id, friend_id)",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
  });
};

/** @param pgm {import('node-pg-migrate').MigrationBuilder} */
export const down = (pgm) => {
  pgm.dropTable("track_lyrics");
  pgm.dropColumns("tracks", ["audio_file_genre", "embedded_tags_read_at"]);
};
