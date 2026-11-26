/**
 * Playlist owners and private playlists against a real Postgres (#1284).
 *
 * Rolls the schema back to before `playlists.owner_id`, seeds playlists the
 * old way, migrates up and proves every one is the owner's and visible to the
 * household. Then a second profile's private playlist is checked against
 * every query that lists playlists or accepts a playlist id: the owner of
 * the household must not see it anywhere, by list or by id. Then down and up
 * again. Run with `just playlist-owners-test` against a throwaway database;
 * it migrates that database.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery, withDbTransaction } from "@/lib/serverDb";
import { PlaylistRepository } from "../playlistRepository";
import { TrackRepository } from "../trackRepository";
import { homeRepository } from "../homeRepository";
import { SetDerivationRepository } from "../setDerivationRepository";

const enabled = process.env.RUN_DB_TESTS === "1";
const dbTest = it.skipIf(!enabled);
const PREVIOUS = "1795800000000_track-audio-files";
const LIBRARY = "playlist-owners-1284";
const SAM = "Sam (playlist-owners-1284)";
const OLD = ["owners-1284-old-a", "owners-1284-old-b"];
const playlists = new PlaylistRepository();
const tracks = new TrackRepository();
const derivations = new SetDerivationRepository();
const appDir = path.resolve(__dirname, "../../../..");

function migrate(...args: string[]) {
  execFileSync("npm", ["run", "--silent", "migrate", "--", ...args], {
    cwd: appDir,
    env: process.env,
    stdio: "pipe",
  });
}

/** Rolls back every migration from `playlist-owners` on. */
async function migrateDownToPrevious() {
  const { rows } = await dbQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM pgmigrations WHERE name > $1",
    [PREVIOUS],
  );
  if (rows[0].n > 0) migrate("down", String(rows[0].n));
}

let friendId = 0;
let ownerId = "";
let samId = "";
let ownerExisted = false;

async function cleanup() {
  await dbQuery("DELETE FROM playlists WHERE name LIKE 'owners-1284-%'");
  await dbQuery("DELETE FROM friends WHERE username = $1", [LIBRARY]);
  await dbQuery("DELETE FROM users WHERE name = $1", [SAM]);
}

beforeAll(async () => {
  if (!enabled) return;
  await cleanup();
  await migrateDownToPrevious();
  ownerExisted = (await dbQuery("SELECT 1 FROM users WHERE is_owner")).rows.length > 0;
  friendId = (
    await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      LIBRARY,
    ])
  ).rows[0].id;
  await dbQuery(
    `INSERT INTO tracks (track_id, title, artist, username, friend_id)
     VALUES ('o1284-t', 'Track', 'Artist', $1, $2)`,
    [LIBRARY, friendId],
  );
  // Playlists from before owners, one holding the track.
  for (const name of OLD) {
    const { id } = (
      await dbQuery<{ id: number }>("INSERT INTO playlists (name) VALUES ($1) RETURNING id", [name])
    ).rows[0];
    if (name === OLD[0]) {
      await dbQuery(
        "INSERT INTO playlist_tracks (playlist_id, track_id, friend_id, position) VALUES ($1, 'o1284-t', $2, 0)",
        [id, friendId],
      );
    }
  }
}, 120_000);

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  // Leave the database at the latest schema for the next suite.
  migrate("up");
  if (!ownerExisted) await dbQuery("DELETE FROM users WHERE is_owner AND name = 'Owner'");
  await dbPool.end();
}, 120_000);

describe("playlist owners (integration)", () => {
  dbTest(
    "gives every existing playlist to the owner, visible to the household",
    async () => {
      migrate("up", "1");
      ownerId = (await dbQuery<{ id: string }>("SELECT id FROM users WHERE is_owner")).rows[0].id;
      const { rows } = await dbQuery<{ owner_id: string; visibility: string }>(
        "SELECT owner_id, visibility FROM playlists",
      );
      expect(rows.length).toBeGreaterThanOrEqual(OLD.length);
      for (const row of rows) expect(row).toEqual({ owner_id: ownerId, visibility: "household" });

      samId = (
        await dbQuery<{ id: string }>("INSERT INTO users (name) VALUES ($1) RETURNING id", [SAM])
      ).rows[0].id;
      // A household profile still sees every pre-existing playlist.
      const seen = (await playlists.listPlaylists(samId)).map((p) => p.name);
      expect(seen).toEqual(expect.arrayContaining(OLD));
    },
    120_000,
  );

  dbTest("defaults an unowned insert to the owner and rejects unknown visibility", async () => {
    const { rows } = await dbQuery<{ owner_id: string; visibility: string }>(
      "INSERT INTO playlists (name) VALUES ('owners-1284-legacy-insert') RETURNING owner_id, visibility",
    );
    expect(rows[0]).toEqual({ owner_id: ownerId, visibility: "household" });
    await expect(
      dbQuery("INSERT INTO playlists (name, visibility) VALUES ('owners-1284-bad', 'public')"),
    ).rejects.toThrow(/playlists_visibility_check/);
    await expect(
      dbQuery("INSERT INTO playlists (name, owner_id) VALUES ('owners-1284-bad', $1)", [
        "00000000-0000-4000-8000-00000000dead",
      ]),
    ).rejects.toThrow(/foreign key/);
  });

  dbTest("hides a private playlist from every other profile, by list and by id", async () => {
    const mine = await withDbTransaction((client) =>
      playlists.createPlaylistWithClient(client, "owners-1284-private", samId, "private"),
    );
    expect(mine).toMatchObject({ owner_id: samId, owner_name: SAM, visibility: "private" });
    await withDbTransaction((client) =>
      playlists.insertPlaylistTracks(client, mine.id, [
        { track_id: "o1284-t", friend_id: friendId, position: 0 },
      ]),
    );
    const setId = (
      await dbQuery<{ id: number }>(
        "INSERT INTO live_sets (playlist_id, status) VALUES ($1, 'draft') RETURNING id",
        [mine.id],
      )
    ).rows[0].id;

    // Its owner sees it everywhere.
    expect((await playlists.listPlaylists(samId)).map((p) => p.id)).toContain(mine.id);
    expect(await playlists.findPlaylistHeaderById(mine.id, samId)).toMatchObject({
      owner_id: samId,
      owner_name: SAM,
      visibility: "private",
    });
    expect(await playlists.findPlaylistById(mine.id, samId)).toMatchObject({ id: mine.id });
    const ref = { track_id: "o1284-t", friend_id: friendId };
    expect(await tracks.getPlaylistCountsForTracks([ref], samId)).toEqual({
      [`o1284-t:${friendId}`]: 2,
    });
    expect((await tracks.listPlaylistsForTrack(ref.track_id, friendId, samId)).length).toBe(2);
    expect(await homeRepository.counts(friendId, samId)).toMatchObject({ playlists: 2 });
    const samHome = await homeRepository.playlists(friendId, samId);
    expect(samHome.draft_set).toMatchObject({ playlist_id: mine.id });
    expect(samHome.recent.map((r) => r.id)).toContain(mine.id);
    expect(await derivations.playlistExists(mine.id, samId)).toBe(true);
    expect(await derivations.findPlaylistIdForLiveSet(setId, samId)).toBe(mine.id);

    // The household's owner sees it nowhere.
    expect((await playlists.listPlaylists(ownerId)).map((p) => p.id)).not.toContain(mine.id);
    expect(await playlists.findPlaylistHeaderById(mine.id, ownerId)).toBeNull();
    expect(await playlists.findPlaylistById(mine.id, ownerId)).toBeNull();
    await withDbTransaction(async (client) => {
      expect(await playlists.findPlaylistHeaderByIdWithClient(client, mine.id, ownerId)).toBeNull();
    });
    expect(await tracks.getPlaylistCountsForTracks([ref], ownerId)).toEqual({
      [`o1284-t:${friendId}`]: 1,
    });
    expect(
      (await tracks.listPlaylistsForTrack(ref.track_id, friendId, ownerId)).map((p) => p.id),
    ).not.toContain(mine.id);
    expect(await homeRepository.counts(friendId, ownerId)).toMatchObject({ playlists: 1 });
    const ownerHome = await homeRepository.playlists(friendId, ownerId);
    expect(ownerHome.draft_set).toBeNull();
    expect(ownerHome.recent.map((r) => r.id)).not.toContain(mine.id);
    expect(await derivations.playlistExists(mine.id, ownerId)).toBe(false);
    expect(await derivations.findPlaylistIdForLiveSet(setId, ownerId)).toBeNull();
    // A request with no profile at all sees household playlists only.
    expect(await derivations.findPlaylistIdForLiveSet(setId, null)).toBeNull();

    // Deleting by id is a no-op for anyone else, and works for the owner.
    expect(await playlists.deletePlaylistById(mine.id, ownerId)).toBeNull();
    expect(await playlists.findPlaylistHeaderById(mine.id, samId)).not.toBeNull();

    // Made household, the rest of the household sees it, owned by Sam.
    await withDbTransaction((client) =>
      playlists.updatePlaylistVisibility(client, mine.id, "household"),
    );
    expect(await playlists.findPlaylistHeaderById(mine.id, ownerId)).toMatchObject({
      owner_name: SAM,
      visibility: "household",
    });
    await withDbTransaction((client) =>
      playlists.updatePlaylistVisibility(client, mine.id, "private"),
    );

    expect(await playlists.deletePlaylistById(mine.id, samId)).toMatchObject({ id: mine.id });
    expect(await playlists.findPlaylistHeaderById(mine.id, samId)).toBeNull();
  });

  dbTest(
    "rolls back and re-applies onto existing playlists",
    async () => {
      migrate("down", "1");
      const { rows: columns } = await dbQuery(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'playlists' AND column_name IN ('owner_id', 'visibility')",
      );
      expect(columns).toHaveLength(0);
      migrate("up", "1");
      const { rows } = await dbQuery<{ n: number }>(
        "SELECT count(*)::int AS n FROM playlists WHERE owner_id IS DISTINCT FROM household_owner_id() OR visibility <> 'household'",
      );
      expect(rows[0].n).toBe(0);
    },
    120_000,
  );
});
