import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { artistRepository } from "../artistRepository";
import { artistPageRepository as repo } from "../artistPageRepository";
import { getArtistPage } from "@/server/services/artistPageService";
import { artistListRepository } from "../artistListRepository";
import { artistCreditRepository } from "../artistCreditRepository";
import { withArtistCredits } from "@/server/services/artistCreditService";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const usernames = ["artist-page-test-a", "artist-page-test-b"];
const slugs = ["artist-page-test-mirlos", "artist-page-test-combo", "artist-page-test-various"];
let friendA: number;
let friendB: number;
let mirlos: number;
let combo: number;
let various: number;

const credit = (artist_id: number, position = 0) => ({
  artist_id,
  role: "primary" as const,
  position,
  credited_as: "x",
  source: "discogs" as const,
});

async function cleanup() {
  await dbQuery("DELETE FROM friends WHERE username = ANY($1)", [usernames]);
  await dbQuery("DELETE FROM artists WHERE slug = ANY($1)", [slugs]);
}

async function addAlbum(friend: number, release: string, title: string, year: string) {
  const {
    rows: [album],
  } = await dbQuery<{ id: number }>(
    "INSERT INTO albums (release_id, friend_id, title, artist, year) VALUES ($1, $2, $3, 'x', $4) RETURNING id",
    [release, friend, title, year],
  );
  return album.id;
}
async function addTrack(friend: number, id: string, release: string, position: string) {
  await dbQuery(
    "INSERT INTO tracks (track_id, friend_id, username, title, artist, release_id, position) VALUES ($1, $2, $3, $1, 'x', $4, $5)",
    [id, friend, friend === friendA ? usernames[0] : usernames[1], release, position],
  );
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friendA = (
    await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      usernames[0],
    ])
  ).rows[0].id;
  friendB = (
    await dbQuery<{ id: number }>("INSERT INTO friends (username) VALUES ($1) RETURNING id", [
      usernames[1],
    ])
  ).rows[0].id;
  mirlos = (
    await artistRepository.create({ name: "Los Mirlos", sort_name: "Mirlos, Los", slug: slugs[0] })
  ).id;
  combo = (
    await artistRepository.create({
      name: "Juaneco Y Su Combo",
      sort_name: "Juaneco",
      slug: slugs[1],
    })
  ).id;
  various = (
    await artistRepository.create({
      name: "Various",
      sort_name: "Various",
      slug: slugs[2],
      is_placeholder: true,
    })
  ).id;
  await artistRepository.addAlias(mirlos, "Mirlos");

  // Friend A: one album credited to Los Mirlos (with Combo as co-artist), and a
  // Various compilation where Los Mirlos is credited on one track only.
  const own = await addAlbum(friendA, "artist-page-own", "Own", "1972");
  const comp = await addAlbum(friendA, "artist-page-comp", "Comp", "2001");
  await artistRepository.replaceAlbumCredits(own, [credit(mirlos), credit(combo, 1)]);
  await artistRepository.replaceAlbumCredits(comp, [credit(various)]);
  await addTrack(friendA, "artist-page-t1", "artist-page-own", "A1");
  await addTrack(friendA, "artist-page-t2", "artist-page-comp", "B3");
  await addTrack(friendA, "artist-page-t3", "artist-page-comp", "B4");
  await artistRepository.replaceTrackCredits("artist-page-t1", friendA, [credit(mirlos)]);
  await artistRepository.replaceTrackCredits("artist-page-t2", friendA, [
    credit(mirlos),
    credit(combo, 1),
    credit(various, 2),
  ]);
  await artistRepository.replaceTrackCredits("artist-page-t3", friendA, [credit(combo)]);
  // Friend B owns Los Mirlos too, but a different album.
  const other = await addAlbum(friendB, "artist-page-other", "Other", "1990");
  await artistRepository.replaceAlbumCredits(other, [credit(mirlos)]);
  await addTrack(friendB, "artist-page-t9", "artist-page-other", "A1");
  await artistRepository.replaceTrackCredits("artist-page-t9", friendB, [credit(mirlos)]);
  const {
    rows: [session],
  } = await dbQuery<{ id: number }>(
    `INSERT INTO spin_sessions (friend_id, release_id, medium, selection_mode, played_at)
     VALUES ($1, 'artist-page-own', 'vinyl', 'tracks', now()) RETURNING id`,
    [friendA],
  );
  await dbQuery(
    "INSERT INTO track_spin_events (session_id, friend_id, release_id, track_id, ordinal, title_snapshot, artist_snapshot, album_snapshot, played_at) VALUES ($1, $2, 'artist-page-own', 'artist-page-t1', 1, 't1', 'x', 'x', now())",
    [session.id, friendA],
  );
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("ArtistPageRepository against Postgres", () => {
  dbTest("counts a friend's credited albums, appearances, tracks and years", async () => {
    const counts = await repo.counts(mirlos, friendA);
    expect(counts).toMatchObject({
      albums: 1,
      appears_on: 1,
      tracks: 2,
      spins: 1,
      year_min: 1972,
      year_max: 2001,
    });
    expect((await repo.counts(mirlos, undefined)).albums).toBe(2);
    expect((await repo.counts(mirlos, friendB)).tracks).toBe(1);
  });

  dbTest("lists credited albums first, then appearances with their positions", async () => {
    const albums = await repo.albums(mirlos, friendA);
    expect(albums.map((a) => [a.release_id, a.appears_on_tracks])).toEqual([
      ["artist-page-own", 0],
      ["artist-page-comp", 1],
    ]);
    expect(albums[1].appears_on_positions).toEqual(["B3"]);
    expect(await repo.albums(mirlos, friendB)).toHaveLength(1);
  });

  dbTest("returns top tracks, genres and collaborators without placeholders", async () => {
    const tracks = await repo.topTracks(mirlos, friendA, 10);
    expect(tracks.map((t) => [t.track_id, t.play_count])).toEqual([
      ["artist-page-t1", 1],
      ["artist-page-t2", 0],
    ]);
    await expect(repo.genres(mirlos, friendA, 5)).resolves.toEqual([]);
    const collaborators = await repo.collaborators(mirlos, friendA, 5);
    expect(collaborators).toEqual([expect.objectContaining({ slug: slugs[1], shared_credits: 2 })]);
  });

  dbTest("builds the whole page, and an empty one for a friend with nothing", async () => {
    const page = await getArtistPage(slugs[0], friendA);
    expect(page?.aliases).toEqual(["Mirlos"]);
    expect(page?.albums).toHaveLength(2);
    expect(page?.top_tracks_by).toBe("spins");
    expect((await getArtistPage(slugs[1], friendB))?.albums).toEqual([]);
    expect((await getArtistPage(slugs[2], friendA))?.artist.is_placeholder).toBe(true);
  });
});

describe("artist list and credits against Postgres (#710)", () => {
  dbTest("lists a friend's artists with counts, placeholders only on request", async () => {
    const all = { q: "", friendId: friendA, includePlaceholders: false };
    const page = await artistListRepository.search(all, 50, 0);
    expect(page.map((a) => [a.slug, a.album_count, a.track_count])).toEqual([
      [slugs[1], 1, 2],
      [slugs[0], 1, 2],
    ]);
    await expect(artistListRepository.count(all)).resolves.toBe(2);
    const withPlaceholders = await artistListRepository.search(
      { ...all, includePlaceholders: true },
      50,
      0,
    );
    expect(withPlaceholders.map((a) => a.slug)).toContain(slugs[2]);
    const b = await artistListRepository.search({ ...all, friendId: friendB }, 50, 0);
    expect(b.map((a) => a.slug)).toEqual([slugs[0]]);
  });

  dbTest("searches by name and by alias, exact matches first, and pages", async () => {
    const scoped = { friendId: friendA, includePlaceholders: false };
    const byAlias = await artistListRepository.search({ ...scoped, q: "mirlos" }, 50, 0);
    expect(byAlias.map((a) => a.slug)).toEqual([slugs[0]]);
    const byName = await artistListRepository.search({ ...scoped, q: "juaneco y" }, 50, 0);
    expect(byName.map((a) => a.slug)).toEqual([slugs[1]]);
    const second = await artistListRepository.search({ ...scoped, q: "" }, 1, 1);
    expect(second.map((a) => a.slug)).toEqual([slugs[0]]);
    await expect(artistListRepository.search({ ...scoped, q: "100%" }, 50, 0)).resolves.toEqual([]);
  });

  dbTest("reads credits in order, tracks falling back to their album", async () => {
    const albums = await artistCreditRepository.forAlbums([
      { id: "artist-page-own", friend_id: friendA },
    ]);
    expect(albums.get(`${friendA}:artist-page-own`)?.map((c) => c.slug)).toEqual([
      slugs[0],
      slugs[1],
    ]);
    const { tracks } = await withArtistCredits(
      [],
      [
        { track_id: "artist-page-t2", friend_id: friendA, release_id: "artist-page-comp" },
        { track_id: "artist-page-none", friend_id: friendA, release_id: "artist-page-own" },
      ],
    );
    expect(tracks[0].artists.map((c) => [c.slug, c.position, c.is_placeholder])).toEqual([
      [slugs[0], 0, false],
      [slugs[1], 1, false],
      [slugs[2], 2, true],
    ]);
    expect(tracks[1].artists.map((c) => c.slug)).toEqual([slugs[0], slugs[1]]);
  });
});
