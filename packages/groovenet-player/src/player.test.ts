import { describe, expect, it, vi } from "vitest";
import type { GroovenetClient, Track } from "@groovenet/client";
import { PlayerCore } from "./player.js";
import { TrackResolver } from "./resolver.js";
import { TestPlaybackBackend } from "./testing.js";
import { PlayerError } from "./types.js";

const track = (track_id: string, local_audio_url?: string) =>
  ({
    track_id,
    friend_id: 1,
    title: track_id,
    local_audio_url,
  }) as unknown as Track;

function makePlayer() {
  const backend = new TestPlaybackBackend();
  const resolver = new TrackResolver({} as GroovenetClient, {
    apiBase: "http://server/api",
    apiKey: "key",
  });
  return { player: new PlayerCore(backend, resolver), backend };
}

describe("PlayerCore", () => {
  it("stops without closing the backend or losing the queue, and can replay", async () => {
    const { player, backend } = makePlayer();
    const pause = vi.spyOn(backend, "pause");
    await player.stop();
    player.add([track("a", "a.mp3"), track("b", "b.mp3")]);
    await player.play(1);
    backend.advance(20, 100);
    await player.stop();
    expect(player.snapshot).toMatchObject({
      status: "stopped",
      current: null,
      position: 0,
      duration: null,
    });
    expect(player.snapshot.queue).toHaveLength(2);
    expect(backend.paused).toBe(true);
    expect(backend.closed).toBe(false);
    await player.play();
    expect(player.snapshot.current?.track.track_id).toBe("b");
    expect(backend.paused).toBe(false);
    expect(pause).toHaveBeenLastCalledWith(false);
    await player.close();
  });

  it("plays in queue order, updates state and emits track lifecycle events", async () => {
    const { player, backend } = makePlayer();
    const started = vi.fn();
    const ended = vi.fn();
    player.on("track-started", started).on("track-ended", ended);
    player.add([track("a", "a.mp3"), track("b", "b.mp3")]);

    await player.play();
    expect(player.snapshot.status).toBe("playing");
    expect(backend.source?.url).toBe("http://server/api/audio?filename=a.mp3");
    expect(backend.source?.headers).toEqual({ Authorization: "Bearer key" });
    backend.finish();
    await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(2));
    expect(ended).toHaveBeenCalledTimes(1);
    expect(player.snapshot.current?.track.track_id).toBe("b");
    backend.finish();
    await vi.waitFor(() => expect(player.snapshot.status).toBe("ended"));
  });

  it("flags and skips tracks without downloaded audio", async () => {
    const { player, backend } = makePlayer();
    const skipped = vi.fn();
    player.on("track-skipped", skipped);
    player.add([track("no-audio"), track("ready", "ready.mp3")]);

    await player.play();
    expect(skipped).toHaveBeenCalledWith(
      expect.objectContaining({ track: expect.objectContaining({ track_id: "no-audio" }) }),
      expect.objectContaining({ code: "NO_AUDIO" }),
    );
    expect(player.snapshot.current?.track.track_id).toBe("ready");
    expect(backend.source?.url).toContain("ready.mp3");
  });

  it("controls pause, resume, seek, volume and output devices", async () => {
    const { player, backend } = makePlayer();
    backend.devices = [{ id: "airplay", name: "Living room" }];
    player.add([track("a", "a.mp3")]);
    await player.play();
    await player.pause();
    expect(player.snapshot.status).toBe("paused");
    await player.resume();
    await player.seek(12.5);
    await player.setVolume(42);
    await player.setOutputDevice("airplay");

    expect(backend.position).toBe(12.5);
    expect(player.snapshot.volume).toBe(42);
    expect(await player.listDevices()).toEqual([{ id: "airplay", name: "Living room" }]);
    expect(backend.outputDevice).toBe("airplay");
    await expect(player.seek(-1)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(player.setVolume(101)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    await expect(player.setOutputDevice("missing")).rejects.toMatchObject({
      code: "DEVICE_UNAVAILABLE",
    });
  });

  it("enqueues search results and playlist tracks, and removes queue entries", async () => {
    const tracks = [track("a", "a.mp3"), track("b", "b.mp3")];
    const client = {
      searchTracks: vi.fn(async () => ({
        tracks,
        estimatedTotalHits: 2,
        offset: 0,
        limit: 50,
        processingTimeMs: 1,
      })),
      getPlaylistTracks: vi.fn(async () => ({
        track_refs: [
          { track_id: "b", friend_id: 1, position: 1 },
          { track_id: "a", friend_id: 1, position: 0 },
        ],
      })),
      batchGetTracks: vi.fn(async () => tracks.slice().reverse()),
    } as unknown as GroovenetClient;
    const player = new PlayerCore(
      new TestPlaybackBackend(),
      new TrackResolver(client, { apiBase: "http://host/api" }),
    );
    const searchEntries = await player.enqueueSearch("latin", 10);
    const playlistEntries = await player.enqueuePlaylist(22);

    expect(searchEntries.map(({ track: item }) => item.track_id)).toEqual(["a", "b"]);
    expect(playlistEntries.map(({ track: item }) => item.track_id)).toEqual(["a", "b"]);
    expect(player.snapshot.queue).toHaveLength(4);
    expect(player.remove("unknown")).toBeUndefined();
    expect(player.remove(searchEntries[0]!.id)?.track.track_id).toBe("a");
  });

  it("supports previous and next across unavailable entries and emits typed changes", async () => {
    const { player, backend } = makePlayer();
    const change = vi.fn();
    const removedListener = vi.fn();
    player.on("change", change).on("change", removedListener);
    player.off("change", removedListener);
    player.add([track("one", "1.mp3"), track("missing"), track("three", "3.mp3")]);
    expect(removedListener).not.toHaveBeenCalled();

    await player.play();
    await player.next();
    expect(player.snapshot.current?.track.track_id).toBe("three");
    await player.previous();
    expect(player.snapshot.current?.track.track_id).toBe("one");
    expect(change).toHaveBeenCalled();
    expect(backend.source?.url).toContain("1.mp3");
  });

  it("records backend failures and closes its owned backend", async () => {
    const { player, backend } = makePlayer();
    player.add([track("a", "a.mp3")]);
    await player.play();
    backend.fail(new PlayerError("STREAM_FAILED", "Server rejected the stream"));
    expect(player.snapshot).toMatchObject({ status: "error", error: { code: "STREAM_FAILED" } });
    await player.close();
    expect(backend.closed).toBe(true);
    expect(player.snapshot).toMatchObject({ status: "stopped", current: null });
  });

  it("wraps a backend load failure with track context", async () => {
    const { player, backend } = makePlayer();
    backend.load = vi.fn(async () => {
      throw new Error("connection refused");
    });
    player.add([track("unreachable", "remote.mp3")]);
    await expect(player.play()).rejects.toMatchObject({
      code: "STREAM_FAILED",
      message: expect.stringContaining("unreachable"),
    });
    expect(player.snapshot.status).toBe("error");
  });

  it("preserves typed backend errors and handles an ended event without a current track", async () => {
    const { player, backend } = makePlayer();
    backend.load = vi.fn(async () => {
      throw new PlayerError("DEVICE_UNAVAILABLE", "output disappeared");
    });
    player.add([track("unreachable", "remote.mp3")]);
    await expect(player.play(0)).rejects.toMatchObject({
      code: "DEVICE_UNAVAILABLE",
      message: "output disappeared",
    });

    const ended = vi.fn();
    player.on("track-ended", ended);
    await player.close();
    player.remove(0);
    backend.finish();
    await vi.waitFor(() => expect(player.snapshot.status).toBe("ended"));
    expect(ended).not.toHaveBeenCalled();
  });

  it("rejects previous on an empty queue and safely stays on the first track", async () => {
    const { player } = makePlayer();
    await expect(player.previous()).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    player.add([track("first", "first.mp3")]);
    await player.play();
    await player.previous();
    expect(player.snapshot.current?.track.track_id).toBe("first");
  });

  it("supports explicit queue selection and next without a current track", async () => {
    const { player } = makePlayer();
    player.add([track("first", "first.mp3"), track("second", "second.mp3")]);
    await player.play(1);
    expect(player.snapshot.current?.track.track_id).toBe("second");
    await player.next();
    expect(player.snapshot.status).toBe("ended");

    await player.close();
    await player.next();
    expect(player.snapshot.current?.track.track_id).toBe("first");
  });

  it("rejects play on an empty queue and handles queue movement", async () => {
    const { player } = makePlayer();
    await expect(player.play()).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
    const [a, b] = player.add([track("a", "a.mp3"), track("b", "b.mp3")]);
    player.move(0, 1);
    expect(player.snapshot.queue.map(({ track: item }) => item.track_id)).toEqual(["b", "a"]);
    expect(player.remove(a!.id)?.track.track_id).toBe("a");
    expect(player.snapshot.queue[0]?.id).toBe(b?.id);
  });
});
