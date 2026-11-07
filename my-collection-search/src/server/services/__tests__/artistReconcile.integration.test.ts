import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { reconcileArtists } from "../artistReconcileService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
let friendId: number;

const counts = async () => {
  const { rows } = await dbQuery<{ artists: number; albums: number; tracks: number }>(
    `SELECT (SELECT COUNT(*)::int FROM artists) AS artists,
            (SELECT COUNT(*)::int FROM album_artists aa JOIN albums a ON a.id = aa.album_id
              WHERE a.friend_id = $1) AS albums,
            (SELECT COUNT(*)::int FROM track_artists WHERE friend_id = $1) AS tracks`,
    [friendId],
  );
  return rows[0];
};

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  const friend = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ('artist-reconcile-test') RETURNING id",
  );
  friendId = friend.rows[0].id;
  const rows = [
    ["705001", "Reconcilers, The"],
    ["705002", "Earth, Wind & Fire"],
    ["705003", "Various"],
    ["705004", "Fruko Y Sus Tesos"],
  ];
  for (const [release, artist] of rows) {
    await dbQuery(
      "INSERT INTO albums (release_id, friend_id, title, artist) VALUES ($1, $2, 'Test', $3)",
      [release, friendId, artist],
    );
    await dbQuery(
      `INSERT INTO tracks (track_id, release_id, friend_id, username, title, artist)
       VALUES ($1, $2, $3, 'artist-reconcile-test', 'Test', $4)`,
      [`${release}-A1`, release, friendId, release === "705003" ? "Los Mirlos" : artist],
    );
  }
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await dbQuery("DELETE FROM friends WHERE id = $1", [friendId]);
  await dbPool.end();
});

describe("artist reconcile on Postgres", () => {
  dbTest("dry run writes nothing, a run links everything, a second run does no work", async () => {
    const before = await counts();
    const dry = await reconcileArtists({ dry_run: true, friend_id: friendId });
    expect(await counts()).toEqual(before);
    expect(dry.albums).toEqual({ pending: 4, linked: 0, failed: 0 });
    expect(dry.tracks).toEqual({ pending: 4, linked: 0, failed: 0 });
    expect(dry.baseline).toMatchObject({ albums: 4, inversions: 1, various: 1 });
    expect(dry.review_queue).toEqual([{ credited_as: "Earth, Wind & Fire", albums: 1, tracks: 1 }]);

    const run = await reconcileArtists({ friend_id: friendId });
    expect(run.albums).toEqual({ pending: 4, linked: 4, failed: 0 });
    expect(run.tracks).toEqual({ pending: 4, linked: 4, failed: 0 });
    expect(run.artists).toEqual(dry.artists);
    const after = await counts();
    expect(after).toMatchObject({ albums: 4, tracks: 4 });
    // The dry run's prediction is what the import resolver actually did.
    expect(after.artists - before.artists).toBe(dry.artists.created);

    const { rows } = await dbQuery<{ name: string; sort_name: string; credited_as: string }>(
      `SELECT ar.name, ar.sort_name, aa.credited_as FROM album_artists aa
       JOIN albums a ON a.id = aa.album_id JOIN artists ar ON ar.id = aa.artist_id
       WHERE a.friend_id = $1 ORDER BY a.release_id`,
      [friendId],
    );
    // Not split: one artist per string, inversions turned round.
    expect(rows.map((r) => r.name)).toEqual([
      "The Reconcilers",
      "Earth, Wind & Fire",
      "Various",
      "Fruko Y Sus Tesos",
    ]);
    expect(rows[0].sort_name).toBe("Reconcilers, The");

    const again = await reconcileArtists({ friend_id: friendId });
    expect(await counts()).toEqual(after);
    expect(again.albums).toEqual({ pending: 0, linked: 0, failed: 0 });
    expect(again.tracks).toEqual({ pending: 0, linked: 0, failed: 0 });
    expect(again.credits).toEqual({ discogs: 0, legacy: 0 });
    // Written string-only credits stay in the queue until reviewed.
    expect(again.review_queue).toEqual(dry.review_queue);
  });
});
