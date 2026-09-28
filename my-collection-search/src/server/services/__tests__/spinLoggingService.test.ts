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
  findSessionForUpdateMock,
  updateSessionMock,
  deleteSelectionsMock,
  deleteEventsBySessionIdMock,
  setPlayedAtForSessionMock,
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
  findSessionForUpdateMock: vi.fn(),
  updateSessionMock: vi.fn(),
  deleteSelectionsMock: vi.fn(),
  deleteEventsBySessionIdMock: vi.fn(),
  setPlayedAtForSessionMock: vi.fn(),
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
    findSessionForUpdate: findSessionForUpdateMock,
    updateSession: updateSessionMock,
    deleteSelections: deleteSelectionsMock,
  },
}));

vi.mock("@/server/repositories/trackSpinEventRepository", () => ({
  trackSpinEventRepository: {
    insertEvents: insertEventsMock,
    listEventsBySessionIds: listEventsBySessionIdsMock,
    deleteEventsBySessionId: deleteEventsBySessionIdMock,
    setPlayedAtForSession: setPlayedAtForSessionMock,
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
        album_title: "Album",
        album_artist: "Artist",
        album_thumbnail: "https://img.example/rel-1.jpg",
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
    expect(result[0].album).toEqual({
      title: "Album",
      artist: "Artist",
      thumbnail: "https://img.example/rel-1.jpg",
    });
    expect(result[0].session).not.toHaveProperty("album_title");
  });

  it("lists a session whose album row is gone with a null album", async () => {
    listSessionsMock.mockResolvedValue([
      {
        id: 102,
        friend_id: 1,
        release_id: "rel-gone",
        medium: "vinyl",
        selection_mode: "automatic",
        played_at: "2026-06-23T20:15:00.000Z",
        note: null,
        context_type: null,
        created_at: "2026-06-23T20:16:00.000Z",
        updated_at: "2026-06-23T20:16:00.000Z",
        track_event_count: 0,
        album_title: null,
        album_artist: null,
        album_thumbnail: null,
      },
    ]);
    listSelectionsBySessionIdsMock.mockResolvedValue([]);
    listEventsBySessionIdsMock.mockResolvedValue([]);

    const [item] = await service.listSpinSessions({ friend_id: 1 });

    expect(item.album).toBeNull();
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

describe("SpinLoggingService.updateSpinSession", () => {
  const service = new SpinLoggingService();

  const existing = (overrides: Record<string, unknown> = {}) => ({
    id: 101,
    friend_id: 1,
    release_id: "rel-1",
    medium: "vinyl",
    selection_mode: "automatic",
    played_at: "2026-09-20T21:30:00.000Z",
    note: null,
    context_type: null,
    provenance: "automatic",
    corrected_at: null,
    created_at: "2026-09-20T21:31:00.000Z",
    updated_at: "2026-09-20T21:31:00.000Z",
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    withDbTransactionMock.mockImplementation(async (fn: (client: object) => Promise<unknown>) =>
      fn({ query: vi.fn() })
    );
    // Like UPDATE ... RETURNING *: the stored row with only the given fields changed.
    updateSessionMock.mockImplementation(async (_client, _id, input) => ({
      ...existing(),
      ...Object.fromEntries(
        Object.entries(input).filter(([key, value]) => value !== undefined && key !== "mark_corrected")
      ),
      corrected_at: input.mark_corrected ? "2026-09-27T12:00:00.000Z" : null,
    }));
    getAlbumByReleaseAndFriendMock.mockResolvedValue(makeAlbum());
    getTracksByReleaseAndFriendMock.mockResolvedValue([
      makeTrack({ track_id: "trk-a1", position: "A1", title: "One" }),
      makeTrack({ track_id: "trk-a2", position: "A2", title: "Two" }),
      makeTrack({ track_id: "trk-b1", position: "B1", title: "Three" }),
    ]);
    insertSelectionsMock.mockImplementation(async (_client, sessionId, selections) =>
      selections.map((selection: object, i: number) => ({
        id: i + 1,
        session_id: sessionId,
        created_at: "2026-09-27T12:00:00.000Z",
        ...selection,
      }))
    );
    insertEventsMock.mockImplementation(async (_client, sessionId, events) =>
      events.map((event: object, i: number) => ({
        id: i + 1,
        session_id: sessionId,
        created_at: "2026-09-27T12:00:00.000Z",
        ...event,
      }))
    );
  });

  it("returns null when the spin is not the friend's", async () => {
    findSessionForUpdateMock.mockResolvedValue(null);

    await expect(service.updateSpinSession(101, 2, { note: "x" })).resolves.toBeNull();
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("replaces the selection and its track events in one transaction", async () => {
    findSessionForUpdateMock.mockResolvedValue(existing());

    const result = await service.updateSpinSession(101, 1, {
      track_refs: [{ track_id: "trk-a2", friend_id: 1 }],
    });

    expect(updateSessionMock).toHaveBeenCalledWith(expect.anything(), 101, {
      selection_mode: "tracks",
      played_at: undefined,
      note: undefined,
      context_type: undefined,
      mark_corrected: true,
    });
    expect(deleteSelectionsMock).toHaveBeenCalledWith(expect.anything(), 101);
    expect(deleteEventsBySessionIdMock).toHaveBeenCalledWith(expect.anything(), 101);
    const [, , events] = insertEventsMock.mock.calls[0];
    expect(events).toEqual([
      expect.objectContaining({
        track_id: "trk-a2",
        position_snapshot: "A2",
        title_snapshot: "Two",
        played_at: "2026-09-20T21:30:00.000Z",
      }),
    ]);
    expect(result?.track_events).toHaveLength(1);
    expect(result?.derived.track_count).toBe(1);
    expect(result?.session.corrected_at).toBe("2026-09-27T12:00:00.000Z");
  });

  it("expands a new side selection and times its events at the new played_at", async () => {
    findSessionForUpdateMock.mockResolvedValue(existing({ provenance: "manual" }));

    const result = await service.updateSpinSession(101, 1, {
      side_keys: ["a"],
      played_at: "2026-09-20T20:00:00.000Z",
    });

    const [, , events] = insertEventsMock.mock.calls[0];
    expect(events.map((e: { track_id: string }) => e.track_id)).toEqual(["trk-a1", "trk-a2"]);
    expect(events.every((e: { played_at: string }) => e.played_at === "2026-09-20T20:00:00.000Z")).toBe(true);
    expect(updateSessionMock.mock.calls[0][2]).toMatchObject({
      selection_mode: "sides",
      mark_corrected: false,
    });
    expect(result?.derived).toMatchObject({ selected_side_count: 1, album_side_count: 2 });
  });

  it("moves the events with the spin when only its time changes", async () => {
    findSessionForUpdateMock.mockResolvedValue(existing());
    listSelectionsBySessionIdsMock.mockResolvedValue([]);
    setPlayedAtForSessionMock.mockResolvedValue([
      {
        id: 1, session_id: 101, friend_id: 1, release_id: "rel-1", track_id: "trk-a1",
        played_at: "2026-09-20T20:00:00.000Z", ordinal: 0, side_key: "A",
        position_snapshot: "A1", title_snapshot: "One", artist_snapshot: "Test Artist",
        album_snapshot: "Test LP", created_at: "2026-09-20T21:31:00.000Z",
      },
    ]);

    const result = await service.updateSpinSession(101, 1, {
      played_at: "2026-09-20T20:00:00.000Z",
    });

    expect(setPlayedAtForSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      101,
      "2026-09-20T20:00:00.000Z"
    );
    expect(deleteEventsBySessionIdMock).not.toHaveBeenCalled();
    expect(getAlbumByReleaseAndFriendMock).not.toHaveBeenCalled();
    expect(result?.track_events[0].played_at).toBe("2026-09-20T20:00:00.000Z");
  });

  it("leaves events alone for a note-only edit to a manual spin", async () => {
    findSessionForUpdateMock.mockResolvedValue(existing({ provenance: "manual" }));
    listSelectionsBySessionIdsMock.mockResolvedValue([
      { id: 1, session_id: 101, ordinal: 0, selection_type: "side", side_key: "A",
        track_id: null, friend_id: null, position_snapshot: null,
        created_at: "2026-09-20T21:31:00.000Z" },
    ]);
    listEventsBySessionIdsMock.mockResolvedValue([]);

    const result = await service.updateSpinSession(101, 1, { note: "great side" });

    expect(setPlayedAtForSessionMock).not.toHaveBeenCalled();
    expect(updateSessionMock.mock.calls[0][2]).toMatchObject({
      note: "great side",
      mark_corrected: false,
    });
    expect(result?.session.corrected_at).toBeNull();
    expect(result?.derived.selected_side_count).toBe(1);
  });

  it("rejects a selection that does not fit the album", async () => {
    findSessionForUpdateMock.mockResolvedValue(existing());

    await expect(service.updateSpinSession(101, 1, { side_keys: ["Z"] })).rejects.toThrow(
      "Invalid side key: Z"
    );
    expect(deleteEventsBySessionIdMock).not.toHaveBeenCalled();
  });
});
