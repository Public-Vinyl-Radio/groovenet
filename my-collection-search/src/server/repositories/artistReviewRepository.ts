import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { dbQuery, withDbTransaction } from "@/lib/serverDb";
import { needsReview } from "@/lib/artists/reconcile";
import { normaliseArtistName } from "@/lib/artists/normalization";
import type {
  ArtistReviewAction,
  ArtistReviewDetail,
  ArtistReviewQuery,
  ArtistReviewResult,
} from "@/api-contract/artistReview";

export class ArtistReviewError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
type Snapshot = Record<string, Record<string, unknown>[]>;
const tables = ["artists", "artist_aliases", "album_artists", "track_artists"] as const;
class PreviewRollback {
  constructor(public result: ArtistReviewResult) {}
}

export class ArtistReviewRepository {
  async list(query: ArtistReviewQuery): Promise<{ items: ArtistReviewDetail[] }> {
    let ids: number[];
    if (query.artist_id !== undefined) ids = [query.artist_id];
    else {
      const candidates = await dbQuery<{ id: number; spellings: string[] }>(
        `SELECT a.id, ARRAY(
          SELECT credited_as FROM album_artists WHERE artist_id = a.id AND source = 'legacy'
          UNION SELECT credited_as FROM track_artists WHERE artist_id = a.id AND source = 'legacy'
        ) AS spellings FROM artists a WHERE NOT a.reviewed AND a.merged_into IS NULL ORDER BY a.id`,
      );
      ids = candidates.rows
        .filter((row) => row.spellings.some(needsReview))
        .map((row) => row.id)
        .slice(query.offset, query.offset + query.limit);
    }
    if (!ids.length) return { items: [] };
    const { rows } = await dbQuery<ArtistReviewDetail>(
      `SELECT a.id, a.name, a.sort_name, a.is_placeholder, a.reviewed,
       ARRAY(SELECT alias FROM artist_aliases WHERE artist_id = a.id ORDER BY alias_normalized) AS aliases,
       COALESCE((SELECT jsonb_agg(e) FROM (
         SELECT al.release_id, al.friend_id, f.username, al.title, al.artist AS original_string,
           (SELECT jsonb_agg(c) FROM album_artists c WHERE c.album_id = al.id) AS credits
         FROM albums al JOIN friends f ON f.id = al.friend_id
         WHERE al.id IN (SELECT album_id FROM album_artists WHERE artist_id = a.id)
            OR al.artist = ANY(ARRAY(SELECT alias FROM artist_aliases WHERE artist_id = a.id))
         ORDER BY al.id LIMIT 20) e), '[]') AS albums,
       COALESCE((SELECT jsonb_agg(e) FROM (
         SELECT t.track_id, t.friend_id, t.title, t.artist AS original_string, t.local_audio_url, t.audio_source,
           (SELECT jsonb_agg(c) FROM track_artists c WHERE c.track_id = t.track_id AND c.friend_id = t.friend_id) AS credits
         FROM tracks t WHERE (t.track_id, t.friend_id) IN
           (SELECT track_id, friend_id FROM track_artists WHERE artist_id = a.id)
         ORDER BY t.track_id, t.friend_id LIMIT 20) e), '[]') AS tracks,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'source_id', source_id, 'target_id', target_id) ORDER BY id)
         FROM artist_merges WHERE target_id = a.id AND NOT undone), '[]') AS merges
       FROM artists a WHERE a.merged_into IS NULL AND a.id = ANY($1::int[]) ORDER BY a.id`,
      [ids],
    );
    return { items: rows };
  }

  async decide(decision: ArtistReviewAction, dryRun = false): Promise<ArtistReviewResult> {
    try {
      return await withDbTransaction(async (db) => {
        await db.query("SELECT pg_advisory_xact_lock(704, 0)");
        // Review is rare. Protect snapshots against other repository writers as well as imports.
        await db.query(
          "LOCK TABLE artists, artist_aliases, album_artists, track_artists IN SHARE ROW EXCLUSIVE MODE",
        );
        const result: ArtistReviewResult = { dry_run: dryRun, decision };
        if (decision.action === "unmerge") {
          await this.unmerge(db, decision.merge_id);
        } else {
          const ids = [
            decision.artist_id,
            ...(decision.action === "merge"
              ? [decision.target_id]
              : decision.action === "split"
                ? decision.credits.flatMap((c) => ("artist_id" in c ? [c.artist_id] : []))
                : []),
          ];
          const { rows } = await db.query<{ id: number; name: string }>(
            "SELECT id, name FROM artists WHERE id = ANY($1::int[]) AND merged_into IS NULL AND credit_override IS NULL",
            [ids],
          );
          if (new Set(ids).size !== rows.length)
            throw new ArtistReviewError("Artist not found or already merged", 404);
          if (decision.action === "merge") {
            if (decision.artist_id === decision.target_id)
              throw new ArtistReviewError("Cannot merge an artist into itself", 400);
            const before = await this.snapshot(db, ids);
            const oldName = rows.find((a) => a.id === decision.artist_id)!.name;
            await db.query(
              "INSERT INTO artist_aliases (artist_id, alias, alias_normalized) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
              [decision.artist_id, oldName, normaliseArtistName(oldName)],
            );
            await this.replace(db, decision.artist_id, [{ artist_id: decision.target_id }]);
            await db.query(
              "UPDATE artist_aliases SET artist_id = $2, is_manual = true WHERE artist_id = $1",
              ids,
            );
            await db.query(
              "UPDATE artists SET merged_into = $2, reviewed = true, updated_at = now() WHERE id = $1",
              ids,
            );
            await db.query("UPDATE artists SET reviewed = true, updated_at = now() WHERE id = $1", [
              decision.target_id,
            ]);
            const after = await this.snapshot(db, ids);
            const merge = await db.query<{ id: number }>(
              "INSERT INTO artist_merges (source_id, target_id, before_state, after_state) VALUES ($1, $2, $3, $4) RETURNING id",
              [...ids, JSON.stringify(before), JSON.stringify(after)],
            );
            result.merge_id = merge.rows[0].id;
          } else if (decision.action === "split") {
            const credits = [];
            for (const credit of decision.credits) {
              let artistId: number;
              if ("artist_id" in credit) artistId = credit.artist_id;
              else {
                const normalized = normaliseArtistName(credit.name);
                if (!normalized)
                  throw new ArtistReviewError("Name has no searchable characters", 400);
                const existing = await db.query<{ id: number }>(
                  "SELECT a.id FROM artists a JOIN artist_aliases aa ON aa.artist_id = a.id WHERE aa.alias_normalized = $1 AND a.merged_into IS NULL AND a.credit_override IS NULL",
                  [normalized],
                );
                if (existing.rows.length) artistId = existing.rows[0].id;
                else {
                  const created = await db.query<{ id: number }>(
                    "INSERT INTO artists (name, sort_name, slug, reviewed) VALUES ($1, $2, $3, true) RETURNING id",
                    [credit.name, credit.sort_name ?? credit.name, `artist-${randomUUID()}`],
                  );
                  artistId = created.rows[0].id;
                  const alias = await db.query(
                    "INSERT INTO artist_aliases (artist_id, alias, alias_normalized) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING artist_id",
                    [artistId, credit.name, normalized],
                  );
                  if (!alias.rows.length)
                    throw new ArtistReviewError("Split name belongs to an unavailable artist");
                }
              }
              credits.push({
                artist_id: artistId,
                role: credit.role,
                position: credit.position,
                credited_as: credit.credited_as,
              });
            }
            if (
              credits.some((c) => c.artist_id === decision.artist_id) ||
              new Set(credits.map((c) => `${c.artist_id}:${c.role}`)).size !== credits.length
            )
              throw new ArtistReviewError(
                "Split needs distinct credits excluding the source artist",
                400,
              );
            await this.replace(db, decision.artist_id, credits);
            await db.query("UPDATE artists SET credit_override = $2 WHERE id = $1", [
              decision.artist_id,
              JSON.stringify(credits),
            ]);
          } else if (decision.action === "rename") {
            const oldName = rows.find((a) => a.id === decision.artist_id)!.name;
            await db.query(
              "INSERT INTO artist_aliases (artist_id, alias, alias_normalized) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
              [decision.artist_id, oldName, normaliseArtistName(oldName)],
            );
            for (const alias of [decision.name]) {
              const normalized = normaliseArtistName(alias);
              if (!normalized)
                throw new ArtistReviewError("Name has no searchable characters", 400);
              const saved = await db.query(
                "INSERT INTO artist_aliases (artist_id, alias, alias_normalized) VALUES ($1, $2, $3) ON CONFLICT (alias_normalized) DO UPDATE SET alias = artist_aliases.alias WHERE artist_aliases.artist_id = EXCLUDED.artist_id RETURNING artist_id",
                [decision.artist_id, alias, normalized],
              );
              if (!saved.rows.length) throw new ArtistReviewError("Name belongs to another artist");
            }
            await db.query("UPDATE artists SET name = $2, sort_name = $3 WHERE id = $1", [
              decision.artist_id,
              decision.name,
              decision.sort_name,
            ]);
          } else if (decision.action === "placeholder") {
            await db.query("UPDATE artists SET is_placeholder = $2 WHERE id = $1", [
              decision.artist_id,
              decision.is_placeholder,
            ]);
          }
          // Accepting a legacy string as one act is a manual decision too.
          if (
            decision.action === "accept" ||
            decision.action === "placeholder" ||
            decision.action === "rename"
          ) {
            for (const table of ["album_artists", "track_artists"])
              await db.query(`UPDATE ${table} SET source = 'manual' WHERE artist_id = $1`, [
                decision.artist_id,
              ]);
          }
          if (decision.action !== "merge")
            await db.query("UPDATE artists SET reviewed = true, updated_at = now() WHERE id = $1", [
              decision.artist_id,
            ]);
        }
        if (dryRun) throw new PreviewRollback(result);
        return result;
      });
    } catch (error) {
      if (error instanceof PreviewRollback) return error.result;
      throw error;
    }
  }

  private async snapshot(db: PoolClient, ids: number[]): Promise<Snapshot> {
    const state: Snapshot = {};
    for (const table of tables) {
      const { rows } = await db.query(
        `SELECT * FROM ${table} WHERE ${table === "artists" ? "id" : "artist_id"} = ANY($1::int[]) ORDER BY to_jsonb(${table})::text`,
        [ids],
      );
      state[table] = rows;
    }
    // Round-trip dates exactly as pg's jsonb decoder will return them.
    return JSON.parse(JSON.stringify(state)) as Snapshot;
  }

  private async unmerge(db: PoolClient, mergeId: number): Promise<void> {
    const { rows } = await db.query<{
      source_id: number;
      target_id: number;
      before_state: Snapshot;
      after_state: Snapshot;
    }>("SELECT * FROM artist_merges WHERE id = $1 AND NOT undone FOR UPDATE", [mergeId]);
    const merge = rows[0];
    if (!merge) throw new ArtistReviewError("Active merge not found", 404);
    const ids = [merge.source_id, merge.target_id];
    if (!isDeepStrictEqual(await this.snapshot(db, ids), merge.after_state))
      throw new ArtistReviewError("Artists changed since this merge; undo later decisions first");
    for (const table of tables.slice(1)) {
      await db.query(`DELETE FROM ${table} WHERE artist_id = ANY($1::int[])`, [ids]);
      await db.query(
        `INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
        [JSON.stringify(merge.before_state[table])],
      );
    }
    await db.query(
      `UPDATE artists a SET merged_into = b.merged_into, reviewed = b.reviewed, updated_at = b.updated_at
      FROM jsonb_populate_recordset(NULL::artists, $1::jsonb) b WHERE a.id = b.id`,
      [JSON.stringify(merge.before_state.artists)],
    );
    await db.query("UPDATE artist_merges SET undone = true WHERE id = $1", [mergeId]);
  }

  private async replace(
    db: PoolClient,
    sourceId: number,
    credits: { artist_id: number; role?: string; position?: number; credited_as?: string }[],
  ): Promise<void> {
    for (const [table, keys] of [
      ["album_artists", ["album_id"]],
      ["track_artists", ["track_id", "friend_id"]],
    ] as const) {
      // Copy before deleting so a target already on the release keeps its original credit.
      for (const c of credits)
        await db.query(
          `INSERT INTO ${table} (${keys.join(", ")}, artist_id, role, position, credited_as, source)
         SELECT DISTINCT ON (${keys.join(", ")}, COALESCE($3, role)) ${keys.join(", ")}, $2, COALESCE($3, role), COALESCE($4, position), COALESCE($5, credited_as), 'manual'
         FROM ${table} WHERE artist_id = $1 ORDER BY ${keys.join(", ")}, COALESCE($3, role), position
         ON CONFLICT (${keys.join(", ")}, artist_id, role) DO UPDATE SET source = 'manual',
           position = CASE WHEN $3::text IS NULL THEN ${table}.position ELSE EXCLUDED.position END,
           credited_as = CASE WHEN $3::text IS NULL THEN ${table}.credited_as ELSE EXCLUDED.credited_as END`,
          [sourceId, c.artist_id, c.role ?? null, c.position ?? null, c.credited_as ?? null],
        );
      await db.query(`DELETE FROM ${table} WHERE artist_id = $1`, [sourceId]);
      // The importer treats the entire owner as overridden when any credit is manual.
    }
  }
}
export const artistReviewRepository = new ArtistReviewRepository();
