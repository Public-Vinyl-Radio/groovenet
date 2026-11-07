import { normaliseArtistName } from "@/lib/artists/normalization";
import { dbQuery, withDbTransaction } from "@/lib/serverDb";
import type { Artist, ArtistAlias, ArtistCredit, NewArtist } from "@/types/artist";

export class ArtistRepository {
  async create(artist: NewArtist): Promise<Artist> {
    const { rows } = await dbQuery<Artist>(
      `INSERT INTO artists (name, sort_name, slug, discogs_artist_id, apple_artist_id, is_placeholder)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        artist.name,
        artist.sort_name,
        artist.slug,
        artist.discogs_artist_id ?? null,
        artist.apple_artist_id ?? null,
        artist.is_placeholder ?? false,
      ],
    );
    return rows[0];
  }

  async findById(id: number): Promise<Artist | null> {
    const { rows } = await dbQuery<Artist>("SELECT * FROM artists WHERE id = $1", [id]);
    return rows[0] ?? null;
  }

  async findBySlug(slug: string): Promise<Artist | null> {
    // A former slug still finds its artist; the current one wins if both match.
    const { rows } = await dbQuery<Artist>(
      `SELECT a.* FROM artists a
       WHERE a.slug = $1
          OR a.id = (SELECT artist_id FROM artist_slug_history WHERE slug = $1)
       ORDER BY (a.slug = $1) DESC LIMIT 1`,
      [slug],
    );
    return rows[0] ?? null;
  }

  async findByDiscogsId(id: string): Promise<Artist | null> {
    const { rows } = await dbQuery<Artist>("SELECT * FROM artists WHERE discogs_artist_id = $1", [
      id,
    ]);
    return rows[0] ?? null;
  }

  async findByAppleId(id: string): Promise<Artist | null> {
    const { rows } = await dbQuery<Artist>("SELECT * FROM artists WHERE apple_artist_id = $1", [
      id,
    ]);
    return rows[0] ?? null;
  }

  async findByAlias(alias: string): Promise<Artist | null> {
    const { rows } = await dbQuery<Artist>(
      `SELECT a.* FROM artists a JOIN artist_aliases aa ON aa.artist_id = a.id
       WHERE aa.alias_normalized = $1`,
      [normaliseArtistName(alias)],
    );
    return rows[0] ?? null;
  }

  /** Replaying an alias is safe; moving it to another identity requires review. */
  async addAlias(artistId: number, alias: string): Promise<ArtistAlias> {
    const normalized = normaliseArtistName(alias);
    if (!normalized) throw new Error("Artist alias must not be blank");
    const { rows } = await dbQuery<ArtistAlias>(
      `INSERT INTO artist_aliases (artist_id, alias, alias_normalized) VALUES ($1, $2, $3)
       ON CONFLICT (alias_normalized) DO UPDATE SET artist_id = EXCLUDED.artist_id
       WHERE artist_aliases.artist_id = EXCLUDED.artist_id RETURNING *`,
      [artistId, alias, normalized],
    );
    if (!rows[0]) throw new Error("Artist alias already belongs to another artist");
    return rows[0];
  }

  async listAliases(artistId: number): Promise<ArtistAlias[]> {
    const { rows } = await dbQuery<ArtistAlias>(
      "SELECT * FROM artist_aliases WHERE artist_id = $1 ORDER BY alias_normalized",
      [artistId],
    );
    return rows;
  }

  async listAlbumCredits(albumId: number): Promise<ArtistCredit[]> {
    return this.listCredits("album_artists", "album_id = $1", [albumId]);
  }

  async listTrackCredits(trackId: string, friendId: number): Promise<ArtistCredit[]> {
    return this.listCredits("track_artists", "track_id = $1 AND friend_id = $2", [
      trackId,
      friendId,
    ]);
  }

  async replaceAlbumCredits(albumId: number, credits: ArtistCredit[]): Promise<void> {
    await this.replaceCredits("album_artists", ["album_id"], [albumId], credits);
  }

  async replaceTrackCredits(
    trackId: string,
    friendId: number,
    credits: ArtistCredit[],
  ): Promise<void> {
    await this.replaceCredits(
      "track_artists",
      ["track_id", "friend_id"],
      [trackId, friendId],
      credits,
    );
  }

  private async listCredits(
    table: string,
    where: string,
    values: unknown[],
  ): Promise<ArtistCredit[]> {
    const { rows } = await dbQuery<ArtistCredit>(
      `SELECT artist_id, role, position, credited_as, joiner, source FROM ${table}
       WHERE ${where} ORDER BY position, artist_id, role`,
      values,
    );
    return rows;
  }

  private async replaceCredits(
    table: string,
    columns: string[],
    values: unknown[],
    credits: ArtistCredit[],
  ): Promise<void> {
    // Only private callers supply SQL identifiers. Replacements are atomic, including clears.
    await withDbTransaction(async (client) => {
      await client.query(
        `DELETE FROM ${table} WHERE ${columns.map((c, i) => `${c} = $${i + 1}`).join(" AND ")}`,
        values,
      );
      for (const credit of credits) {
        const params = [
          ...values,
          credit.artist_id,
          credit.role,
          credit.position,
          credit.credited_as,
          credit.joiner ?? null,
          credit.source,
        ];
        await client.query(
          `INSERT INTO ${table} (${[...columns, "artist_id", "role", "position", "credited_as", "joiner", "source"].join(", ")})
           VALUES (${params.map((_, i) => `$${i + 1}`).join(", ")})`,
          params,
        );
      }
    });
  }
}

export const artistRepository = new ArtistRepository();
