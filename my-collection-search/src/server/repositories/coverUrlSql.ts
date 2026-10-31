/** Display-only cover selection; album_thumbnail remains the raw Discogs import.
 * Album reads also support older covers written only to tracks, scoped by owner.
 * Aliases are trusted SQL identifiers supplied by repositories, never user input.
 */
export function coverUrlSql(alias: string, album = false): string {
  const trackCover = album
    ? `, (SELECT NULLIF(btrim(cover_track.audio_file_album_art_url), '')
          FROM tracks cover_track
          WHERE cover_track.release_id = ${alias}.release_id
            AND cover_track.friend_id = ${alias}.friend_id
            AND NULLIF(btrim(cover_track.audio_file_album_art_url), '') IS NOT NULL
          ORDER BY cover_track.id ASC LIMIT 1)`
    : "";
  return `COALESCE(NULLIF(btrim(${alias}.audio_file_album_art_url), '')${trackCover}, ${alias}.album_thumbnail)`;
}
