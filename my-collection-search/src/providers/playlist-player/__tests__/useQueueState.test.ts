// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQueueState } from "@/providers/playlist-player/useQueueState";
import type { Track } from "@/types/track";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeTrack(id: string, extra: Partial<Track> = {}): Track {
  return {
    track_id: id,
    id: Number(id.replace(/\D/g, "")) || 1,
    title: `Title ${id}`,
    artist: "Artist",
    album: "Album",
    year: "2020",
    duration: "3:00",
    duration_seconds: 180,
    position: "A1",
    discogs_url: null,
    apple_music_url: null,
    youtube_url: null,
    soundcloud_url: null,
    album_thumbnail: null,
    local_tags: "",
    bpm: null,
    key: null,
    notes: "",
    star_rating: 0,
    friend_id: 1,
    username: "alice",
    ...extra,
  } as Track;
}

const tracks = ["a", "b", "c", "d"].map(id => makeTrack(id));

function makeHook(initial: Track[] = []) {
  return renderHook(() => useQueueState({ initial }));
}

// ─── play / pause / stop ──────────────────────────────────────────────────────

describe("play()", () => {
  it("sets isPlaying to true when playlist is non-empty", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.play(); });

    expect(result.current.isPlaying).toBe(true);
  });

  it("does nothing when playlist is empty", () => {
    const { result } = makeHook([]);

    act(() => { result.current.play(); });

    expect(result.current.isPlaying).toBe(false);
  });

  it("sets currentTrackIndex to 0 when it was null", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.play(); });

    expect(result.current.currentTrackIndex).toBe(0);
  });

  it("keeps the current index when already set", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(2); });
    act(() => { result.current.pause(); });
    act(() => { result.current.play(); });

    expect(result.current.currentTrackIndex).toBe(2);
  });
});

describe("pause()", () => {
  it("sets isPlaying to false", () => {
    const { result } = makeHook(tracks);

    act(() => {
      result.current.play();
      result.current.pause();
    });

    expect(result.current.isPlaying).toBe(false);
  });

  it("calls onPauseImmediate when provided", () => {
    let called = false;
    const { result } = renderHook(() =>
      useQueueState({ initial: tracks, onPauseImmediate: () => { called = true; } })
    );

    act(() => {
      result.current.play();
      result.current.pause();
    });

    expect(called).toBe(true);
  });
});

describe("stop()", () => {
  it("sets isPlaying to false and clears currentTrackIndex", () => {
    const { result } = makeHook(tracks);

    act(() => {
      result.current.playTrack(1);
      result.current.stop();
    });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTrackIndex).toBeNull();
  });
});

// ─── playNext / playPrev ──────────────────────────────────────────────────────

describe("playNext()", () => {
  it("advances to the next track", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(0); });
    act(() => { result.current.playNext(); });

    expect(result.current.currentTrackIndex).toBe(1);
    expect(result.current.isPlaying).toBe(true);
  });

  it("stops and clears index when on the last track", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(tracks.length - 1); });
    act(() => { result.current.playNext(); });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTrackIndex).toBeNull();
  });

  it("does nothing when currentTrackIndex is null", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playNext(); });

    expect(result.current.currentTrackIndex).toBeNull();
  });

  it("records the last-played track as finishedTrack when the queue ends", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(tracks.length - 1); });
    act(() => { result.current.playNext(); });

    expect(result.current.finishedTrack?.track_id).toBe("d");
    expect(result.current.currentTrack).toBeNull();
  });

  it("clears finishedTrack once play() restarts the queue from the top", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(tracks.length - 1); });
    act(() => { result.current.playNext(); });
    act(() => { result.current.play(); });

    expect(result.current.finishedTrack).toBeNull();
    expect(result.current.currentTrackIndex).toBe(0);
    expect(result.current.isPlaying).toBe(true);
  });
});

describe("playPrev()", () => {
  it("moves to the previous track", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(2); });
    act(() => { result.current.playPrev(); });

    expect(result.current.currentTrackIndex).toBe(1);
    expect(result.current.isPlaying).toBe(true);
  });

  it("stays at index 0 when already on the first track", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(0); });
    act(() => { result.current.playPrev(); });

    expect(result.current.currentTrackIndex).toBe(0);
  });

  it("does nothing when currentTrackIndex is null", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playPrev(); });

    expect(result.current.currentTrackIndex).toBeNull();
  });
});

// ─── playTrack ────────────────────────────────────────────────────────────────

describe("playTrack()", () => {
  it("sets currentTrackIndex and starts playing", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(2); });

    expect(result.current.currentTrackIndex).toBe(2);
    expect(result.current.isPlaying).toBe(true);
  });

  it("does nothing for out-of-bounds index", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(99); });

    expect(result.current.currentTrackIndex).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it("syncs currentTrack to the track at the given index", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(1); });

    expect(result.current.currentTrack?.track_id).toBe("b");
  });
});

// ─── replacePlaylist ──────────────────────────────────────────────────────────

describe("replacePlaylist()", () => {
  it("replaces the playlist and starts at index 0 by default", () => {
    const { result } = makeHook([]);
    const next = ["x", "y"].map(id => makeTrack(id));

    act(() => { result.current.replacePlaylist(next); });

    expect(result.current.playlist).toEqual(next);
    expect(result.current.currentTrackIndex).toBe(0);
  });

  it("starts at the specified startIndex", () => {
    const { result } = makeHook([]);
    const next = ["x", "y", "z"].map(id => makeTrack(id));

    act(() => { result.current.replacePlaylist(next, { startIndex: 2 }); });

    expect(result.current.currentTrackIndex).toBe(2);
  });

  it("clamps out-of-range startIndex to null", () => {
    const { result } = makeHook([]);
    const next = ["x"].map(id => makeTrack(id));

    act(() => { result.current.replacePlaylist(next, { startIndex: 5 }); });

    expect(result.current.currentTrackIndex).toBeNull();
  });

  it("finds the track by startTrackId", () => {
    const { result } = makeHook([]);
    const next = ["x", "y", "z"].map(id => makeTrack(id));

    act(() => { result.current.replacePlaylist(next, { startTrackId: "z" }); });

    expect(result.current.currentTrackIndex).toBe(2);
  });

  it("falls back to index 0 when startTrackId is not found in a non-empty list", () => {
    const { result } = makeHook([]);
    const next = ["x", "y"].map(id => makeTrack(id));

    act(() => { result.current.replacePlaylist(next, { startTrackId: "missing" }); });

    expect(result.current.currentTrackIndex).toBe(0);
  });

  it("sets isPlaying=true when autoplay=true and a valid index is resolved", () => {
    const { result } = makeHook([]);
    const next = ["x"].map(id => makeTrack(id));

    act(() => { result.current.replacePlaylist(next, { autoplay: true }); });

    expect(result.current.isPlaying).toBe(true);
  });

  it("sets isPlaying=false when autoplay=false", () => {
    const { result } = makeHook([]);
    const next = ["x"].map(id => makeTrack(id));
    act(() => { result.current.replacePlaylist(next, { autoplay: true }); });

    act(() => { result.current.replacePlaylist(next, { autoplay: false }); });

    expect(result.current.isPlaying).toBe(false);
  });

  it("sets currentTrackIndex to null when given an empty array", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.replacePlaylist([]); });

    expect(result.current.currentTrackIndex).toBeNull();
    expect(result.current.playlist).toEqual([]);
  });
});

// ─── appendToQueue ────────────────────────────────────────────────────────────

describe("appendToQueue()", () => {
  it("appends tracks to the end of the queue", () => {
    const { result } = makeHook(tracks.slice(0, 2));
    const extra = makeTrack("x");

    act(() => { result.current.appendToQueue(extra); });

    expect(result.current.playlist).toHaveLength(3);
    expect(result.current.playlist[2].track_id).toBe("x");
  });

  it("accepts an array of tracks", () => {
    const { result } = makeHook([]);
    const extra = ["x", "y"].map(id => makeTrack(id));

    act(() => { result.current.appendToQueue(extra); });

    expect(result.current.playlist).toHaveLength(2);
  });

  it("does nothing when an empty array is given", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.appendToQueue([]); });

    expect(result.current.playlist).toHaveLength(tracks.length);
  });
});

// ─── enqueueNext ──────────────────────────────────────────────────────────────

describe("enqueueNext()", () => {
  it("inserts tracks immediately after the current track", () => {
    const { result } = makeHook(tracks); // [a, b, c, d]

    act(() => { result.current.playTrack(1); }); // playing b at index 1

    const x = makeTrack("x");
    act(() => { result.current.enqueueNext(x); });

    // should become [a, b, x, c, d]
    expect(result.current.playlist.map((t) => t.track_id)).toEqual(["a", "b", "x", "c", "d"]);
  });

  it("starts playing from the beginning when no track is current", () => {
    const { result } = makeHook([]);

    act(() => { result.current.enqueueNext(makeTrack("x")); });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playlist[0].track_id).toBe("x");
  });
});

// ─── clearQueue ───────────────────────────────────────────────────────────────

describe("clearQueue()", () => {
  it("empties the playlist, stops playback, and clears the index", () => {
    const { result } = makeHook(tracks);

    act(() => {
      result.current.playTrack(2);
      result.current.clearQueue();
    });

    expect(result.current.playlist).toEqual([]);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTrackIndex).toBeNull();
    expect(result.current.currentTrack).toBeNull();
  });

  it("clears finishedTrack so a freshly queued track isn't shown as finished", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(tracks.length - 1); });
    act(() => { result.current.playNext(); }); // queue finishes
    act(() => { result.current.clearQueue(); });

    expect(result.current.finishedTrack).toBeNull();
  });
});

// ─── restoreQueue ─────────────────────────────────────────────────────────────

describe("restoreQueue()", () => {
  it("restores the playlist, index, playing state and finishedTrack from a snapshot", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(1); });
    const snapshot = {
      playlist: result.current.playlist,
      currentTrackIndex: result.current.currentTrackIndex,
      isPlaying: result.current.isPlaying,
      finishedTrack: result.current.finishedTrack,
    };

    act(() => { result.current.clearQueue(); });
    expect(result.current.playlist).toEqual([]);

    act(() => { result.current.restoreQueue(snapshot); });

    expect(result.current.playlist).toEqual(tracks);
    expect(result.current.currentTrackIndex).toBe(1);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentTrack?.track_id).toBe("b");
  });

  it("restores a finished-queue snapshot back into the finished state", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(tracks.length - 1); });
    act(() => { result.current.playNext(); }); // queue finishes
    const snapshot = {
      playlist: result.current.playlist,
      currentTrackIndex: result.current.currentTrackIndex,
      isPlaying: result.current.isPlaying,
      finishedTrack: result.current.finishedTrack,
    };

    act(() => { result.current.clearQueue(); });
    act(() => { result.current.restoreQueue(snapshot); });

    expect(result.current.currentTrackIndex).toBeNull();
    expect(result.current.finishedTrack?.track_id).toBe("d");
  });
});

// ─── moveTrackInQueue ─────────────────────────────────────────────────────────

describe("moveTrackInQueue()", () => {
  it("reorders tracks correctly", () => {
    const { result } = makeHook(tracks); // [a, b, c, d]

    act(() => { result.current.moveTrackInQueue(0, 3); }); // move a to end

    expect(result.current.playlist.map((t) => t.track_id)).toEqual(["b", "c", "d", "a"]);
  });

  it("does nothing when from === to", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.moveTrackInQueue(1, 1); });

    expect(result.current.playlist.map((t) => t.track_id)).toEqual(["a", "b", "c", "d"]);
  });

  it("does nothing for out-of-bounds indices", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.moveTrackInQueue(-1, 2); });
    act(() => { result.current.moveTrackInQueue(0, 99); });

    expect(result.current.playlist.map((t) => t.track_id)).toEqual(["a", "b", "c", "d"]);
  });

  it("adjusts currentTrackIndex when the playing track is moved", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(0); }); // playing a at index 0
    act(() => { result.current.moveTrackInQueue(0, 3); }); // a moves to index 3

    expect(result.current.currentTrackIndex).toBe(3);
  });
});

// ─── removeFromQueue ──────────────────────────────────────────────────────────

describe("removeFromQueue()", () => {
  it("removes the track at the given index", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.removeFromQueue(1); }); // remove b

    expect(result.current.playlist.map((t) => t.track_id)).toEqual(["a", "c", "d"]);
  });

  it("does nothing for out-of-bounds index", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.removeFromQueue(99); });

    expect(result.current.playlist).toHaveLength(tracks.length);
  });

  it("stops playback when the only track is removed", () => {
    const { result } = makeHook([makeTrack("x")]);

    act(() => { result.current.playTrack(0); });
    act(() => { result.current.removeFromQueue(0); });

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTrackIndex).toBeNull();
  });

  it("adjusts currentTrackIndex when a track before the current one is removed", () => {
    const { result } = makeHook(tracks);

    act(() => { result.current.playTrack(2); }); // playing c at index 2
    act(() => { result.current.removeFromQueue(0); }); // remove a

    expect(result.current.currentTrackIndex).toBe(1); // c is now at index 1
  });
});
