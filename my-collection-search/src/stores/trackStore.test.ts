import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrackStore, type TrackEntity } from "./trackStore";

const track = (overrides: Partial<TrackEntity> = {}): TrackEntity =>
  ({
    track_id: "t1",
    friend_id: 1,
    title: "Song",
    artist: "Artist",
    ...overrides,
  }) as TrackEntity;

beforeEach(() => {
  useTrackStore.getState().clearTracks();
});

describe("trackStore.setTracks", () => {
  it("fills analysis fields the store holds empty when the server now has them", () => {
    const { setTracks, getTrack } = useTrackStore.getState();
    setTracks([track({ local_audio_url: undefined })]);

    // The download + analysis finished; a refetch brings the results.
    setTracks([
      track({
        local_audio_url: "/audio/t1.m4a",
        bpm: "124",
        key: "A minor",
        danceability: "1.2",
        mood_happy: 0.4,
      }),
    ]);

    expect(getTrack("t1", 1)).toMatchObject({
      local_audio_url: "/audio/t1.m4a",
      bpm: "124",
      key: "A minor",
      danceability: "1.2",
      mood_happy: 0.4,
    });
  });

  it("treats null and empty string as empty too", () => {
    const { setTracks, getTrack } = useTrackStore.getState();
    setTracks([track({ bpm: null, key: "" })]);
    setTracks([track({ bpm: "128", key: "C major" })]);

    expect(getTrack("t1", 1)).toMatchObject({ bpm: "128", key: "C major" });
  });

  it("still protects a local value from a stale seed", () => {
    const { setTracks, updateTrack, getTrack } = useTrackStore.getState();
    setTracks([track({ star_rating: 0, notes: "" })]);
    updateTrack("t1", 1, { star_rating: 4, notes: "peak-time" });

    setTracks([track({ star_rating: 0, notes: "" })]);

    expect(getTrack("t1", 1)).toMatchObject({
      star_rating: 4,
      notes: "peak-time",
    });
  });

  it("keeps the existing hasVectors when an incoming track omits the key entirely (#468)", () => {
    const { setTracks, getTrack } = useTrackStore.getState();
    setTracks([track({ hasVectors: true })]);

    // e.g. album detail, which doesn't select hasVectors at all.
    const withoutKey = track();
    expect("hasVectors" in withoutKey).toBe(false);
    setTracks([withoutKey]);

    expect(getTrack("t1", 1)?.hasVectors).toBe(true);
  });

  it("lets an incoming false win over an existing true — the key is present", () => {
    const { setTracks, getTrack } = useTrackStore.getState();
    setTracks([track({ hasVectors: true })]);
    setTracks([track({ hasVectors: false })]);

    expect(getTrack("t1", 1)?.hasVectors).toBe(false);
  });
});

describe("trackStore.setTrack", () => {
  it("keeps the existing hasVectors when the incoming track omits the key (#468)", () => {
    const { setTrack, getTrack } = useTrackStore.getState();
    setTrack(track({ hasVectors: true }));

    const withoutKey = track();
    expect("hasVectors" in withoutKey).toBe(false);
    setTrack(withoutKey);

    expect(getTrack("t1", 1)?.hasVectors).toBe(true);
  });

  it("overwrites hasVectors when the incoming track carries the key", () => {
    const { setTrack, getTrack } = useTrackStore.getState();
    setTrack(track({ hasVectors: true }));
    setTrack(track({ hasVectors: false }));

    expect(getTrack("t1", 1)?.hasVectors).toBe(false);
  });
});

describe("trackStore.updateTrack", () => {
  it("keeps the existing hasVectors when updates omit the key", () => {
    const { setTrack, updateTrack, getTrack } = useTrackStore.getState();
    setTrack(track({ hasVectors: true }));
    updateTrack("t1", 1, { star_rating: 5 });

    expect(getTrack("t1", 1)?.hasVectors).toBe(true);
  });
});

describe("trackStore debug logging", () => {
  const prevFlag = process.env.NEXT_PUBLIC_DEBUG_STORE;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DEBUG_STORE = "1";
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DEBUG_STORE = prevFlag;
    vi.restoreAllMocks();
  });

  it("logs the merged track on setTrack, setTracks and updateTrack without throwing", () => {
    const { setTrack, setTracks, updateTrack } = useTrackStore.getState();

    expect(() => setTrack(track({ hasVectors: true }))).not.toThrow();
    expect(() => setTracks([track({ star_rating: 2 })])).not.toThrow();
    expect(() => updateTrack("t1", 1, { star_rating: 5 })).not.toThrow();
    expect(console.groupCollapsed).toHaveBeenCalled();
  });
});

describe("sparse effective album values", () => {
  it.each(["setTrack", "setTracks"] as const)(
    "%s preserves omitted effective fields but accepts explicit empty arrays",
    (method) => {
      const state = useTrackStore.getState();
      const put = (value: TrackEntity) =>
        method === "setTrack" ? state.setTrack(value) : state.setTracks([value]);
      put(track({ album_genres: ["Jazz"], album_styles: ["Fusion"] }));
      put(track({ title: "Narrow seed" }));
      expect(state.getTrack("t1", 1)).toMatchObject({
        album_genres: ["Jazz"],
        album_styles: ["Fusion"],
      });
      put(track({ album_genres: [], album_styles: [] }));
      expect(state.getTrack("t1", 1)).toMatchObject({ album_genres: [], album_styles: [] });
    },
  );
});

describe("trackStore.removeTrack", () => {
  it("evicts the entity and its release index entry", () => {
    const { setTracks, removeTrack, getTrack } = useTrackStore.getState();
    setTracks([
      track({ track_id: "a", release_id: "r1" }),
      track({ track_id: "b", release_id: "r1" }),
    ]);

    removeTrack("a", 1);

    const state = useTrackStore.getState();
    expect(getTrack("a", 1)).toBeUndefined();
    expect(getTrack("b", 1)).toBeDefined();
    expect(state.trackKeysByRelease.get("r1:1")).toEqual(["b:1"]);
  });

  it("keeps the release hydrated while it still has tracks, and un-hydrates it when empty", () => {
    const { setTracks, markReleaseHydrated, removeTrack, isReleaseHydrated } =
      useTrackStore.getState();
    setTracks([
      track({ track_id: "a", release_id: "r1" }),
      track({ track_id: "b", release_id: "r1" }),
    ]);
    markReleaseHydrated("r1", 1);

    removeTrack("a", 1);
    expect(isReleaseHydrated("r1", 1)).toBe(true);

    removeTrack("b", 1);
    expect(isReleaseHydrated("r1", 1)).toBe(false);
  });

  it("is a no-op, keeping state identity, for an unknown track", () => {
    useTrackStore.getState().setTracks([track({ release_id: "r1" })]);
    const before = useTrackStore.getState();

    useTrackStore.getState().removeTrack("missing", 1);

    expect(useTrackStore.getState()).toBe(before);
  });

  it("only removes the track for the matching friend", () => {
    const { setTracks, removeTracks, getTrack } = useTrackStore.getState();
    setTracks([track({ friend_id: 1 }), track({ friend_id: 2 })]);

    removeTracks([{ trackId: "t1", friendId: 1 }]);

    expect(getTrack("t1", 1)).toBeUndefined();
    expect(getTrack("t1", 2)).toBeDefined();
  });

  it("leaves hydration alone for a track without a release", () => {
    const { setTracks, removeTrack, getTrack } = useTrackStore.getState();
    setTracks([track()]);
    removeTrack("t1", 1);
    expect(getTrack("t1", 1)).toBeUndefined();
  });

  it("lets a restored track come back through setTracks", () => {
    const { setTracks, removeTrack, getTrack } = useTrackStore.getState();
    setTracks([track({ release_id: "r1" })]);
    removeTrack("t1", 1);

    setTracks([track({ release_id: "r1", title: "Restored" })]);

    expect(getTrack("t1", 1)?.title).toBe("Restored");
  });
});
