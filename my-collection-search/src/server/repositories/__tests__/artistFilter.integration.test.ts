import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { artistRepository } from "../artistRepository";
import { artistListRepository } from "../artistListRepository";
import { resolveArtistFilter } from "@/server/artists/artistFilter";
import { albumApiService } from "@/server/services/albumApiService";
import { buildTrackSearchWhere } from "@/server/services/trackSearchWhere";

/**
 * The artist filter and the A to Z index (#709) against real Postgres:
 * matching goes through the credit tables, not the artist string.
 */
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const username = "artist-filter-test";
const slugs = [
  "artist-filter-test-mis",
  "artist-filter-test-meridian",
  "artist-filter-test-mirlos",
  "artist-filter-test-destellos",
  "artist-filter-test-various",
  "artist-filter-test-old-meridian",
  "artist-filter-test-strokes",
  "artist-filter-test-angel",
  "artist-filter-test-digits",
];
let friend: number;
const ids: Record<string, number> = {};

const credit = (artist_id: number, position = 0) => ({
  artist_id,
  role: "primary" as const,
  position,
  credited_as: "x",
  source: "discogs" as const,
});

async function cleanup() {
  await dbQuery("DELETE FROM friends WHERE username = $1", [username]);
  await dbQuery("UPDATE artists SET merged_into = NULL WHERE slug = ANY($1)", [slugs]);
  await dbQuery("DELETE FROM artists WHERE slug = ANY($1)", [slugs]);
}

async function addAlbum(release: string, title: string, artist: string) {
  const { rows } = await dbQuery<{ id: number }>(
    "INSERT INTO albums (release_id, friend_id, title, artist) VALUES ($1, $2, $3, $4) RETURNING id",
    [release, friend, title, artist],
  );
  return rows[0].id;
}

async function addTrack(id: string, release: string, artist: string, deleted = false) {
  await dbQuery(
    `INSERT INTO tracks (track_id, friend_id, username, title, artist, release_id, deleted_at)
     VALUES ($1, $2, $3, $1, $4, $5, ${deleted ? "now()" : "NULL"})`,
    [id, friend, username, artist, release],
  );
}

async function create(key: string, name: string, sortName: string, slug: string) {
  ids[key] = (await artistRepository.create({ name, sort_name: sortName, slug })).id;
}

/** Track ids the track search's filters return for these artist ids. */
async function trackIds(artistIds: number[]) {
  const { where, params } = buildTrackSearchWhere({
    friendId: friend,
    attributes: { artistIds },
  });
  const { rows } = await dbQuery<{ track_id: string }>(
    `SELECT track_id FROM tracks t WHERE ${where.join(" AND ")} AND deleted_at IS NULL ORDER BY track_id`,
    params,
  );
  return rows.map((row) => row.track_id);
}

async function albumReleases(artistIds: number[]) {
  const { hits } = await albumApiService.searchAlbums({
    q: "",
    limit: 50,
    offset: 0,
    friendId: String(friend),
    sort: "title:asc",
    artistIds,
  });
  return hits.map((hit) => hit.release_id).sort();
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friend = (
    await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      username,
    ])
  ).rows[0].id;
  await create("mis", "Mexican Institute of Sound", "Mexican Institute of Sound", slugs[0]);
  await create("meridian", "Meridian Brothers", "Meridian Brothers", slugs[1]);
  await create("mirlos", "Los Mirlos", "Mirlos, Los", slugs[2]);
  await create("destellos", "Los Destellos", "Destellos, Los", slugs[3]);
  await create("various", "Various", "Various", slugs[4]);
  await create("oldMeridian", "Meridian brothers", "Meridian brothers", slugs[5]);
  await create("strokes", "The Strokes", "Strokes, The", slugs[6]);
  await create("angel", "Ángel Canales", "Ángel Canales", slugs[7]);
  await create("digits", "2manydjs", "2manydjs", slugs[8]);
  await dbQuery("UPDATE artists SET merged_into = $1 WHERE id = $2", [
    ids.meridian,
    ids.oldMeridian,
  ]);

  // Release 37417227: one album string, two artists credited on the album,
  // tracks with no credits of their own.
  const ruido = await addAlbum(
    "af-ruido",
    "Ruido Tovar",
    "Mexican Institute Of Sound, Meridian brothers",
  );
  await artistRepository.replaceAlbumCredits(ruido, [credit(ids.mis), credit(ids.meridian, 1)]);
  await addTrack("af-ruido-1", "af-ruido", "Mexican Institute of Sound & Meridian Brothers");
  await addTrack("af-ruido-2", "af-ruido", "Mexican Institute of Sound & Meridian Brothers");

  // Release 26715224: a Various compilation whose tracks credit the real artists.
  const chicha = await addAlbum("af-chicha", "The Roots Of Chicha", "Various");
  await artistRepository.replaceAlbumCredits(chicha, [credit(ids.various)]);
  await addTrack("af-chicha-1", "af-chicha", "Los Mirlos");
  await addTrack("af-chicha-2", "af-chicha", "Los Destellos");
  await addTrack("af-chicha-3", "af-chicha", "Los Mirlos", true);
  await artistRepository.replaceTrackCredits("af-chicha-1", friend, [credit(ids.mirlos)]);
  await artistRepository.replaceTrackCredits("af-chicha-2", friend, [credit(ids.destellos)]);

  // An album credited to Los Destellos with one track credited elsewhere, and
  // a deleted Mirlos track: neither carries the album's credit.
  const destellos = await addAlbum("af-destellos", "Destellos", "Los Destellos");
  await artistRepository.replaceAlbumCredits(destellos, [credit(ids.destellos)]);
  await addTrack("af-destellos-1", "af-destellos", "Los Destellos");
  await addTrack("af-destellos-2", "af-destellos", "Los Mirlos");
  await artistRepository.replaceTrackCredits("af-destellos-2", friend, [credit(ids.mirlos)]);
  await addAlbum("af-gone", "Gone", "Los Mirlos");
  await addTrack("af-gone-1", "af-gone", "Los Mirlos", true);
  await artistRepository.replaceTrackCredits("af-gone-1", friend, [credit(ids.mirlos)]);
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("artist filter (#709)", () => {
  dbTest("resolves slugs and ids, follows a merge to its survivor and names unknowns", async () => {
    expect(await resolveArtistFilter([slugs[1].toUpperCase(), String(ids.mis)])).toEqual({
      ids: [ids.meridian, ids.mis],
      artists: [
        { id: ids.meridian, name: "Meridian Brothers", slug: slugs[1] },
        { id: ids.mis, name: "Mexican Institute of Sound", slug: slugs[0] },
      ],
    });
    // The merged spelling and the survivor are one artist, listed once.
    expect(await resolveArtistFilter([slugs[5], slugs[1]])).toEqual({
      ids: [ids.meridian],
      artists: [{ id: ids.meridian, name: "Meridian Brothers", slug: slugs[1] }],
    });
    expect(await resolveArtistFilter([slugs[1], "artist-filter-test-nobody"])).toEqual({
      unknown: ["artist-filter-test-nobody"],
    });
  });

  dbTest("finds a collaboration through either artist, on its album credits", async () => {
    expect(await trackIds([ids.meridian])).toEqual(["af-ruido-1", "af-ruido-2"]);
    expect(await albumReleases([ids.meridian])).toEqual(["af-ruido"]);
    expect(await albumReleases([ids.mis])).toEqual(["af-ruido"]);
  });

  dbTest("finds a Various compilation through its track credits", async () => {
    expect(await albumReleases([ids.mirlos])).toEqual(["af-chicha", "af-destellos"]);
    expect(await trackIds([ids.mirlos])).toEqual(["af-chicha-1", "af-destellos-2"]);
    expect(await albumReleases([ids.various])).toEqual(["af-chicha"]);
  });

  dbTest("lets a track's own credits win over its album's", async () => {
    expect(await trackIds([ids.destellos])).toEqual(["af-chicha-2", "af-destellos-1"]);
  });

  dbTest("ORs several artists", async () => {
    expect(await albumReleases([ids.meridian, ids.mirlos])).toEqual([
      "af-chicha",
      "af-destellos",
      "af-ruido",
    ]);
  });
});

describe("artist index letters (#709)", () => {
  const letter = async (value: string) =>
    (await artistListRepository.search({ q: "", includePlaceholders: true, letter: value }, 200, 0))
      .map((artist) => artist.slug)
      .filter((slug) => slugs.includes(slug));

  dbTest("files by sort name, with accents folded and the rest under #", async () => {
    expect(await letter("S")).toEqual([slugs[6]]);
    expect(await letter("T")).toEqual([]);
    expect(await letter("A")).toEqual([slugs[7]]);
    expect(await letter("#")).toEqual([slugs[8]]);
    // Merged artists never list.
    expect(await letter("M")).toEqual(expect.not.arrayContaining([slugs[5]]));
    expect(await letter("M")).toEqual(expect.arrayContaining([slugs[0], slugs[1], slugs[2]]));
  });

  dbTest("counts the same filter it lists", async () => {
    const filter = { q: "", includePlaceholders: true, letter: "#" };
    const listed = await artistListRepository.search(filter, 200, 0);
    expect(await artistListRepository.count(filter)).toBe(listed.length);
  });

  dbTest("counts artists per letter, # last, matching the letter filter (#1116)", async () => {
    const counts = await artistListRepository.letterCounts({ includePlaceholders: false });
    const letters = counts.map((row) => row.letter);
    expect(letters).toEqual(
      [...letters].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a < b ? -1 : 1)),
    );
    for (const { letter, count } of counts) {
      expect(await artistListRepository.count({ q: "", includePlaceholders: false, letter })).toBe(
        count,
      );
    }
    // The accented Á files under A and a digit under #.
    expect(letters).toEqual(expect.arrayContaining(["A", "#"]));
  });

  dbTest("counts only the friend's artists (#1116)", async () => {
    const scoped = await artistListRepository.letterCounts({
      friendId: friend,
      includePlaceholders: false,
    });
    const everyone = await artistListRepository.letterCounts({ includePlaceholders: false });
    const sum = (rows: { count: number }[]) => rows.reduce((n, row) => n + row.count, 0);
    expect(sum(scoped)).toBeLessThanOrEqual(sum(everyone));
    expect(sum(scoped)).toBe(
      await artistListRepository.count({
        q: "",
        friendId: friend,
        includePlaceholders: false,
      }),
    );
  });
});
