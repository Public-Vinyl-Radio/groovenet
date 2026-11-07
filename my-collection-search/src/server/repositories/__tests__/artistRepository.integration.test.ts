import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { artistRepository as repo } from "../artistRepository";
import type { ArtistCredit } from "@/types/artist";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const usernames = ["artists-schema-test-a", "artists-schema-test-b"];
let friends: number[];
let albums: number[];
let artistId: number;
let otherId: number;
const credit = (
  id: number,
  role: ArtistCredit["role"] = "primary",
  position = 0,
): ArtistCredit => ({
  artist_id: id,
  role,
  position,
  credited_as: "Strokes, The",
  joiner: null,
  source: "discogs",
});

async function cleanup() {
  await dbQuery("DELETE FROM friends WHERE username = ANY($1)", [usernames]);
  await dbQuery("DELETE FROM artists WHERE slug LIKE 'artists-schema-test-%'");
}
beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friends = [];
  albums = [];
  for (const username of usernames) {
    const {
      rows: [friend],
    } = await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      username,
    ]);
    friends.push(friend.id);
    const {
      rows: [album],
    } = await dbQuery<{ id: number }>(
      "INSERT INTO albums (release_id, friend_id, title, artist) VALUES ('artists-test-release', $1, 'Title', 'Original album artist') RETURNING id",
      [friend.id],
    );
    albums.push(album.id);
    await dbQuery(
      "INSERT INTO tracks (track_id, friend_id, username, title, artist) VALUES ('artists-test-track', $1, $2, 'Title', 'Original track artist')",
      [friend.id, username],
    );
  }
  artistId = (
    await repo.create({
      name: "The Strokes",
      sort_name: "Strokes, The",
      slug: "artists-schema-test-strokes",
      discogs_artist_id: "999999999999",
      apple_artist_id: "artists-schema-test-apple",
    })
  ).id;
  otherId = (
    await repo.create({
      name: "The Strokes",
      sort_name: "Strokes, The",
      slug: "artists-schema-test-other",
    })
  ).id;
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("artist schema and repository on Postgres", () => {
  dbTest(
    "looks up identities and allows same names but unique slugs and external ids",
    async () => {
      expect((await repo.findById(artistId))?.name).toBe("The Strokes");
      expect((await repo.findBySlug("artists-schema-test-strokes"))?.id).toBe(artistId);
      expect((await repo.findByDiscogsId("999999999999"))?.id).toBe(artistId);
      expect((await repo.findByAppleId("artists-schema-test-apple"))?.id).toBe(artistId);
      const base = { name: "Other", sort_name: "Other", slug: "artists-schema-test-strokes" };
      await expect(repo.create(base)).rejects.toMatchObject({ code: "23505" });
      await expect(
        repo.create({
          ...base,
          slug: "artists-schema-test-duplicate",
          discogs_artist_id: "999999999999",
        }),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(
        repo.create({
          ...base,
          slug: "artists-schema-test-duplicate",
          apple_artist_id: "artists-schema-test-apple",
        }),
      ).rejects.toMatchObject({ code: "23505" });
    },
  );
  dbTest("enforces normalised alias uniqueness without moving ownership", async () => {
    const first = await repo.addAlias(artistId, "The Strókes (2)");
    expect(await repo.addAlias(artistId, "Strokes, The")).toEqual(first);
    await expect(repo.addAlias(otherId, "STROKES")).rejects.toThrow("already belongs");
    expect((await repo.findByAlias("Strokes, The"))?.id).toBe(artistId);
    expect(await repo.listAliases(artistId)).toEqual([first]);
    await expect(
      dbQuery(
        "INSERT INTO artist_aliases (alias, alias_normalized, artist_id) VALUES ('duplicate', 'strokes', $1)",
        [otherId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
  dbTest(
    "keeps album and track credits separate across friends, ordered and multi-role",
    async () => {
      expect(albums[0]).not.toBe(albums[1]);
      await repo.replaceAlbumCredits(albums[0], [
        credit(otherId, "featured", 1),
        credit(artistId),
        credit(artistId, "composer", 2),
      ]);
      await repo.replaceAlbumCredits(albums[1], [credit(otherId)]);
      await repo.replaceTrackCredits("artists-test-track", friends[0], [
        credit(artistId, "remixer"),
      ]);
      await repo.replaceTrackCredits("artists-test-track", friends[1], [credit(otherId)]);
      expect((await repo.listAlbumCredits(albums[0])).map((c) => c.role)).toEqual([
        "primary",
        "featured",
        "composer",
      ]);
      expect(await repo.listAlbumCredits(albums[1])).toEqual([credit(otherId)]);
      expect(await repo.listTrackCredits("artists-test-track", friends[0])).toEqual([
        credit(artistId, "remixer"),
      ]);
      expect(await repo.listTrackCredits("artists-test-track", friends[1])).toEqual([
        credit(otherId),
      ]);
      expect(
        (await dbQuery("SELECT artist FROM albums WHERE id = $1", [albums[0]])).rows[0].artist,
      ).toBe("Original album artist");
      expect(
        (
          await dbQuery(
            "SELECT artist FROM tracks WHERE track_id = 'artists-test-track' AND friend_id = $1",
            [friends[0]],
          )
        ).rows[0].artist,
      ).toBe("Original track artist");
    },
  );
  dbTest(
    "rolls back replacements on invalid roles, sources, positions, duplicates and missing references",
    async () => {
      const before = await repo.listAlbumCredits(albums[0]);
      for (const invalid of [
        { ...credit(artistId), role: "invalid" },
        { ...credit(artistId), source: "invalid" },
        { ...credit(artistId), position: -1 },
        { ...credit(artistId), artist_id: -1 },
      ]) {
        await expect(
          repo.replaceAlbumCredits(albums[0], [invalid as ArtistCredit]),
        ).rejects.toThrow();
        expect(await repo.listAlbumCredits(albums[0])).toEqual(before);
      }
      await expect(
        repo.replaceAlbumCredits(albums[0], [credit(artistId), credit(artistId)]),
      ).rejects.toMatchObject({ code: "23505" });
      await expect(repo.replaceAlbumCredits(-1, [credit(artistId)])).rejects.toMatchObject({
        code: "23503",
      });
      await expect(
        repo.replaceTrackCredits("missing", friends[0], [credit(artistId)]),
      ).rejects.toMatchObject({ code: "23503" });
      await expect(dbQuery("DELETE FROM artists WHERE id = $1", [artistId])).rejects.toMatchObject({
        code: "23503",
      });
    },
  );
  dbTest(
    "clears credits and cascades collection deletion while retaining shared artists",
    async () => {
      await repo.replaceAlbumCredits(albums[0], []);
      expect(await repo.listAlbumCredits(albums[0])).toEqual([]);
      await dbQuery("DELETE FROM friends WHERE id = $1", [friends[1]]);
      expect(await repo.listAlbumCredits(albums[1])).toEqual([]);
      expect(await repo.listTrackCredits("artists-test-track", friends[1])).toEqual([]);
      expect(await repo.findById(otherId)).not.toBeNull();
      await repo.replaceTrackCredits("artists-test-track", friends[0], []);
      await dbQuery("DELETE FROM artists WHERE id = $1", [artistId]);
      expect(await repo.findByAlias("The Strokes")).toBeNull();
    },
  );
});
