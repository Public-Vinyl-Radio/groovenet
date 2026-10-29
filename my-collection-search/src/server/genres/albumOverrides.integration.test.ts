import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { dbPool, dbQuery, withDbTransaction } from "@/lib/serverDb";
import { albumRepository } from "@/server/repositories/albumRepository";
import { albumApiService } from "@/server/services/albumApiService";
import { genreRepository } from "@/server/repositories/genreRepository";
import { genrePageRepository } from "@/server/repositories/genrePageRepository";
import { genreSimilarityRepository } from "@/server/repositories/genreSimilarityRepository";
import { discogsReleaseToAlbum, upsertAlbum } from "@/server/services/albumUpsertService";
import { createGenre, mergeGenres } from "@/server/services/genreAdminService";
import { trackSpinEventRepository } from "@/server/repositories/trackSpinEventRepository";
import { trackGenreFilterClause } from "@/lib/trackFilterSpec";
import type { DiscogsRelease } from "@/types/track";

vi.mock("@/server/services/genreSimilarityService", () => ({
  triggerGenreSimilarityRefresh: vi.fn(),
}));
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const RELEASE = "378-test-release";
const USERS = ["378-owner", "378-other"];
let friend = 0;
let other = 0;
let ids: Record<string, string> = {};

async function sync(friendId: number, genres = ["Latin"], styles = ["Cumbia"]) {
  const release = {
    id: RELEASE,
    title: "Imported",
    genres,
    styles,
    artists_sort: "Artist",
  } as unknown as DiscogsRelease;
  return withDbTransaction((client) =>
    upsertAlbum(client, discogsReleaseToAlbum(release, friendId), { preserveManualFields: true }),
  );
}
async function replace(genreIds: string[] | null, styleIds: string[] | null) {
  return withDbTransaction((client) =>
    albumRepository.updateAlbumFields(client, {
      release_id: RELEASE,
      friend_id: friend,
      genre_override_ids: genreIds,
      style_override_ids: styleIds,
    }),
  );
}
async function cleanup() {
  await dbQuery("DELETE FROM friends WHERE username = ANY($1)", [USERS]);
  await dbQuery("DELETE FROM genres WHERE name LIKE '378 Test %'");
}
beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ($1), ($2) RETURNING id",
    USERS,
  );
  [friend, other] = rows.map((row) => row.id);
  ids = Object.fromEntries(
    (
      await dbQuery<{ id: string; name: string }>(
        "SELECT id, name FROM genres WHERE name = ANY($1)",
        [["Jazz", "Latin", "Cumbia", "Fusion", "Salsa"]],
      )
    ).rows.map((row) => [row.name, row.id]),
  );
  await sync(friend);
  await sync(other);
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("album taxonomy replacements in Postgres", () => {
  dbTest(
    "preserves both replacements through Discogs imports and resets to the newest source",
    async () => {
      await replace([ids.Jazz], [ids.Fusion]);
      await sync(friend, ["Electronic"], ["House"]);
      expect(await albumRepository.getAlbumByReleaseAndFriend(RELEASE, friend)).toMatchObject({
        genres: ["Electronic"],
        styles: ["House"],
        effective_genres: ["Jazz"],
        effective_styles: ["Fusion"],
        genre_override_ids: [ids.Jazz],
        style_override_ids: [ids.Fusion],
      });
      expect(await replace(null, null)).toMatchObject({
        genres: ["Electronic"],
        styles: ["House"],
        effective_genres: ["Electronic"],
        effective_styles: ["House"],
        genre_override_ids: null,
        style_override_ids: null,
      });
      await sync(friend);
    },
  );
  dbTest(
    "empty replacements suppress the source; resetting a category leaves the other override intact",
    async () => {
      expect(await replace([], [])).toMatchObject({ effective_genres: [], effective_styles: [] });
      await sync(friend);
      expect(await replace(null, [])).toMatchObject({
        effective_genres: ["Latin"],
        effective_styles: [],
        style_override_ids: [],
      });
    },
  );
  dbTest("search, genre pages, track fallback and similarity agree, scoped by friend", async () => {
    await replace([ids.Jazz], [ids.Fusion]);
    expect(
      await withDbTransaction((client) =>
        albumRepository.updateAlbumFields(client, {
          release_id: RELEASE,
          friend_id: friend,
          album_rating: 4,
        }),
      ),
    ).toMatchObject({ effective_styles: ["Fusion"], style_override_ids: [ids.Fusion] });
    const fusion = await genreRepository.expandToFilter([ids.Fusion]);
    const cumbia = await genreRepository.expandToFilter([ids.Cumbia]);
    const search = (friendId: number, genreFilter: typeof fusion) =>
      albumApiService.searchAlbums({
        q: "",
        limit: 20,
        offset: 0,
        friendId: String(friendId),
        sort: "title:asc",
        genreFilter,
      });
    expect((await search(friend, fusion)).hits).toEqual([
      expect.objectContaining({ effective_styles: ["Fusion"] }),
    ]);
    expect((await search(friend, cumbia)).hits).toEqual([]);
    expect((await search(other, fusion)).hits).toEqual([]);
    expect((await search(other, cumbia)).hits).toHaveLength(1);
    expect(
      await genrePageRepository.counts({
        genreId: ids.Fusion,
        ownKeys: fusion.keys,
        filter: fusion,
        friendId: friend,
      }),
    ).toMatchObject({ albums: 1, albums_total: 1 });
    expect((await genrePageRepository.topAlbums(fusion, friend, 5))[0]).toMatchObject({
      effective_styles: ["Fusion"],
    });

    await dbQuery(
      `INSERT INTO tracks (track_id, friend_id, username, title, artist, release_id, genres, styles)
      VALUES ('378-fallback', $1, $2, 'Fallback', 'Artist', $3, '{Latin}', '{Cumbia}'),
             ('378-own', $1, $2, 'Own', 'Artist', $3, '{Latin}', '{Cumbia}')`,
      [friend, USERS[0], RELEASE],
    );
    await dbQuery(
      "INSERT INTO track_genres (track_id, friend_id, genre_id, source) VALUES ('378-own', $1, $2, 'manual')",
      [friend, ids.Salsa],
    );
    async function matching(filter: typeof fusion) {
      const params: unknown[] = [friend];
      const clause = trackGenreFilterClause(
        filter,
        (value) => {
          params.push(value);
          return `$${params.length}`;
        },
        "t",
      );
      return (
        await dbQuery<{ track_id: string }>(
          `SELECT t.track_id FROM tracks t WHERE t.friend_id=$1 AND ${clause}`,
          params,
        )
      ).rows.map((r) => r.track_id);
    }
    expect(await matching(fusion)).toEqual(["378-fallback"]);
    expect(await matching(cumbia)).toEqual([]);
    expect(await matching(await genreRepository.expandToFilter([ids.Salsa]))).toEqual(["378-own"]);
    expect(await genreRepository.trackFacets(["t.friend_id = $1"], [friend])).toEqual(
      expect.arrayContaining([
        { id: ids.Fusion, track_count: 1 },
        { id: ids.Salsa, track_count: 1 },
      ]),
    );
    const tracks = await albumRepository.getTracksByReleaseAndFriend(RELEASE, friend);
    expect(tracks[0]).toMatchObject({
      genres: ["Latin"],
      styles: ["Cumbia"],
      album_genres: ["Jazz"],
      album_styles: ["Fusion"],
    });
    const session = await dbQuery<{ id: number }>(
      "INSERT INTO spin_sessions (friend_id, release_id, selection_mode, played_at) VALUES ($1,$2,'tracks',now()) RETURNING id",
      [friend, RELEASE],
    );
    await withDbTransaction((client) =>
      trackSpinEventRepository.insertEvents(client, session.rows[0].id, [
        {
          friend_id: friend,
          release_id: RELEASE,
          track_id: "378-own",
          played_at: new Date(),
          ordinal: 0,
          title_snapshot: "Own",
          artist_snapshot: "Artist",
          album_snapshot: "Imported",
        },
      ]),
    );
    expect((await trackSpinEventRepository.listTopTracks({ friend_id: friend }))[0]).toMatchObject({
      styles: ["Fusion"],
      track_genres: [expect.objectContaining({ name: "Salsa" })],
    });
    const counts = await genreSimilarityRepository.loadCoOccurrence();
    expect(counts.albumCounts).toEqual(
      expect.arrayContaining([
        { genre_id: ids.Fusion, album_count: 1 },
        { genre_id: ids.Cumbia, album_count: 1 },
      ]),
    );
    expect(await albumRepository.getAlbumByReleaseAndFriend(RELEASE, other)).toMatchObject({
      effective_styles: ["Cumbia"],
      style_override_ids: null,
    });
  });
  dbTest(
    "foreign keys reject unknown ids atomically and album deletion cascades only its own overrides",
    async () => {
      await expect(replace([], ["00000000-0000-4000-8000-000000000001"])).rejects.toThrow();
      expect(await albumRepository.getAlbumByReleaseAndFriend(RELEASE, friend)).toMatchObject({
        effective_styles: ["Fusion"],
      });
      const absent = await withDbTransaction((client) =>
        albumRepository.updateAlbumFields(client, {
          release_id: "missing",
          friend_id: other,
          genre_override_ids: [],
        }),
      );
      expect(absent).toBeNull();
      await withDbTransaction((client) =>
        albumRepository.updateAlbumFields(client, {
          release_id: RELEASE,
          friend_id: other,
          style_override_ids: [],
        }),
      );
      expect(
        (await dbQuery("SELECT * FROM album_taxonomy_overrides WHERE friend_id=$1", [other])).rows,
      ).toHaveLength(1);
      await dbQuery("DELETE FROM albums WHERE release_id=$1 AND friend_id=$2", [RELEASE, other]);
      expect(
        (await dbQuery("SELECT * FROM album_taxonomy_overrides WHERE friend_id=$1", [other])).rows,
      ).toEqual([]);
      expect(await albumRepository.getAlbumByReleaseAndFriend(RELEASE, friend)).toMatchObject({
        effective_styles: ["Fusion"],
      });
    },
  );
  dbTest("taxonomy merges retarget replacement links, including duplicate survivors", async () => {
    const source = await createGenre("378 Test Source", ids.Latin);
    const target = await createGenre("378 Test Target", ids.Latin);
    await replace([ids.Jazz], [source.id, target.id]);
    await mergeGenres(source.id, target.id);
    expect(await albumRepository.getAlbumByReleaseAndFriend(RELEASE, friend)).toMatchObject({
      effective_styles: ["378 Test Target"],
      style_override_ids: [target.id],
    });
  });
  dbTest("legacy/manual album edits cannot clobber imported source on conflict", async () => {
    await withDbTransaction((client) =>
      upsertAlbum(
        client,
        {
          release_id: RELEASE,
          friend_id: friend,
          title: "Edited",
          artist: "Artist",
          track_count: 2,
          genres: ["Wrong"],
          styles: [],
        },
        { preserveSourceTaxonomy: true },
      ),
    );
    expect(await albumRepository.getAlbumByReleaseAndFriend(RELEASE, friend)).toMatchObject({
      genres: ["Latin"],
      styles: ["Cumbia"],
    });
    await replace(null, null);
    await dbQuery(
      "UPDATE albums SET genres=NULL, styles=NULL WHERE release_id=$1 AND friend_id=$2",
      [RELEASE, friend],
    );
    const tracks = await albumRepository.getTracksByReleaseAndFriend(RELEASE, friend);
    expect(tracks[0]).toMatchObject({ album_genres: [], album_styles: [] });
  });
});
