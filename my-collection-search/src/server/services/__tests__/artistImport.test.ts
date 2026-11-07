import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscogsRelease } from "@groovenet/contracts";
import { extractTracksFromAlbum } from "../discogsManifestService";
import { discogsReleaseToAlbum, upsertAlbum } from "../albumUpsertService";
import { upsertTracks } from "../trackUpsertService";

const { importAlbumCredits, importTrackCredits, albumUpsert, trackUpsert } = vi.hoisted(() => ({
  importAlbumCredits: vi.fn(),
  importTrackCredits: vi.fn(),
  albumUpsert: vi.fn(),
  trackUpsert: vi.fn(),
}));
vi.mock("@/server/repositories/artistImportRepository", () => ({
  artistImportRepository: { importAlbumCredits, importTrackCredits },
}));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: { upsertAlbumRecord: albumUpsert },
}));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { upsertDiscogsTrackByTrackIdUsername: trackUpsert },
}));
vi.mock("@/server/repositories/friendRepository", () => ({
  friendRepository: {
    insertFriendsIfMissing: vi.fn(),
    listByUsernames: vi.fn().mockResolvedValue([{ username: "alice", id: 6 }]),
  },
}));

function release(overrides: Partial<DiscogsRelease> = {}): DiscogsRelease {
  return {
    id: 26715224,
    title: "The Roots Of Chicha",
    artists: [{ id: 194, name: "Various" }],
    artists_sort: "Various",
    date_added: "2026-01-01",
    date_changed: "2026-01-01",
    tracklist: [
      {
        position: "A1",
        title: "Song",
        duration: "3:00",
        artists: [{ id: 101, name: "Los Mirlos" }],
      },
      {
        position: "A2",
        title: "Song 2",
        duration: "3:00",
        artists: [{ id: 102, name: "Juaneco Y Su Combo" }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  importAlbumCredits.mockResolvedValue(undefined);
  importTrackCredits.mockResolvedValue(undefined);
  albumUpsert.mockImplementation(async (_db, album) => album);
  trackUpsert.mockImplementation(async (track) => track);
});

describe("artist credits through the import services", () => {
  it("credits real track artists under a Various compilation", async () => {
    const payload = release();
    await upsertAlbum({ query: vi.fn() }, discogsReleaseToAlbum(payload, 6));
    const { errors } = await upsertTracks(extractTracksFromAlbum(payload, "alice"));
    expect(errors).toEqual([]);
    expect(importAlbumCredits).toHaveBeenCalledWith("26715224", 6, [
      expect.objectContaining({ name: "Various", is_placeholder: true }),
    ]);
    expect(importTrackCredits).toHaveBeenNthCalledWith(1, "26715224-A1", 6, [
      expect.objectContaining({ name: "Los Mirlos", discogs_artist_id: "101" }),
    ]);
    expect(importTrackCredits).toHaveBeenNthCalledWith(2, "26715224-A2", 6, [
      expect.objectContaining({ name: "Juaneco Y Su Combo", discogs_artist_id: "102" }),
    ]);
  });

  it("inherits both structured collaborators when tracks have no artists", async () => {
    const payload = release({
      id: 37417227,
      artists_sort: "Mexican Institute Of Sound, Meridian brothers",
      artists: [
        { id: 201, name: "Mexican Institute Of Sound", join: "," },
        { id: 202, name: "Meridian brothers" },
      ],
      tracklist: [{ position: "10", title: "Perdí mis ojos", duration: "3:00", artists: [] }],
    });
    const album = discogsReleaseToAlbum(payload, 6);
    const tracks = extractTracksFromAlbum(payload, "alice");
    expect(album.artist_credits).toHaveLength(2);
    expect(tracks[0].artist_credits).toEqual(album.artist_credits);
    await upsertTracks(tracks);
    expect(importTrackCredits).toHaveBeenCalledWith("37417227-10", 6, album.artist_credits);
  });

  it("imports legacy albums and tracks without splitting collaboration strings", async () => {
    const album = discogsReleaseToAlbum(
      release({ artists: undefined, artists_sort: "Earth, Wind & Fire" }),
      6,
    );
    const legacyAlbum = { ...album };
    delete legacyAlbum.artist_credits;
    await upsertAlbum({ query: vi.fn() }, legacyAlbum);
    const [track] = extractTracksFromAlbum(release(), "alice");
    delete track.artist_credits;
    await upsertTracks([track]);
    expect(importAlbumCredits).toHaveBeenCalledWith("26715224", 6, [
      expect.objectContaining({ name: "Earth, Wind & Fire", source: "legacy" }),
    ]);
    expect(importTrackCredits).toHaveBeenCalledWith(track.track_id, 6, [
      expect.objectContaining({ name: "Los Mirlos", source: "legacy" }),
    ]);
  });

  it("normalizes inverted names and suffixes in both display fields", () => {
    const payload = release({
      artists: [{ id: 1, name: "Strokes, The (2)" }],
      artists_sort: "Strokes, The (2)",
      tracklist: [
        {
          position: "A1",
          title: "Song",
          duration: "",
          artists: [{ id: 2, name: "Charisma (12) Featuring Brenda Watts" }],
        },
      ],
    });
    expect(discogsReleaseToAlbum(payload, 6).artist).toBe("The Strokes");
    expect(extractTracksFromAlbum(payload, "alice")[0].artist).toBe(
      "Charisma Featuring Brenda Watts",
    );
  });

  it("does not add credits to soft-deleted tracks", async () => {
    trackUpsert.mockResolvedValueOnce(null);
    expect(
      (await upsertTracks(extractTracksFromAlbum(release(), "alice").slice(0, 1))).errors,
    ).toEqual([]);
    expect(importTrackCredits).not.toHaveBeenCalled();
  });

  it("reports failed credit writes so the import can be retried", async () => {
    importAlbumCredits.mockRejectedValueOnce(new Error("credit write failed"));
    await expect(
      upsertAlbum({ query: vi.fn() }, discogsReleaseToAlbum(release(), 6)),
    ).rejects.toThrow("credit write failed");
    importTrackCredits.mockRejectedValueOnce(new Error("credit write failed"));
    const { errors } = await upsertTracks(extractTracksFromAlbum(release(), "alice"));
    expect(errors).toEqual([
      expect.objectContaining({ error: "credit write failed", trackId: "26715224-A1" }),
    ]);
  });
});
