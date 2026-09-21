import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Album, Track } from "@/types/track";

const {
  withDbTransactionMock,
  getAlbumByReleaseAndFriendMock,
  getTracksByReleaseAndFriendMock,
  createSessionMock,
  insertSelectionsMock,
  insertEventsMock,
  listSessionsMock,
  listSelectionsBySessionIdsMock,
  listEventsBySessionIdsMock,
  deleteSessionMock,
  findAutomaticSessionByDetectionIdMock,
  findTrackByTrackIdAndFriendIdMock,
} = vi.hoisted(() => ({
  withDbTransactionMock: vi.fn(),
  getAlbumByReleaseAndFriendMock: vi.fn(),
  getTracksByReleaseAndFriendMock: vi.fn(),
  createSessionMock: vi.fn(),
  insertSelectionsMock: vi.fn(),
  insertEventsMock: vi.fn(),
  listSessionsMock: vi.fn(),
  listSelectionsBySessionIdsMock: vi.fn(),
  listEventsBySessionIdsMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  findAutomaticSessionByDetectionIdMock: vi.fn(),
  findTrackByTrackIdAndFriendIdMock: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({
  withDbTransaction: withDbTransactionMock,
}));

vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: {
    getAlbumByReleaseAndFriend: getAlbumByReleaseAndFriendMock,
    getTracksByReleaseAndFriend: getTracksByReleaseAndFriendMock,
  },
}));
vi.mock("@/server/repositories/trackRepository", () => ({
  trackRepository: { findTrackByTrackIdAndFriendId: findTrackByTrackIdAndFriendIdMock },
}));

vi.mock("@/server/repositories/spinSessionRepository", () => ({
  spinSessionRepository: {
    createSession: createSessionMock,
    insertSelections: insertSelectionsMock,
    listSessions: listSessionsMock,
    listSelectionsBySessionIds: listSelectionsBySessionIdsMock,
    deleteSession: deleteSessionMock,
    findAutomaticSessionByDetectionId: findAutomaticSessionByDetectionIdMock,
  },
}));

vi.mock("@/server/repositories/trackSpinEventRepository", () => ({
  trackSpinEventRepository: {
    insertEvents: insertEventsMock,
    listEventsBySessionIds: listEventsBySessionIdsMock,
  },
}));

import { SpinLoggingService } from "../spinLoggingService";

function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    release_id: "rel-1",
    friend_id: 1,
    title: "Test LP",
    artist: "Test Artist",
    track_count: 4,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 1,
    track_id: "trk-1",
    title: "Track One",
    artist: "Test Artist",
    album: "Test LP",
    year: "1995",
    duration: "5:00",
    position: "A1",
    discogs_url: "https://discogs.test/1",
    apple_music_url: "https://music.test/1",
    friend_id: 1,
    ...overrides,
  };
}

describe("SpinLoggingService", () => {
  const service = new SpinLoggingService();

  beforeEach(() => {
    vi.clearAllMocks();
    withDbTransactionMock.mockImplementation(async (fn: (client: object) => Promise<unknown>) =>
      fn({ query: vi.fn() })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an automatic session through the normal snapshot path", async () => {
    findTrackByTrackIdAndFriendIdMock.mockResolvedValue(makeTrack({ release_id: "rel-1" }));
    const create = vi.spyOn(service, "createSpinSession").mockResolvedValue({} as never);
    await service.createAutomaticSpinSession({ detection_id: "d1", source_id: "pi", track_id: "trk-1", friend_id: 1, played_at: "2026-06-23T20:15:00.000Z", confidence: 0.9 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ release_id: "rel-1", provenance: "automatic", detection_id: "d1", track_refs: [{ track_id: "trk-1", friend_id: 1 }] }));
  });

  it("marks the persisted session automatic while retaining normal track snapshots", async () => {
    getAlbumByReleaseAndFriendMock.mockResolvedValue(makeAlbum());
    getTracksByReleaseAndFriendMock.mockResolvedValue([makeTrack()]);
    createSessionMock.mockResolvedValue({ id: 101, friend_id: 1, release_id: "rel-1", medium: "vinyl", selection_mode: "automatic", played_at: "2026-06-23T20:15:00.000Z", note: null, context_type: null, created_at: "2026-06-23T20:16:00.000Z", updated_at: "2026-06-23T20:16:00.000Z" });
    insertSelectionsMock.mockResolvedValue([]);
    insertEventsMock.mockResolvedValue([]);
    await service.createSpinSession({ friend_id: 1, release_id: "rel-1", played_at: "2026-06-23T20:15:00.000Z", track_refs: [{ track_id: "trk-1", friend_id: 1 }], provenance: "automatic", source_id: "pi", detection_id: "d1", confidence: 0.9 });
    expect(createSessionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ selection_mode: "automatic", provenance: "automatic", source_id: "pi" }));
  });

  it("forwards the automatic-detection lookup to the session repository", async () => {
    findAutomaticSessionByDetectionIdMock.mockResolvedValue({ id: 101 });
    await expect(service.findAutomaticSessionByDetectionId("d1")).resolves.toEqual({ id: 101 });
    expect(findAutomaticSessionByDetectionIdMock).toHaveBeenCalledWith("d1");
  });

  it("rejects an automatic detection whose track has no release", async () => {
    findTrackByTrackIdAndFriendIdMock.mockResolvedValue(makeTrack({ release_id: undefined }));
    await expect(service.createAutomaticSpinSession({ detection_id: "d1", source_id: "pi", track_id: "trk-1", friend_id: 1, played_at: "2026-06-23T20:15:00.000Z", confidence: 0.9 })).rejects.toThrow("Detected track has no release");
  });

  it("creates a side-based spin session and expands track events", async () => {
    getAlbumByReleaseAndFriendMock.mockResolvedValue(makeAlbum());
    getTracksByReleaseAndFriendMock.mockResolvedValue([
      makeTrack({ id: 1, track_id: "trk-a1", position: "A1", title: "A1" }),
      makeTrack({ id: 2, track_id: "trk-a2", position: "A2", title: "A2" }),
      makeTrack({ id: 3, track_id: "trk-b1", position: "B1", title: "B1" }),
      makeTrack({ id: 4, track_id: "trk-b2", position: "B2", title: "B2" }),
    ]);

    createSessionMock.mockResolvedValue({
      id: 101,
      friend_id: 1,
      release_id: "rel-1",
      medium: "vinyl",
      selection_mode: "sides",
      played_at: "2026-06-23T20:15:00.000Z",
      note: "warmup",
      context_type: "home",
      created_at: "2026-06-23T20:16:00.000Z",
      updated_at: "2026-06-23T20:16:00.000Z",
    });
    insertSelectionsMock.mockImplementation(
      async (_client: object, sessionId: number, selections: Array<Record<string, unknown>>) =>
        selections.map((selection, i) => ({
          id: i + 1,
          session_id: sessionId,
          created_at: "2026-06-23T20:16:00.000Z",
          ...selection,
          side_key: selection.side_key ?? null,
          track_id: selection.track_id ?? null,
          friend_id: selection.friend_id ?? null,
          position_snapshot: selection.position_snapshot ?? null,
        }))
    );
    insertEventsMock.mockImplementation(
      async (_client: object, sessionId: number, events: Array<Record<string, unknown>>) =>
        events.map((event, i) => ({
          id: i + 1,
          session_id: sessionId,
          created_at: "2026-06-23T20:16:00.000Z",
          ...event,
          side_key: event.side_key ?? null,
          position_snapshot: event.position_snapshot ?? null,
        }))
    );

    const result = await service.createSpinSession({
      friend_id: 1,
      release_id: "rel-1",
      played_at: "2026-06-23T20:15:00.000Z",
      note: "warmup",
      context_type: "home",
      side_keys: ["A", "B"],
    });

    expect(createSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        friend_id: 1,
        release_id: "rel-1",
        selection_mode: "sides",
      })
    );
    expect(insertSelectionsMock).toHaveBeenCalledWith(
      expect.anything(),
      101,
      [
        { ordinal: 0, selection_type: "side", side_key: "A" },
        { ordinal: 1, selection_type: "side", side_key: "B" },
      ]
    );
    expect(insertEventsMock).toHaveBeenCalledWith(
      expect.anything(),
      101,
      expect.arrayContaining([
        expect.objectContaining({ track_id: "trk-a1", side_key: "A", ordinal: 0 }),
        expect.objectContaining({ track_id: "trk-b2", side_key: "B", ordinal: 3 }),
      ])
    );
    expect(result.derived).toEqual({
      is_full_album_spin: true,
      selected_side_count: 2,
      album_side_count: 2,
      track_count: 4,
    });
  });

  it("rejects duplicate side keys", async () => {
    getAlbumByReleaseAndFriendMock.mockResolvedValue(makeAlbum());
    getTracksByReleaseAndFriendMock.mockResolvedValue([
      makeTrack({ track_id: "trk-a1", position: "A1" }),
    ]);

    await expect(
      service.createSpinSession({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-23T20:15:00.000Z",
        side_keys: ["A", "A"],
      })
    ).rejects.toThrow("Duplicate side keys are not allowed");
  });

  it("rejects track selections that are not on the album", async () => {
    getAlbumByReleaseAndFriendMock.mockResolvedValue(makeAlbum());
    getTracksByReleaseAndFriendMock.mockResolvedValue([
      makeTrack({ track_id: "trk-a1", position: "A1" }),
      makeTrack({ track_id: "trk-b1", position: "B1" }),
    ]);

    await expect(
      service.createSpinSession({
        friend_id: 1,
        release_id: "rel-1",
        played_at: "2026-06-23T20:15:00.000Z",
        track_refs: [{ track_id: "trk-missing", friend_id: 1 }],
      })
    ).rejects.toThrow("Track does not belong to album: trk-missing");
  });

  it("lists sessions with hydrated selections and events", async () => {
    listSessionsMock.mockResolvedValue([
      {
        id: 101,
        friend_id: 1,
        release_id: "rel-1",
        medium: "vinyl",
        selection_mode: "sides",
        played_at: "2026-06-23T20:15:00.000Z",
        note: null,
        context_type: null,
        created_at: "2026-06-23T20:16:00.000Z",
        updated_at: "2026-06-23T20:16:00.000Z",
        track_event_count: 2,
      },
    ]);
    listSelectionsBySessionIdsMock.mockResolvedValue([
      {
        id: 1,
        session_id: 101,
        ordinal: 0,
        selection_type: "side",
        side_key: "A",
        track_id: null,
        friend_id: null,
        position_snapshot: null,
        created_at: "2026-06-23T20:16:00.000Z",
      },
    ]);
    listEventsBySessionIdsMock.mockResolvedValue([
      {
        id: 1,
        session_id: 101,
        friend_id: 1,
        release_id: "rel-1",
        track_id: "trk-a1",
        played_at: "2026-06-23T20:15:00.000Z",
        ordinal: 0,
        side_key: "A",
        position_snapshot: "A1",
        title_snapshot: "A1",
        artist_snapshot: "Artist",
        album_snapshot: "Album",
        created_at: "2026-06-23T20:16:00.000Z",
      },
    ]);

    const result = await service.listSpinSessions({ friend_id: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].selections[0].side_key).toBe("A");
    expect(result[0].track_events[0].track_id).toBe("trk-a1");
    expect(result[0].derived.track_count).toBe(1);
    expect(result[0].derived.selected_side_count).toBe(1);
  });

  it("deletes a session through the transactional repository path", async () => {
    deleteSessionMock.mockResolvedValue({
      id: 101,
      friend_id: 1,
      release_id: "rel-1",
      medium: "vinyl",
      selection_mode: "tracks",
      played_at: "2026-06-23T20:15:00.000Z",
      note: null,
      context_type: null,
      created_at: "2026-06-23T20:16:00.000Z",
      updated_at: "2026-06-23T20:16:00.000Z",
    });

    const result = await service.deleteSpinSession(101, 1);

    expect(deleteSessionMock).toHaveBeenCalledWith(expect.anything(), 101, 1);
    expect(result?.id).toBe(101);
  });
});
