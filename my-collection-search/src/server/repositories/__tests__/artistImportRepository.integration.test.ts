import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery, withDbTransaction } from "@/lib/serverDb";
import { freeArtistSlug, regenerateArtistSlug } from "@/server/artists/artistSlug";
import { importArtistCredits } from "@/lib/artists/importCredits";
import { artistImportRepository as repo } from "../artistImportRepository";
import { artistRepository } from "../artistRepository";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
let friendId: number;
let albumId: number;
const credits = () =>
  importArtistCredits([{ id: 999704001, name: "Import Fixture Strokes, The" }], "unused");
beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  const friend = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ('artist-import-test') RETURNING id",
  );
  friendId = friend.rows[0].id;
  const album = await dbQuery<{ id: number }>(
    "INSERT INTO albums (release_id, friend_id, title, artist) VALUES ('704', $1, 'Test', 'Import Fixture Strokes, The') RETURNING id",
    [friendId],
  );
  albumId = album.rows[0].id;
  await dbQuery(
    "INSERT INTO tracks (track_id, friend_id, username, title, artist) VALUES ('704-A1', $1, 'artist-import-test', 'Test', 'Import Fixture Strokes, The')",
    [friendId],
  );
});
afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await dbQuery("DELETE FROM friends WHERE id = $1", [friendId]);
  await dbPool.end();
});

describe("artist import on Postgres", () => {
  dbTest("is idempotent and shares identities between albums and tracks", async () => {
    await repo.importAlbumCredits("704", friendId, credits());
    await repo.importTrackCredits("704-A1", friendId, credits());
    const first = await artistRepository.listAlbumCredits(albumId);
    await repo.importAlbumCredits("704", friendId, credits());
    await repo.importTrackCredits("704-A1", friendId, credits());
    expect(await artistRepository.listAlbumCredits(albumId)).toEqual(first);
    expect(await artistRepository.listTrackCredits("704-A1", friendId)).toEqual(first);
    const artist = await artistRepository.findByDiscogsId("999704001");
    expect(artist).toMatchObject({
      name: "The Import Fixture Strokes",
      sort_name: "Import Fixture Strokes, The",
    });
  });

  dbTest("keeps different Discogs identities with the same name separate", async () => {
    const sameName = importArtistCredits(
      [{ id: 999704002, name: "Import Fixture Strokes, The" }],
      "unused",
    );
    await repo.importTrackCredits("704-A1", friendId, sameName);
    const a = await artistRepository.findByDiscogsId("999704001");
    const b = await artistRepository.findByDiscogsId("999704002");
    expect(a!.id).not.toBe(b!.id);
    expect((await artistRepository.listTrackCredits("704-A1", friendId))[0].artist_id).toBe(b!.id);
    await repo.importTrackCredits("704-A1", friendId, sameName);
    expect((await artistRepository.findByDiscogsId("999704002"))!.id).toBe(b!.id);
  });

  dbTest(
    "upgrades a legacy spelling to a structured identity and preserves its canonical name",
    async () => {
      await repo.importTrackCredits(
        "704-A1",
        friendId,
        importArtistCredits(undefined, "Import Review Band"),
      );
      const before = await artistRepository.findByAlias("Import Review Band");
      await dbQuery("UPDATE artists SET name = 'Reviewed Band' WHERE id = $1", [before!.id]);
      await repo.importTrackCredits(
        "704-A1",
        friendId,
        importArtistCredits([{ id: 999704003, name: "Import Review Band" }], "unused"),
      );
      expect(await artistRepository.findByDiscogsId("999704003")).toMatchObject({
        id: before!.id,
        name: "Reviewed Band",
      });
    },
  );

  dbTest("preserves reviewed merges on both album and track re-imports", async () => {
    const target = await artistRepository.create({
      name: "Reviewed",
      sort_name: "Reviewed",
      slug: "artist-import-reviewed",
    });
    const manual = [
      {
        artist_id: target.id,
        role: "primary" as const,
        position: 0,
        credited_as: "Reviewed",
        joiner: null,
        source: "manual" as const,
      },
    ];
    await artistRepository.replaceAlbumCredits(albumId, manual);
    await artistRepository.replaceTrackCredits("704-A1", friendId, manual);
    // Simulate the review tool deleting the old merged identity and moving aliases.
    await dbQuery(
      "UPDATE artist_aliases SET artist_id = $1 WHERE artist_id IN (SELECT id FROM artists WHERE discogs_artist_id IN (999704001, 999704002))",
      [target.id],
    );
    await dbQuery("DELETE FROM artists WHERE discogs_artist_id IN (999704001, 999704002)");
    await repo.importAlbumCredits("704", friendId, credits());
    await repo.importTrackCredits("704-A1", friendId, credits());
    expect(await artistRepository.listAlbumCredits(albumId)).toEqual(manual);
    expect(await artistRepository.listTrackCredits("704-A1", friendId)).toEqual(manual);
    expect(await artistRepository.findByDiscogsId("999704001")).toBeNull();
  });

  dbTest("coalesces placeholder synonyms while retaining real track artists", async () => {
    // Remove the manual override for this test.
    await artistRepository.replaceAlbumCredits(albumId, []);
    await artistRepository.replaceTrackCredits("704-A1", friendId, []);
    await repo.importAlbumCredits(
      "704",
      friendId,
      importArtistCredits([{ id: 194, name: "Various" }], "unused"),
    );
    const first = await artistRepository.listAlbumCredits(albumId);
    await repo.importAlbumCredits(
      "704",
      friendId,
      importArtistCredits([{ id: 194, name: "Various Artists" }], "unused"),
    );
    expect((await artistRepository.listAlbumCredits(albumId))[0].artist_id).toBe(
      first[0].artist_id,
    );
    expect(await artistRepository.findById(first[0].artist_id)).toMatchObject({
      is_placeholder: true,
      discogs_artist_id: null,
    });
    await repo.importTrackCredits(
      "704-A1",
      friendId,
      importArtistCredits([{ id: 999704004, name: "Los Mirlos" }], "unused"),
    );
    expect((await artistRepository.listTrackCredits("704-A1", friendId))[0].artist_id).not.toBe(
      first[0].artist_id,
    );
  });

  dbTest("rolls back the old credits when new identity persistence fails", async () => {
    const before = await artistRepository.listTrackCredits("704-A1", friendId);
    const invalid = credits();
    invalid[0].discogs_artist_id = "invalid-bigint";
    await expect(repo.importTrackCredits("704-A1", friendId, invalid)).rejects.toThrow();
    expect(await artistRepository.listTrackCredits("704-A1", friendId)).toEqual(before);
  });

  dbTest("serializes concurrent imports of the same new identity", async () => {
    const shared = importArtistCredits(
      [{ id: 999704005, name: "Concurrent Import Band" }],
      "unused",
    );
    await Promise.all([
      repo.importAlbumCredits("704", friendId, shared),
      repo.importTrackCredits("704-A1", friendId, shared),
    ]);
    expect((await artistRepository.listAlbumCredits(albumId))[0].artist_id).toBe(
      (await artistRepository.listTrackCredits("704-A1", friendId))[0].artist_id,
    );
  });

  dbTest("gives readable slugs, disambiguates homonyms and keeps old slugs working", async () => {
    await dbQuery("DELETE FROM artists WHERE slug LIKE 'slug-fixture%'");
    const homonyms = [
      importArtistCredits([{ id: 999079001, name: "Slug Fixture Band" }], "unused"),
      importArtistCredits([{ id: 999079002, name: "Slug Fixture Band (2)" }], "unused"),
    ];
    for (const credits of homonyms) await repo.importTrackCredits("704-A1", friendId, credits);
    const a = await artistRepository.findByDiscogsId("999079001");
    const b = await artistRepository.findByDiscogsId("999079002");
    expect(a!.slug).toBe("slug-fixture-band");
    expect(b!.slug).toBe("slug-fixture-band-999079002");
    // Re-importing creates no duplicates: identity_key, not slug, matches.
    for (const credits of homonyms) await repo.importTrackCredits("704-A1", friendId, credits);
    expect((await artistRepository.findByDiscogsId("999079001"))!.id).toBe(a!.id);

    // A review rename regenerates the slug and the old one still resolves.
    await dbQuery("UPDATE artists SET name = 'Slug Fixture Renamed' WHERE id = $1", [a!.id]);
    await withDbTransaction((db) => regenerateArtistSlug(db, a!.id));
    expect((await artistRepository.findById(a!.id))!.slug).toBe("slug-fixture-renamed");
    expect((await artistRepository.findBySlug("slug-fixture-band"))!.id).toBe(a!.id);
    // The freed name goes to the next artist, not the old owner's redirect.
    expect(await withDbTransaction((db) => freeArtistSlug(db, "Slug Fixture Band", null))).toBe(
      "slug-fixture-band-2",
    );
    await artistRepository.replaceTrackCredits("704-A1", friendId, []);
    await dbQuery("DELETE FROM artists WHERE id = ANY($1)", [[a!.id, b!.id]]);
  });
});
