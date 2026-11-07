import type { ArtistCreditRef } from "@/api-contract/schemas";
import { dbQuery } from "@/lib/serverDb";

export type CreditKey = { id: string; friend_id: number };
type CreditRow = ArtistCreditRef & { key_id: string; key_friend_id: number };

export const creditKey = (id: string, friendId: number) => `${friendId}:${id}`;

const columns = `ar.id, ar.name, ar.slug, ar.is_placeholder, c.role, c.position, c.credited_as`;

function group(rows: CreditRow[]): Map<string, ArtistCreditRef[]> {
  const out = new Map<string, ArtistCreditRef[]>();
  for (const { key_id, key_friend_id, ...credit } of rows) {
    const key = creditKey(key_id, key_friend_id);
    const list = out.get(key) ?? [];
    list.push(credit);
    out.set(key, list);
  }
  return out;
}

/**
 * Structured credits for API responses (#710), batched so a list of albums
 * or tracks costs one query. Keys are `friend_id:release_id` for albums and
 * `friend_id:track_id` for tracks (see `creditKey`).
 */
export class ArtistCreditRepository {
  async forAlbums(keys: CreditKey[]): Promise<Map<string, ArtistCreditRef[]>> {
    if (keys.length === 0) return new Map();
    const { rows } = await dbQuery<CreditRow>(
      `SELECT a.release_id AS key_id, a.friend_id AS key_friend_id, ${columns}
       FROM unnest($1::text[], $2::integer[]) AS k(release_id, friend_id)
       JOIN albums a ON a.release_id = k.release_id AND a.friend_id = k.friend_id
       JOIN album_artists c ON c.album_id = a.id
       JOIN artists ar ON ar.id = c.artist_id
       ORDER BY a.friend_id, a.release_id, c.position, ar.id, c.role`,
      [keys.map((k) => k.id), keys.map((k) => k.friend_id)],
    );
    return group(rows);
  }

  async forTracks(keys: CreditKey[]): Promise<Map<string, ArtistCreditRef[]>> {
    if (keys.length === 0) return new Map();
    const { rows } = await dbQuery<CreditRow>(
      `SELECT c.track_id AS key_id, c.friend_id AS key_friend_id, ${columns}
       FROM unnest($1::text[], $2::integer[]) AS k(track_id, friend_id)
       JOIN track_artists c ON c.track_id = k.track_id AND c.friend_id = k.friend_id
       JOIN artists ar ON ar.id = c.artist_id
       ORDER BY c.friend_id, c.track_id, c.position, ar.id, c.role`,
      [keys.map((k) => k.id), keys.map((k) => k.friend_id)],
    );
    return group(rows);
  }
}

export const artistCreditRepository = new ArtistCreditRepository();
