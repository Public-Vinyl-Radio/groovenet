import type { PoolClient } from "pg";
import { chooseArtistSlug } from "@/lib/artists/slug.js";

type Db = Pick<PoolClient, "query">;

/** A free slug for this name: not held, now or formerly, by any other artist (#1079). */
export function freeArtistSlug(
  db: Db,
  name: string,
  discogsId: string | number | null | undefined,
  artistId: number | null = null,
): Promise<string> {
  return chooseArtistSlug(
    name,
    discogsId == null ? null : String(discogsId),
    async (slug: string) => {
      const { rows } = await db.query(
        `SELECT 1 FROM artists WHERE slug = $1 AND id IS DISTINCT FROM $2
       UNION ALL SELECT 1 FROM artist_slug_history WHERE slug = $1 AND artist_id IS DISTINCT FROM $2`,
        [slug, artistId],
      );
      return rows.length > 0;
    },
  );
}

/**
 * Point an artist at the slug its current name produces. The old slug is kept
 * as a redirect; a slug the artist is returning to stops being one.
 */
export async function regenerateArtistSlug(db: Db, artistId: number): Promise<void> {
  const { rows } = await db.query<{
    name: string;
    slug: string;
    discogs_artist_id: string | null;
  }>("SELECT name, slug, discogs_artist_id::text FROM artists WHERE id = $1", [artistId]);
  const artist = rows[0];
  if (!artist) return;
  const slug = await freeArtistSlug(db, artist.name, artist.discogs_artist_id, artistId);
  if (slug === artist.slug) return;
  await db.query(
    "INSERT INTO artist_slug_history (slug, artist_id) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING",
    [artist.slug, artistId],
  );
  await db.query("DELETE FROM artist_slug_history WHERE slug = $1 AND artist_id = $2", [
    slug,
    artistId,
  ]);
  await db.query("UPDATE artists SET slug = $2 WHERE id = $1", [artistId, slug]);
}
