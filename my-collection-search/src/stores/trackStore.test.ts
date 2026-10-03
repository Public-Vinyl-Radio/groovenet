import { beforeEach, describe, expect, it } from "vitest";
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
});
