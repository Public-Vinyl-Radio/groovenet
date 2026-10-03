import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findPlaylist: vi.fn(),
  findPerformance: vi.fn(),
  listEntries: vi.fn(),
  createSession: vi.fn(),
  insertSelections: vi.fn(),
  insertEvents: vi.fn(),
  view: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({ withDbTransaction: mocks.transaction }));
vi.mock("@/server/repositories/playlistRepository", () => ({
  playlistRepository: {
    findPlaylistHeaderById: mocks.findPlaylist,
    findPerformance: mocks.findPerformance,
    listSpinEntries: mocks.listEntries,
  },
}));
vi.mock("@/server/repositories/spinSessionRepository", () => ({
  spinSessionRepository: {
    createPlaylistSession: mocks.createSession,
    insertSelections: mocks.insertSelections,
  },
}));
vi.mock("@/server/repositories/trackSpinEventRepository", () => ({
  trackSpinEventRepository: { insertEvents: mocks.insertEvents },
}));
vi.mock("@/server/services/setDerivationService", () => ({
  setDerivationService: { view: mocks.view },
}));

import { PlaylistSpinService } from "../playlistSpinService";

const entries = [
  { track_id: "a", friend_id: 1, playlist_position: 0, release_id: "r1", duration_seconds: 180, track_position: "A1", title: "A", artist: "DJ", album: "One" },
  { track_id: "b", friend_id: 2, playlist_position: 1, release_id: "r2", duration_seconds: 240, track_position: "B1", title: "B", artist: "DJ", album: "Two" },
];

describe("PlaylistSpinService", () => {
  const service = new PlaylistSpinService();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((fn: (client: object) => unknown) => fn({}));
    mocks.findPlaylist.mockResolvedValue({ id: 9, name: "Set" });
    mocks.findPerformance.mockResolvedValue({ id: 4, performed_at: "2026-10-01T20:00:00.000Z" });
    mocks.listEntries.mockResolvedValue(entries);
    mocks.createSession.mockImplementation(async (_client: object, input: object) => ({ id: 100, ...input }));
    mocks.insertSelections.mockResolvedValue([]);
    mocks.insertEvents.mockResolvedValue([]);
  });

  it("logs one playlist-provenance session per entry, spaced by duration", async () => {
    await expect(service.log(9, {})).resolves.toEqual({
      playlist_id: 9,
      performance_id: 4,
      performed_at: "2026-10-01T20:00:00.000Z",
      created: 2,
      skipped: 0,
    });

    expect(mocks.createSession).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      provenance: "playlist", playlist_id: 9, live_set_performance_id: 4,
      playlist_position: 0, played_at: "2026-10-01T20:00:00.000Z",
    }));
    expect(mocks.createSession).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      playlist_position: 1, played_at: "2026-10-01T20:03:00.000Z",
    }));
    expect(mocks.insertEvents).toHaveBeenCalledTimes(2);
  });

  it("uses one supplied timestamp for every entry and reports idempotent skips", async () => {
    mocks.createSession.mockResolvedValue(null);
    const result = await service.log(9, { performed_at: "2026-10-02T01:00:00Z" });
    expect(result).toMatchObject({ performance_id: null, created: 0, skipped: 2 });
    expect(mocks.findPerformance).not.toHaveBeenCalled();
    expect(mocks.createSession).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      played_at: "2026-10-02T01:00:00.000Z",
      playlist_played_at: "2026-10-02T01:00:00.000Z",
    }));
    expect(mocks.insertEvents).not.toHaveBeenCalled();
  });

  it("uses derivation offsets and omits entries marked not played", async () => {
    mocks.view.mockResolvedValue({
      derivation: { status: "processed" },
      tracklist: [
        { start_seconds: 15 },
        { start_seconds: 210 },
      ],
      diff: {
        played_as_planned: [{ play: 1, planned: { ...entries[1], index: 1 } }],
        planned_not_played: [{ ...entries[0], index: 0 }],
        played_instead_of: [],
        played_not_planned: [],
      },
    });

    const result = await service.log(9, { derivation_id: "d1" });
    expect(result.created).toBe(1);
    expect(mocks.createSession).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      playlist_position: 1,
      played_at: "2026-10-01T20:03:30.000Z",
    }));
  });

  it("requires a timestamp when no performance exists", async () => {
    mocks.findPerformance.mockResolvedValue(null);
    await expect(service.log(9, {})).rejects.toThrow("provide performed_at");
  });

  it("rejects missing playlists and conflicting time sources", async () => {
    mocks.findPlaylist.mockResolvedValueOnce(null);
    await expect(service.log(9, {})).rejects.toThrow("Playlist not found");
    await expect(service.log(9, {
      performed_at: "2026-10-01T20:00:00Z",
      performance_id: 4,
    })).rejects.toThrow("either performed_at or performance_id");
  });

  it("rejects a performance that does not belong to the playlist", async () => {
    mocks.findPerformance.mockResolvedValue(null);
    await expect(service.log(9, { performance_id: 99 })).rejects.toThrow(
      "Performance not found for playlist"
    );
  });

  it("logs derivation matches in play order", async () => {
    mocks.view.mockResolvedValue({
      derivation: { status: "processed" },
      tracklist: [{ start_seconds: 10 }, { start_seconds: 200 }],
      diff: {
        played_as_planned: [
          { play: 1, planned: { ...entries[1], index: 1 } },
          { play: 0, planned: { ...entries[0], index: 0 } },
        ],
      },
    });
    await service.log(9, { derivation_id: "d1" });
    expect(mocks.createSession).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      playlist_position: 0, played_at: "2026-10-01T20:00:10.000Z",
    }));
    expect(mocks.createSession).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      playlist_position: 1, played_at: "2026-10-01T20:03:20.000Z",
    }));
  });

  it("rejects unfinished derivations and playlists changed since review", async () => {
    mocks.view.mockResolvedValueOnce({ derivation: { status: "queued" }, diff: null });
    await expect(service.log(9, { derivation_id: "d1" })).rejects.toThrow("not ready");

    mocks.view.mockResolvedValueOnce({
      derivation: { status: "processed" },
      tracklist: [{ start_seconds: 1 }],
      diff: {
        played_as_planned: [{ play: 0, planned: { index: 0, track_id: "different", friend_id: 1 } }],
      },
    });
    await expect(service.log(9, { derivation_id: "d2" })).rejects.toThrow(
      "Playlist changed since the set derivation was reviewed"
    );
  });

  it("rejects unresolved playlist entries", async () => {
    mocks.listEntries.mockResolvedValue([{ ...entries[0], release_id: null }]);
    await expect(service.log(9, {})).rejects.toThrow("missing or has no release");
  });

  it("handles nullable optional metadata and offsets", async () => {
    mocks.findPerformance.mockResolvedValue({ id: 4, performed_at: new Date("2026-10-01T20:00:00Z") });
    mocks.listEntries.mockResolvedValue([{
      ...entries[0], album: null, duration_seconds: null,
    }]);
    mocks.view.mockResolvedValue({
      derivation: { status: "processed" },
      tracklist: [{}],
      diff: {
        played_as_planned: [{ play: 0, planned: { ...entries[0], index: 0 } }],
      },
    });
    await service.log(9, { derivation_id: "d1" });
    expect(mocks.insertEvents).toHaveBeenCalledWith(expect.anything(), 100, [
      expect.objectContaining({ album_snapshot: "", played_at: "2026-10-01T20:00:00.000Z" }),
    ]);
  });
});
