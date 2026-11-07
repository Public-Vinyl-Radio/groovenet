import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscogsRelease } from "@groovenet/contracts";

const repo = vi.hoisted(() => ({
  listAlbumArtists: vi.fn(),
  listUncreditedAlbums: vi.fn(),
  listUncreditedTracks: vi.fn(),
  countLegacyCredits: vi.fn(),
  listKnownArtists: vi.fn(),
  listUninvertedArtists: vi.fn(),
  setSortName: vi.fn(),
}));
const writes = vi.hoisted(() => ({ importAlbumCredits: vi.fn(), importTrackCredits: vi.fn() }));
const files = vi.hoisted(() => ({ getReleasePath: vi.fn(), loadAlbum: vi.fn() }));

vi.mock("@/server/repositories/artistReconcileRepository", () => ({
  artistReconcileRepository: repo,
}));
vi.mock("@/server/repositories/artistImportRepository", () => ({
  artistImportRepository: writes,
}));
vi.mock("@/server/services/discogsManifestService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/discogsManifestService")>()),
  ...files,
}));

import { reconcileArtists } from "../artistReconcileService";

/** Release 37417227: two artists in one album string, every track the same. */
const ruidoTovar: DiscogsRelease = {
  id: 37417227,
  title: "Ruido Tovar",
  artists: [
    { id: 1, name: "Mexican Institute Of Sound", join: "," },
    { id: 2, name: "Meridian brothers" },
  ],
  artists_sort: "Mexican Institute Of Sound, Meridian brothers",
  date_added: "2026-01-01",
  date_changed: "2026-01-01",
  tracklist: [{ position: "A1", title: "Perdí mis ojos", duration: "3:00" }],
} as DiscogsRelease;

const album = (release_id: string, artist: string) => ({
  release_id,
  friend_id: 6,
  username: "alice",
  artist,
});

beforeEach(() => {
  vi.resetAllMocks();
  repo.listAlbumArtists.mockResolvedValue([
    "Mexican Institute Of Sound, Meridian brothers",
    "Earth, Wind & Fire",
    "Strokes, The",
  ]);
  repo.listUncreditedAlbums.mockResolvedValue([
    album("37417227", "Mexican Institute Of Sound, Meridian brothers"),
    album("9", "Earth, Wind & Fire"),
    album("10", "Strokes, The"),
  ]);
  repo.listUncreditedTracks.mockResolvedValue([
    {
      ...album("37417227", "Mexican Institute Of Sound, Meridian brothers"),
      track_id: "37417227-A1",
    },
    { ...album("37417227", "Somebody"), track_id: "37417227-B9" },
    { ...album("9", "Earth, Wind & Fire"), track_id: "9-A1" },
  ]);
  repo.countLegacyCredits.mockImplementation(async (table: string) =>
    table === "album_artists"
      ? [{ credited_as: "A & B", count: 2 }]
      : [{ credited_as: "Solo", count: 5 }],
  );
  repo.listKnownArtists.mockResolvedValue({ discogsIds: [], aliases: [] });
  repo.listUninvertedArtists.mockResolvedValue([]);
  repo.setSortName.mockResolvedValue(true);
  files.getReleasePath.mockImplementation((_user: string, id: string) =>
    id === "37417227" ? "/exports/release_37417227.json" : null,
  );
  files.loadAlbum.mockReturnValue(ruidoTovar);
});

describe("reconcileArtists", () => {
  it("dry run reports counts and the review queue without writing", async () => {
    const result = await reconcileArtists({ dry_run: true, friend_id: 6 });

    expect(writes.importAlbumCredits).not.toHaveBeenCalled();
    expect(writes.importTrackCredits).not.toHaveBeenCalled();
    for (const fn of [repo.listAlbumArtists, repo.listUncreditedAlbums, repo.listUncreditedTracks])
      expect(fn).toHaveBeenCalledWith(6);
    // One payload read per release, shared by the album and its tracks.
    expect(files.getReleasePath).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      dry_run: true,
      friend_id: 6,
      baseline: {
        albums: 3,
        distinct_strings: 3,
        spelling_groups: 0,
        inversions: 1,
        various: 0,
        unknown_artist: 0,
      },
      albums: { pending: 3, linked: 0, failed: 0 },
      tracks: { pending: 3, linked: 0, failed: 0 },
      // Structured artists for the release's album and its A1; strings for the rest.
      credits: { discogs: 4, legacy: 4 },
      artists: { matched_by_discogs_id: 2, matched_by_name: 1, created: 5 },
      sort_names: { pending: 0, updated: 0 },
      review_queue: [
        { credited_as: "A & B", albums: 2, tracks: 0 },
        { credited_as: "Earth, Wind & Fire", albums: 1, tracks: 1 },
      ],
      errors: [],
    });
  });

  it("writes Discogs credits where a payload exists and the unsplit string otherwise", async () => {
    writes.importTrackCredits
      .mockRejectedValueOnce(new Error("locked"))
      .mockResolvedValue(undefined);
    const result = await reconcileArtists();

    expect(repo.listUncreditedAlbums).toHaveBeenCalledWith(null);
    expect(result.dry_run).toBe(false);
    expect(result.albums).toEqual({ pending: 3, linked: 3, failed: 0 });
    expect(result.tracks).toEqual({ pending: 3, linked: 2, failed: 1 });
    expect(result.errors).toEqual([{ kind: "track", id: "6:37417227-A1", message: "locked" }]);

    const [releaseId, friendId, credits] = writes.importAlbumCredits.mock.calls[0];
    expect([releaseId, friendId]).toEqual(["37417227", 6]);
    expect(
      credits.map((c: { name: string; discogs_artist_id: string; source: string }) => [
        c.name,
        c.discogs_artist_id,
        c.source,
      ]),
    ).toEqual([
      ["Mexican Institute Of Sound", "1", "discogs"],
      ["Meridian brothers", "2", "discogs"],
    ]);
    const earth = writes.importAlbumCredits.mock.calls[1][2];
    expect(earth).toHaveLength(1);
    expect(earth[0]).toMatchObject({ name: "Earth, Wind & Fire", source: "legacy" });
    expect(writes.importAlbumCredits.mock.calls[2][2][0]).toMatchObject({
      name: "The Strokes",
      sort_name: "Strokes, The",
    });
    // A track missing from the payload falls back to its own string.
    expect(writes.importTrackCredits.mock.calls[1]).toEqual([
      "37417227-B9",
      6,
      [expect.objectContaining({ name: "Somebody", source: "legacy" })],
    ]);
  });

  it("counts artists filed under The X on a dry run and fixes them on a real one", async () => {
    repo.listUninvertedArtists.mockResolvedValue([
      { id: 66, name: "The Strokes" },
      { id: 67, name: "The Heptones / Jackie Mittoo" },
      { id: 68, name: "The Black Keys" },
    ]);
    repo.setSortName.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await reconcileArtists({ dry_run: true })).sort_names).toEqual({
      pending: 2,
      updated: 0,
    });
    expect(repo.setSortName).not.toHaveBeenCalled();

    const result = await reconcileArtists({});
    expect(repo.setSortName).toHaveBeenCalledWith(66, "Strokes, The");
    expect(repo.setSortName).toHaveBeenCalledWith(68, "Black Keys, The");
    expect(result.sort_names).toEqual({ pending: 2, updated: 1 });
  });

  it("reports a failed sort name update without stopping", async () => {
    repo.listUninvertedArtists.mockResolvedValue([
      { id: 66, name: "The Strokes" },
      { id: 68, name: "The Black Keys" },
    ]);
    repo.setSortName.mockRejectedValueOnce(new Error("locked")).mockRejectedValueOnce("odd");
    const result = await reconcileArtists({});
    expect(result.sort_names.updated).toBe(0);
    expect(result.errors.map((e) => e.message)).toEqual(["locked", "odd"]);
  });

  it("does no work on a second run and keeps listing the review queue", async () => {
    repo.listUncreditedAlbums.mockResolvedValue([]);
    repo.listUncreditedTracks.mockResolvedValue([]);
    const result = await reconcileArtists({});
    expect(writes.importAlbumCredits).not.toHaveBeenCalled();
    expect(writes.importTrackCredits).not.toHaveBeenCalled();
    expect(result.albums).toEqual({ pending: 0, linked: 0, failed: 0 });
    expect(result.credits).toEqual({ discogs: 0, legacy: 0 });
    expect(result.review_queue).toEqual([{ credited_as: "A & B", albums: 2, tracks: 0 }]);
  });

  it("caps errors and reports a non-Error failure", async () => {
    repo.listUncreditedAlbums.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => album(String(100 + i), "Solo")),
    );
    repo.listUncreditedTracks.mockResolvedValue([]);
    writes.importAlbumCredits.mockRejectedValue("nope");
    const result = await reconcileArtists();
    expect(result.albums.failed).toBe(25);
    expect(result.errors).toHaveLength(20);
    expect(result.errors[0]).toEqual({ kind: "album", id: "6:100", message: "nope" });
  });

  it("uses the string when a payload file cannot be read", async () => {
    files.loadAlbum.mockReturnValue(null);
    const result = await reconcileArtists({ dry_run: true });
    expect(result.credits).toEqual({ discogs: 0, legacy: 6 });
  });
});

it("omits reviewed spellings from both pending and existing review credits", async () => {
  repo.listKnownArtists.mockResolvedValue({
    discogsIds: [],
    aliases: [
      { alias_normalized: "a and b", has_discogs_id: false, reviewed: true },
      { alias_normalized: "plain", has_discogs_id: false, reviewed: false },
    ],
  });
  repo.listUncreditedAlbums.mockResolvedValue([album("9", "A & B")]);
  repo.listUncreditedTracks.mockResolvedValue([]);
  files.getReleasePath.mockReturnValue(null);
  expect(
    (await reconcileArtists({ dry_run: true })).review_queue.some(
      (item) => item.credited_as === "A & B",
    ),
  ).toBe(false);
});
