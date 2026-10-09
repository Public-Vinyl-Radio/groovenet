/**
 * Album artwork provenance (#494).
 *
 * The displayed cover is still `audio_file_album_art_url` (falling back to
 * `album_thumbnail`), so every existing reader keeps working. These columns
 * record where that cover came from and keep what is needed to change it back:
 *
 * - album_art_source: the source the user (or the matcher) chose. NULL means
 *   nobody has chosen yet — the bulk matcher only touches those albums.
 * - discogs_art_url: the Discogs image URL, kept even after an upload replaces
 *   album_thumbnail, so "Restore Discogs art" always has something to restore.
 * - apple_music_art_url: the last embedded (Apple Music) cover extracted for
 *   preview, cached locally.
 * - art_match_status / art_match_distance: the bulk matcher's verdict, and the
 *   perceptual-hash distance it was based on.
 */
export const shorthands = undefined;

export const up = (pgm) => {
  pgm.addColumns("albums", {
    album_art_source: { type: "text", notNull: false },
    discogs_art_url: { type: "text", notNull: false },
    apple_music_art_url: { type: "text", notNull: false },
    art_match_status: { type: "text", notNull: false },
    art_match_distance: { type: "integer", notNull: false },
    art_matched_at: { type: "timestamptz", notNull: false },
  });

  pgm.addConstraint("albums", "albums_album_art_source_check", {
    check: "album_art_source IN ('discogs', 'apple_music', 'upload')",
  });
  pgm.addConstraint("albums", "albums_art_match_status_check", {
    check: "art_match_status IN ('matched', 'mismatch', 'no_reference', 'no_candidate')",
  });

  pgm.sql(`
    UPDATE albums
    SET discogs_art_url = album_thumbnail
    WHERE album_thumbnail ~ '^https?://';

    -- Existing embedded covers were extracted from Apple Music downloads, and
    -- a local album_thumbnail can only have come from an upload. Plain Discogs
    -- art stays NULL: it was never chosen, so the matcher may still improve it.
    UPDATE albums
    SET album_art_source = 'apple_music'
    WHERE audio_file_album_art_url IS NOT NULL AND audio_file_album_art_url <> '';

    UPDATE albums
    SET album_art_source = 'upload'
    WHERE album_art_source IS NULL AND album_thumbnail LIKE '/uploads/%';
  `);

  pgm.createIndex("albums", ["art_match_status"], {
    name: "albums_art_match_status_idx",
    where: "art_match_status IS NOT NULL",
  });
};

export const down = (pgm) => {
  pgm.dropIndex("albums", ["art_match_status"], { name: "albums_art_match_status_idx" });
  pgm.dropConstraint("albums", "albums_art_match_status_check");
  pgm.dropConstraint("albums", "albums_album_art_source_check");
  pgm.dropColumns("albums", [
    "album_art_source",
    "discogs_art_url",
    "apple_music_art_url",
    "art_match_status",
    "art_match_distance",
    "art_matched_at",
  ]);
};
