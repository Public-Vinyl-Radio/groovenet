import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withDbTransaction } from "@/lib/serverDb";
import { normaliseArtistName } from "@/lib/artists/normalization";
import { freeArtistSlug } from "@/server/artists/artistSlug";
import type { ImportArtistCredit } from "@/lib/artists/importCredits";

/** Import only owns automatic credits. Manual credits are the review tool's override. */
export class ArtistImportRepository {
  async importAlbumCredits(
    releaseId: string,
    friendId: number,
    credits: ImportArtistCredit[],
  ): Promise<void> {
    await withDbTransaction(async (db) => {
      const { rows } = await db.query<{ id: number }>(
        "SELECT id FROM albums WHERE release_id = $1 AND friend_id = $2 FOR UPDATE",
        [releaseId, friendId],
      );
      if (!rows[0]) throw new Error("Cannot credit a missing album");
      await this.importCredits(db, "album_artists", ["album_id"], [rows[0].id], credits);
    });
  }

  async importTrackCredits(
    trackId: string,
    friendId: number,
    credits: ImportArtistCredit[],
  ): Promise<void> {
    await withDbTransaction(async (db) => {
      await db.query("SELECT id FROM tracks WHERE track_id = $1 AND friend_id = $2 FOR UPDATE", [
        trackId,
        friendId,
      ]);
      await this.importCredits(
        db,
        "track_artists",
        ["track_id", "friend_id"],
        [trackId, friendId],
        credits,
      );
    });
  }

  private async importCredits(
    db: PoolClient,
    table: string,
    columns: string[],
    keys: (string | number)[],
    credits: ImportArtistCredit[],
  ): Promise<void> {
    const where = columns.map((column, i) => `${column} = $${i + 1}`).join(" AND ");
    await db.query("SELECT pg_advisory_xact_lock(704, 0)");
    const manual = await db.query(
      `SELECT 1 FROM ${table} WHERE ${where} AND source = 'manual'`,
      keys,
    );
    if (manual.rows.length) return;

    // Serialize identity resolution across friends and concurrent album/track imports.
    // Unlike an ON CONFLICT retry, this also protects the alias-to-identity decision.
    await db.query(`DELETE FROM ${table} WHERE ${where} AND source IN ('discogs', 'legacy')`, keys);
    for (const credit of credits) {
      const artistId = await this.resolveArtist(db, credit);
      const overrides = await db.query<{
        credit_override:
          | {
              artist_id: number;
              role: string;
              position: number;
              credited_as: string;
              joiner?: string | null;
            }[]
          | null;
      }>("SELECT credit_override FROM artists WHERE id = $1", [artistId]);
      const split = overrides.rows[0]?.credit_override;
      for (const resolved of split ?? [{ ...credit, artist_id: artistId }]) {
        const params = [
          ...keys,
          resolved.artist_id,
          resolved.role,
          resolved.position,
          resolved.credited_as,
          resolved.joiner ?? null,
          split ? "manual" : credit.source,
        ];
        await db.query(
          `INSERT INTO ${table} (${[...columns, "artist_id", "role", "position", "credited_as", "joiner", "source"].join(", ")})
           SELECT ${[...keys.map((_, i) => `$${i + 1}`), `(WITH RECURSIVE resolved AS (SELECT id, merged_into FROM artists WHERE id = $${keys.length + 1} UNION ALL SELECT a.id, a.merged_into FROM artists a JOIN resolved r ON a.id = r.merged_into) SELECT id FROM resolved WHERE merged_into IS NULL)`, ...params.slice(keys.length + 1).map((_, i) => `$${keys.length + 2 + i}`)].join(", ")}
           ON CONFLICT DO NOTHING`,
          params,
        );
      }
    }
  }

  private async resolveArtist(db: PoolClient, credit: ImportArtistCredit): Promise<number> {
    const normalized = normaliseArtistName(credit.name);
    // Placeholder synonyms have one identity. Numbered Discogs homonyms stay distinct.
    const identity = credit.is_placeholder ? credit.name : (credit.discogs_artist_id ?? normalized);
    const identityKey = `artist-${createHash("sha256")
      .update(
        `${credit.is_placeholder ? "placeholder" : credit.discogs_artist_id ? "discogs" : "legacy"}:${identity}`,
      )
      .digest("hex")}`;
    const { rows } = await db.query<{ id: number }>(
      `WITH RECURSIVE matched AS (SELECT a.id FROM artists a
       WHERE ($1::bigint IS NOT NULL AND a.discogs_artist_id = $1)
          OR a.identity_key = $2
          OR EXISTS (SELECT 1 FROM artist_aliases aa WHERE aa.artist_id = a.id AND aa.alias_normalized = $3
              AND ($1::bigint IS NULL OR a.discogs_artist_id IS NULL OR aa.is_manual))
       ORDER BY (a.discogs_artist_id = $1) DESC NULLS LAST, a.id LIMIT 1),
       resolved AS (
         SELECT a.id, a.merged_into FROM artists a JOIN matched m ON a.id = m.id
         UNION ALL SELECT a.id, a.merged_into FROM artists a JOIN resolved r ON a.id = r.merged_into
       ) SELECT id FROM resolved WHERE merged_into IS NULL`,
      [credit.discogs_artist_id, identityKey, normalized],
    );
    let id = rows[0]?.id;
    if (id == null) {
      const slug = await freeArtistSlug(db, credit.name, credit.discogs_artist_id);
      const created = await db.query<{ id: number }>(
        `INSERT INTO artists (name, sort_name, slug, identity_key, discogs_artist_id, is_placeholder)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          credit.name,
          credit.sort_name,
          slug,
          identityKey,
          credit.discogs_artist_id,
          credit.is_placeholder,
        ],
      );
      id = created.rows[0].id;
    } else if (credit.discogs_artist_id) {
      await db.query(
        `UPDATE artists SET discogs_artist_id = $2 WHERE id = $1 AND discogs_artist_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM artists WHERE discogs_artist_id = $2)`,
        [id, credit.discogs_artist_id],
      );
    }
    // A shared spelling can name two Discogs identities. Keep the original alias;
    // ids still resolve both correctly, and legacy credits remain reviewable.
    await db.query(
      `INSERT INTO artist_aliases (artist_id, alias, alias_normalized) VALUES ($1, $2, $3)
       ON CONFLICT (alias_normalized) DO NOTHING`,
      [id, credit.credited_as, normaliseArtistName(credit.credited_as) || normalized],
    );
    return id;
  }
}

export const artistImportRepository = new ArtistImportRepository();
