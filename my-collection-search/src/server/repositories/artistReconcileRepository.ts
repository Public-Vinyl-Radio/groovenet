import { dbQuery } from "@/lib/serverDb";

export type UncreditedAlbum = {
  release_id: string;
  friend_id: number;
  username: string;
  artist: string;
};

export type UncreditedTrack = UncreditedAlbum & { track_id: string };

export type LegacyCreditCount = { credited_as: string; count: number };

/** Reads for the artist backfill (#705). Writes go through ArtistImportRepository. */
export class ArtistReconcileRepository {
  /** Every album artist string in scope, credited or not, for the baseline. */
  async listAlbumArtists(friendId: number | null): Promise<string[]> {
    const { rows } = await dbQuery<{ artist: string }>(
      `SELECT artist FROM albums WHERE ($1::int IS NULL OR friend_id = $1) ORDER BY id`,
      [friendId],
    );
    return rows.map((r) => r.artist);
  }

  async listUncreditedAlbums(friendId: number | null): Promise<UncreditedAlbum[]> {
    const { rows } = await dbQuery<UncreditedAlbum>(
      `SELECT a.release_id, a.friend_id, f.username, a.artist
       FROM albums a JOIN friends f ON f.id = a.friend_id
       WHERE ($1::int IS NULL OR a.friend_id = $1)
         AND NOT EXISTS (SELECT 1 FROM album_artists aa WHERE aa.album_id = a.id)
       ORDER BY a.id`,
      [friendId],
    );
    return rows;
  }

  async listUncreditedTracks(friendId: number | null): Promise<UncreditedTrack[]> {
    const { rows } = await dbQuery<UncreditedTrack>(
      `SELECT t.track_id, t.friend_id, f.username, t.artist,
              COALESCE(t.release_id, split_part(t.track_id, '-', 1)) AS release_id
       FROM tracks t JOIN friends f ON f.id = t.friend_id
       WHERE ($1::int IS NULL OR t.friend_id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM track_artists ta
           WHERE ta.track_id = t.track_id AND ta.friend_id = t.friend_id
         )
       ORDER BY t.friend_id, t.track_id`,
      [friendId],
    );
    return rows;
  }

  /** String-only credits already written, so a later run still lists them for review. */
  async countLegacyCredits(
    table: "album_artists" | "track_artists",
    friendId: number | null,
  ): Promise<LegacyCreditCount[]> {
    const scope =
      table === "album_artists"
        ? "JOIN albums a ON a.id = c.album_id WHERE ($1::int IS NULL OR a.friend_id = $1)"
        : "WHERE ($1::int IS NULL OR c.friend_id = $1)";
    const { rows } = await dbQuery<LegacyCreditCount>(
      `SELECT c.credited_as, COUNT(*)::int AS count FROM ${table} c ${scope}
       AND c.source = 'legacy' GROUP BY c.credited_as`,
      [friendId],
    );
    return rows;
  }

  async listKnownArtists(): Promise<{
    discogsIds: string[];
    aliases: { alias_normalized: string; has_discogs_id: boolean }[];
  }> {
    const ids = await dbQuery<{ id: string }>(
      "SELECT discogs_artist_id::text AS id FROM artists WHERE discogs_artist_id IS NOT NULL",
    );
    const aliases = await dbQuery<{ alias_normalized: string; has_discogs_id: boolean }>(
      `SELECT aa.alias_normalized, a.discogs_artist_id IS NOT NULL AS has_discogs_id
       FROM artist_aliases aa JOIN artists a ON a.id = aa.artist_id`,
    );
    return { discogsIds: ids.rows.map((r) => r.id), aliases: aliases.rows };
  }
}

export const artistReconcileRepository = new ArtistReconcileRepository();
