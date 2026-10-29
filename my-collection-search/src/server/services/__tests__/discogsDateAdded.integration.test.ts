/**
 * Discogs `date_added` against a real Postgres (#847): an album edit keeps the
 * Discogs-sourced fields, a re-sync still replaces them, tracks get the date on
 * import, the backfill migration fills old tracks, and the sync's repair pass
 * heals wiped rows without nulling anything. A mocked driver accepts any of
 * this SQL, including the timestamp casts. Run with `just genres-test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbPool, dbQuery, withDbTransaction } from "@/lib/serverDb";
import { albumRepository } from "@/server/repositories/albumRepository";
import { trackRepository } from "@/server/repositories/trackRepository";
import { discogsReleaseToAlbum, upsertAlbum } from "@/server/services/albumUpsertService";
import { extractTracksFromAlbum } from "@/server/services/discogsManifestService";
import type { DiscogsRelease } from "@/types/track";
import { up as backfill } from "../../../../migrations/1793200000000_backfill-track-date-added.js";

const dbTest = it.skipIf(process.env.RUN_DB_TESTS !== "1");
const USERNAME = "847-date-added";
const RELEASE = "84700001";
const OTHER_RELEASE = "84700002";
let friendId = 0;

function release(
  id: string,
  dateAdded: string,
  uri = `https://www.discogs.com/release/${id}-Jazz-Samba`,
) {
  return {
    id,
    title: "Jazz Samba",
    artists_sort: "Stan Getz",
    genres: ["Jazz"],
    styles: ["Bossa Nova"],
    uri,
    date_added: dateAdded,
    date_changed: "2025-05-05T05:05:05-07:00",
    tracklist: [
      { position: "A1", title: "Desafinado", duration: "5:49" },
      { position: "A2", title: "Samba Dees Days", duration: "3:35" },
    ],
  } as unknown as DiscogsRelease;
}

async function sync(discogsRelease: DiscogsRelease) {
  for (const track of extractTracksFromAlbum(discogsRelease, USERNAME)) {
    await trackRepository.upsertDiscogsTrackByTrackIdUsername(track, friendId);
  }
  return withDbTransaction((client) =>
    upsertAlbum(client, discogsReleaseToAlbum(discogsRelease, friendId), {
      preserveManualFields: true,
    }),
  );
}

/** What `POST /api/albums/upsert` writes: no Discogs-sourced fields at all. */
async function edit(releaseId: string) {
  return withDbTransaction(async (client) => {
    const album = await upsertAlbum(
      client,
      {
        release_id: releaseId,
        friend_id: friendId,
        title: "Jazz Samba (edited)",
        artist: "Stan Getz",
        genres: [],
        styles: [],
        track_count: 3,
        album_notes: "edited",
      },
      { preserveSourceTaxonomy: true },
    );
    // A track added in the editor takes its album's date too.
    await albumRepository.upsertTrackByTrackIdUsername(client, [
      `${releaseId}-B1`,
      friendId,
      USERNAME,
      "Added locally",
      "Stan Getz",
      "Jazz Samba",
      "",
      [],
      [],
      "0:00",
      0,
      "B1",
      "",
      "",
      "",
      "",
      "",
      "",
      null,
      null,
      "",
      0,
      releaseId,
      null,
    ]);
    return album;
  });
}

async function dates(releaseId: string) {
  const album = await dbQuery<{
    date_added: Date | null;
    date_changed: Date | null;
    discogs_url: string | null;
  }>(
    "SELECT date_added, date_changed, discogs_url FROM albums WHERE release_id = $1 AND friend_id = $2",
    [releaseId, friendId],
  );
  const tracks = await dbQuery<{ track_id: string; date_added: Date | null }>(
    "SELECT track_id, date_added FROM tracks WHERE release_id = $1 AND friend_id = $2 ORDER BY track_id",
    [releaseId, friendId],
  );
  return {
    album: album.rows[0],
    tracks: tracks.rows.map((row) => [row.track_id, row.date_added?.toISOString() ?? null]),
  };
}

// `timestamp` (no time zone) keeps the wall-clock part of Discogs' offset date.
const iso = (wallClock: string) => new Date(`${wallClock}`).toISOString();

async function cleanup() {
  await dbQuery("DELETE FROM tracks WHERE username = $1", [USERNAME]);
  await dbQuery("DELETE FROM albums WHERE release_id = ANY($1)", [[RELEASE, OTHER_RELEASE]]);
  await dbQuery("DELETE FROM friends WHERE username = $1", [USERNAME]);
}

beforeAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  const { rows } = await dbQuery<{ id: number }>(
    "INSERT INTO friends (username) VALUES ($1) RETURNING id",
    [USERNAME],
  );
  friendId = rows[0].id;
});

afterAll(async () => {
  if (process.env.RUN_DB_TESTS !== "1") return;
  await cleanup();
  await dbPool.end();
});

describe("Discogs date_added (integration)", () => {
  dbTest("import writes it onto tracks; an edit keeps it; a re-sync replaces it", async () => {
    await sync(release(RELEASE, "2019-04-02T11:22:33-07:00"));
    const imported = await dates(RELEASE);
    expect(imported.album.date_added?.toISOString()).toBe(iso("2019-04-02T11:22:33"));
    expect(imported.tracks).toEqual([
      [`${RELEASE}-A1`, iso("2019-04-02T11:22:33")],
      [`${RELEASE}-A2`, iso("2019-04-02T11:22:33")],
    ]);

    const edited = await edit(RELEASE);
    expect(edited.album_notes).toBe("edited");
    const afterEdit = await dates(RELEASE);
    expect(afterEdit.album).toEqual(imported.album);
    expect(afterEdit.album.discogs_url).toBe(
      `https://www.discogs.com/release/${RELEASE}-Jazz-Samba`,
    );
    expect(afterEdit.album.date_changed?.toISOString()).toBe(iso("2025-05-05T05:05:05"));
    expect(afterEdit.tracks).toContainEqual([`${RELEASE}-B1`, iso("2019-04-02T11:22:33")]);

    await sync(
      release(
        RELEASE,
        "2020-01-01T00:00:00-08:00",
        `https://www.discogs.com/release/${RELEASE}-New`,
      ),
    );
    const resynced = await dates(RELEASE);
    expect(resynced.album.date_added?.toISOString()).toBe(iso("2020-01-01T00:00:00"));
    expect(resynced.album.discogs_url).toBe(`https://www.discogs.com/release/${RELEASE}-New`);
    expect(resynced.tracks.filter(([id]) => String(id).includes("-A"))).toEqual([
      [`${RELEASE}-A1`, iso("2020-01-01T00:00:00")],
      [`${RELEASE}-A2`, iso("2020-01-01T00:00:00")],
    ]);
  });

  dbTest("the backfill migration fills only null track dates", async () => {
    await dbQuery("UPDATE tracks SET date_added = NULL WHERE track_id = $1 AND friend_id = $2", [
      `${RELEASE}-A1`,
      friendId,
    ]);
    await dbQuery(
      "UPDATE tracks SET date_added = '2001-01-01' WHERE track_id = $1 AND friend_id = $2",
      [`${RELEASE}-A2`, friendId],
    );

    await backfill({ sql: (sql: string) => dbQuery(sql) } as never);

    expect((await dates(RELEASE)).tracks).toEqual([
      [`${RELEASE}-A1`, iso("2020-01-01T00:00:00")],
      [`${RELEASE}-A2`, iso("2001-01-01T00:00:00")],
      [`${RELEASE}-B1`, iso("2019-04-02T11:22:33")],
    ]);
  });

  dbTest(
    "the repair pass heals a wiped album and its tracks, and never nulls a value",
    async () => {
      await sync(release(OTHER_RELEASE, "2018-08-08T08:08:08-07:00"));
      // Prod's damage: an edit before this fix nulled both, and tracks never had a date.
      await dbQuery(
        "UPDATE albums SET date_added = NULL, discogs_url = NULL WHERE release_id = $1 AND friend_id = $2",
        [RELEASE, friendId],
      );
      await dbQuery(
        "UPDATE tracks SET date_added = NULL WHERE release_id = $1 AND friend_id = $2",
        [RELEASE, friendId],
      );
      const {
        rows: [before],
      } = await dbQuery<{ updated_at: Date }>(
        "SELECT updated_at FROM albums WHERE release_id = $1 AND friend_id = $2",
        [RELEASE, friendId],
      );

      const repaired = await withDbTransaction((client) =>
        albumRepository.repairDiscogsCollectionFields(client, friendId, [
          {
            release_id: RELEASE,
            date_added: "2017-07-07T07:07:07-07:00",
            discogs_url: `https://www.discogs.com/release/${RELEASE}`,
          },
          // Populated, and the listing has nothing new: nothing to do.
          {
            release_id: OTHER_RELEASE,
            date_added: null,
            discogs_url: "https://www.discogs.com/release/other",
          },
        ]),
      );

      expect(repaired).toEqual({ albums: [RELEASE], tracks: 3 });
      const healed = await dates(RELEASE);
      expect(healed.album.date_added?.toISOString()).toBe(iso("2017-07-07T07:07:07"));
      expect(healed.album.discogs_url).toBe(`https://www.discogs.com/release/${RELEASE}`);
      expect(healed.tracks.map(([, date]) => date)).toEqual(
        Array(3).fill(iso("2017-07-07T07:07:07")),
      );
      const untouched = await dates(OTHER_RELEASE);
      expect(untouched.album.date_added?.toISOString()).toBe(iso("2018-08-08T08:08:08"));
      expect(untouched.album.discogs_url).toBe(
        `https://www.discogs.com/release/${OTHER_RELEASE}-Jazz-Samba`,
      );
      const {
        rows: [after],
      } = await dbQuery<{ updated_at: Date }>(
        "SELECT updated_at FROM albums WHERE release_id = $1 AND friend_id = $2",
        [RELEASE, friendId],
      );
      expect(after.updated_at).toEqual(before.updated_at);

      // The same listing again is a no-op, offset dates included.
      expect(
        await withDbTransaction((client) =>
          albumRepository.repairDiscogsCollectionFields(client, friendId, [
            { release_id: RELEASE, date_added: "2017-07-07T07:07:07-07:00", discogs_url: null },
          ]),
        ),
      ).toEqual({ albums: [], tracks: 0 });

      // A listing date that moved replaces the stored one, but keeps the URL.
      const moved = await withDbTransaction((client) =>
        albumRepository.repairDiscogsCollectionFields(client, friendId, [
          {
            release_id: OTHER_RELEASE,
            date_added: "2016-06-06T06:06:06Z",
            discogs_url: "https://www.discogs.com/release/other",
          },
        ]),
      );
      expect(moved).toEqual({ albums: [OTHER_RELEASE], tracks: 2 });
      const movedDates = await dates(OTHER_RELEASE);
      expect(movedDates.album.date_added?.toISOString()).toBe(iso("2016-06-06T06:06:06"));
      expect(movedDates.album.discogs_url).toBe(
        `https://www.discogs.com/release/${OTHER_RELEASE}-Jazz-Samba`,
      );
    },
  );
});
