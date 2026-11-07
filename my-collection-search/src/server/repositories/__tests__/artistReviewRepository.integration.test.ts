import { reconcileArtists } from "@/server/services/artistReconcileService";
import { afterAll, beforeEach, expect, it } from "vitest";
import { dbPool, dbQuery } from "@/lib/serverDb";
import { artistRepository as artists } from "../artistRepository";
import { artistReviewRepository as review } from "../artistReviewRepository";
import { artistImportRepository as importer } from "../artistImportRepository";
import { importArtistCredits } from "@/lib/artists/importCredits";
const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
let friend: number, album: number, a: number, b: number, c: number;
async function cleanup() {
  await dbQuery(
    "DELETE FROM artist_merges WHERE source_id IN (SELECT id FROM artists WHERE slug LIKE 'review-test-%' OR name LIKE 'Review test %')",
  );
  await dbQuery("DELETE FROM friends WHERE username = 'artist-review-test'");
  await dbQuery(
    "UPDATE artists SET merged_into = NULL WHERE slug LIKE 'review-test-%' OR name LIKE 'Review test %'",
  );
  await dbQuery("DELETE FROM artists WHERE slug LIKE 'review-test-%' OR name LIKE 'Review test %'");
}
beforeEach(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  friend = (
    await dbQuery<{ id: number }>(
      "INSERT INTO friends (username) VALUES ('artist-review-test') RETURNING id",
    )
  ).rows[0].id;
  album = (
    await dbQuery<{ id: number }>(
      "INSERT INTO albums (release_id, friend_id, title, artist) VALUES ('37417227', $1, 'Ruido Tovar', 'Review test A & B') RETURNING id",
      [friend],
    )
  ).rows[0].id;
  for (const track of ["review-A1", "review-A2", "review-A3"])
    await dbQuery(
      "INSERT INTO tracks (track_id, friend_id, username, title, artist) VALUES ($1, $2, 'artist-review-test', 'Song', 'Review test A & B')",
      [track, friend],
    );
  const ids = [];
  for (const name of ["A", "B", "C"]) {
    const artist = await artists.create({
      name: `Review test ${name}`,
      sort_name: name,
      slug: `review-test-${name}`,
      discogs_artist_id: String(999706000 + ids.length),
    });
    await artists.addAlias(artist.id, artist.name);
    ids.push(artist.id);
  }
  [a, b, c] = ids;
  await artists.replaceAlbumCredits(album, [
    { artist_id: a, role: "primary", position: 0, credited_as: "Review test A", source: "legacy" },
  ]);
  await artists.replaceTrackCredits("review-A1", friend, [
    { artist_id: a, role: "primary", position: 0, credited_as: "Review test A", source: "discogs" },
    { artist_id: b, role: "primary", position: 1, credited_as: "Review test B", source: "discogs" },
  ]);
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS === "1") {
    await cleanup();
    await dbPool.end();
  }
});
const original = () => importArtistCredits([{ id: 999706000, name: "Review test A" }], "");

dbTest("lists unresolved strings with album and track evidence", async () => {
  await dbQuery("UPDATE album_artists SET credited_as = 'Review test A & B' WHERE album_id = $1", [
    album,
  ]);
  const page = await review.list({ limit: 100, offset: 0 });
  expect(page.items.find((i) => i.id === a)).toMatchObject({
    albums: [{ release_id: "37417227", credits: [{ artist_id: a }] }],
    tracks: [{ track_id: "review-A1" }],
  });
  await review.decide({ action: "accept", artist_id: a });
  expect((await review.list({ limit: 100, offset: 0 })).items.some((i) => i.id === a)).toBe(false);
  expect((await review.list({ artist_id: a, limit: 1, offset: 0 })).items[0].reviewed).toBe(true);
});
dbTest(
  "merges survive existing and new album/track re-imports by external id and alias",
  async () => {
    await review.decide({ action: "merge", artist_id: a, target_id: b });
    await importer.importAlbumCredits("37417227", friend, original());
    await importer.importTrackCredits("review-A1", friend, original());
    await importer.importTrackCredits("review-A2", friend, original());
    await importer.importTrackCredits(
      "review-A3",
      friend,
      importArtistCredits(undefined, "Review test A"),
    );
    for (const track of ["review-A1", "review-A2", "review-A3"])
      expect((await artists.listTrackCredits(track, friend)).map((c) => c.artist_id)).toEqual([b]);
    expect((await artists.listAlbumCredits(album))[0].artist_id).toBe(b);
    expect((await artists.findByAlias("Review test A"))!.id).toBe(b);
    expect((await artists.findByDiscogsId("999706000"))!.id).toBe(a);
  },
);
dbTest("follows chains of merges on new imports", async () => {
  await review.decide({ action: "merge", artist_id: a, target_id: b });
  await review.decide({ action: "merge", artist_id: b, target_id: c });
  await importer.importTrackCredits("review-A2", friend, original());
  expect((await artists.listTrackCredits("review-A2", friend))[0].artist_id).toBe(c);
});
dbTest("restores exact credits and aliases when splitting a merge back", async () => {
  const before = await artists.listTrackCredits("review-A1", friend);
  const result = await review.decide({ action: "merge", artist_id: a, target_id: b });
  await review.decide({ action: "unmerge", merge_id: result.merge_id! });
  expect(await artists.listTrackCredits("review-A1", friend)).toEqual(before);
  expect((await artists.findByAlias("Review test A"))!.id).toBe(a);
  expect((await artists.listAlbumCredits(album))[0].source).toBe("legacy");
});
dbTest("previews merge without saving credits, redirects, or history", async () => {
  const before = await artists.listTrackCredits("review-A1", friend);
  await review.decide({ action: "merge", artist_id: a, target_id: b }, true);
  expect(await artists.listTrackCredits("review-A1", friend)).toEqual(before);
  expect((await dbQuery("SELECT * FROM artist_merges")).rows).toEqual([]);
});
dbTest("blocks stale undo after later review", async () => {
  const result = await review.decide({ action: "merge", artist_id: a, target_id: b });
  await review.decide({
    action: "rename",
    artist_id: b,
    name: "Review test Renamed",
    sort_name: "Renamed",
  });
  await expect(
    review.decide({ action: "unmerge", merge_id: result.merge_id! }),
  ).rejects.toMatchObject({ status: 409 });
});
dbTest(
  "splits into new artists with roles/order, and preserves the decision on future imports",
  async () => {
    await review.decide({
      action: "split",
      artist_id: a,
      credits: [
        { name: "Review test New lead", role: "primary", position: 0, credited_as: "Lead" },
        {
          name: "Review test New guest",
          sort_name: "Guest, New",
          role: "featured",
          position: 1,
          credited_as: "Guest",
        },
      ],
    });
    const lead = (await artists.findByAlias("Review test New lead"))!.id;
    const guest = (await artists.findByAlias("Review test New guest"))!.id;
    await importer.importTrackCredits("review-A2", friend, original());
    expect(await artists.listTrackCredits("review-A2", friend)).toEqual([
      {
        artist_id: lead,
        role: "primary",
        position: 0,
        credited_as: "Lead",
        joiner: null,
        source: "manual",
      },
      {
        artist_id: guest,
        role: "featured",
        position: 1,
        credited_as: "Guest",
        joiner: null,
        source: "manual",
      },
    ]);
    await review.decide({ action: "merge", artist_id: lead, target_id: c });
    await importer.importTrackCredits("review-A3", friend, original());
    expect((await artists.listTrackCredits("review-A3", friend))[0].artist_id).toBe(c);
  },
);
dbTest("renames and marks Various without changing real track artists", async () => {
  await review.decide({
    action: "rename",
    artist_id: a,
    name: "Review test Various",
    sort_name: "Various",
  });
  await review.decide({ action: "placeholder", artist_id: a, is_placeholder: true });
  expect(await artists.findById(a)).toMatchObject({
    name: "Review test Various",
    sort_name: "Various",
    is_placeholder: true,
  });
  expect((await artists.findByAlias("Review test A"))!.id).toBe(a);
  expect((await artists.listTrackCredits("review-A1", friend))[1].artist_id).toBe(b);
});

dbTest(
  "splits a source credited in several roles and overrides target order explicitly",
  async () => {
    await artists.replaceAlbumCredits(album, [
      { artist_id: a, role: "primary", position: 0, credited_as: "A", source: "legacy" },
      { artist_id: a, role: "composer", position: 3, credited_as: "A", source: "legacy" },
      { artist_id: b, role: "featured", position: 10, credited_as: "Old", source: "discogs" },
    ]);
    await review.decide({
      action: "split",
      artist_id: a,
      credits: [
        { artist_id: b, role: "featured", position: 1, credited_as: "New" },
        { artist_id: c, role: "primary", position: 0, credited_as: "Lead" },
      ],
    });
    expect(await artists.listAlbumCredits(album)).toEqual([
      {
        artist_id: c,
        role: "primary",
        position: 0,
        credited_as: "Lead",
        joiner: null,
        source: "manual",
      },
      {
        artist_id: b,
        role: "featured",
        position: 1,
        credited_as: "New",
        joiner: null,
        source: "manual",
      },
    ]);
  },
);

dbTest("backfill honours merged aliases and does not requeue reviewed strings", async () => {
  await artists.addAlias(a, "Review test A & B");
  await review.decide({ action: "merge", artist_id: a, target_id: b });
  const result = await reconcileArtists({ friend_id: friend });
  expect(result.errors).toEqual([]);
  expect(result.review_queue).toEqual([]);
  expect((await artists.listTrackCredits("review-A2", friend))[0].artist_id).toBe(b);
});

dbTest("keeps a reviewed legacy merge when Discogs supplies an ID for the first time", async () => {
  await dbQuery("UPDATE artists SET discogs_artist_id = NULL WHERE id = $1", [a]);
  await review.decide({ action: "merge", artist_id: a, target_id: b });
  await importer.importTrackCredits("review-A2", friend, original());
  expect((await artists.listTrackCredits("review-A2", friend))[0].artist_id).toBe(b);
  expect((await dbQuery("SELECT * FROM artists WHERE discogs_artist_id = 999706000")).rows).toEqual(
    [],
  );
});
