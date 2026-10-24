import React, { act } from "react";
import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroovenetClient, Track } from "@groovenet/client";
import { PlayerProtocolError, type PlayerControlClient, type PlayerDaemon, type PlaybackSnapshot } from "@groovenet/player";
import { RemotePlayerController } from "./remotePlayer.js";
import { PlayerTui, runPlayerTui, type PlayerTuiRuntime } from "./playerTui.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = { track_id: "t1", friend_id: 1, title: "Blue Train", artist: "John Coltrane", bpm: 132, key: "A minor", local_audio_url: "blue-train.flac" } as Track;

function makeProps(queue: PlaybackSnapshot["queue"] = []) {
  const snapshot = { status: "playing", current: { id: "current", track }, queue, position: 12, duration: 180, volume: 70, error: null } as PlaybackSnapshot;
  const control = new EventEmitter() as EventEmitter & { request: ReturnType<typeof vi.fn> };
  control.request = vi.fn(async (method: string) => {
    if (method === "status") return snapshot;
    if (method === "devices") return [{ id: "airplay", name: "Living room" }];
    return snapshot;
  });
  const api = {
    searchTracks: vi.fn(async () => ({ tracks: [track] })),
    listPlaylists: vi.fn(async () => [{ id: 1, name: "Late night" }]),
  };
  return { control: control as unknown as PlayerControlClient, api: api as unknown as GroovenetClient, initialSnapshot: snapshot };
}

function makeControl(request: () => unknown) {
  const control = new EventEmitter() as EventEmitter & { request: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  control.request = vi.fn(request);
  control.close = vi.fn(async () => undefined);
  return control as unknown as PlayerControlClient & { request: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}

describe("PlayerTui", () => {
  afterEach(() => act(() => cleanup()));

  it("renders now-playing metadata, help, and queue entries", async () => {
    const props = makeProps([{ id: "q1", track }]);
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("John Coltrane — Blue Train");
    expect(app.lastFrame()).toContain("132 BPM · A minor");
    expect(app.lastFrame()).toContain("0:12 / 3:00");
    expect(app.lastFrame()).toContain("Space pause");
    expect(app.lastFrame()).toContain("Blue Train");
    const updated = { ...props.initialSnapshot, position: 28 };
    await act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "state", data: updated }); });
    expect(app.lastFrame()).toContain("0:28 / 3:00");
    await act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "error", data: { error: { message: "mpv stream failed" } } }); });
    expect(app.lastFrame()).toContain("mpv stream failed");
  });

  it("scrolls a long list so the selection stays visible", async () => {
    const queue = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, track: { ...track, title: `Song ${i}` } }));
    const props = makeProps(queue);
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("Song 0");
    expect(app.lastFrame()).not.toContain("Song 12");
    for (let i = 0; i < 20; i++) await act(async () => { app.stdin.write("j"); });
    const frame = app.lastFrame()!;
    expect(frame).toContain("› John Coltrane — Song 20");
    expect(frame).toContain("21/30");
    expect(frame).not.toContain("Song 0\n");
  });

  it("searches, renders results, and adds the selected track", async () => {
    const props = makeProps();
    const unavailableTrack = { ...track, local_audio_url: null } as Track;
    props.api.searchTracks = vi.fn(async () => ({ tracks: [unavailableTrack] })) as unknown as GroovenetClient["searchTracks"];
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    await act(async () => { app.stdin.write("/"); });
    await act(async () => { app.stdin.write("miles"); });
    await act(async () => { app.stdin.write("\r"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(props.api.searchTracks).toHaveBeenCalledWith({ query: "miles", limit: 30 });
    expect(app.lastFrame()).toContain("John Coltrane — Blue Train");
    expect(app.lastFrame()).toContain("no downloaded audio");
    await act(async () => { app.stdin.write("a"); await new Promise((resolve) => setImmediate(resolve)); });
    expect((props.control as unknown as { request: ReturnType<typeof vi.fn> }).request).toHaveBeenCalledWith("queue.addTrack", { track: unavailableTrack });
  });

  it("loads playlists and sends playback, seek, volume, and pause keys", async () => {
    const props = makeProps([{ id: "q1", track }]);
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    await act(async () => { app.stdin.write("l"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(props.api.listPlaylists).toHaveBeenCalledOnce();
    expect(app.lastFrame()).toContain("Late night");
    await act(async () => { app.stdin.write("\r"); await new Promise((resolve) => setImmediate(resolve)); });
    const request = (props.control as unknown as { request: ReturnType<typeof vi.fn> }).request;
    expect(request).toHaveBeenCalledWith("queue.add", { playlistId: "1" });
    await act(async () => { app.stdin.write("u"); });
    await act(async () => { app.stdin.write(" "); });
    await act(async () => { app.stdin.write("n"); });
    await act(async () => { app.stdin.write("p"); });
    await act(async () => { app.stdin.write("\u001b[D"); });
    await act(async () => { app.stdin.write("\u001b[C"); });
    await act(async () => { app.stdin.write("+"); });
    await act(async () => { app.stdin.write("-"); });
    await act(async () => { app.stdin.write("?"); });
    await act(async () => { app.stdin.write("j"); });
    expect(app.lastFrame()).toContain("Press ? for help");
    await act(async () => { app.stdin.write("r"); });
    await act(async () => { app.stdin.write("u"); });
    await act(async () => { app.stdin.write("\r"); });
    await act(async () => { app.stdin.write("q"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(request).toHaveBeenCalledWith("pause", undefined);
    expect(request).toHaveBeenCalledWith("play", undefined);
    expect(request).toHaveBeenCalledWith("play", { index: 0 });
    expect(request).toHaveBeenCalledWith("next", undefined);
    expect(request).toHaveBeenCalledWith("prev", undefined);
    expect(request).toHaveBeenCalledWith("seek", { seconds: 2 });
    expect(request).toHaveBeenCalledWith("seek", { seconds: 22 });
    expect(request).toHaveBeenCalledWith("volume", { volume: 75 });
    expect(request).toHaveBeenCalledWith("volume", { volume: 65 });
  });

  it("shows actionable API and control errors", async () => {
    const props = makeProps();
    props.api.searchTracks = vi.fn(async () => { throw new Error("API key rejected"); }) as unknown as GroovenetClient["searchTracks"];
    const app = render(<PlayerTui {...props} options={{ search: "jazz" }} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("API key rejected");
    (props.control as unknown as { request: ReturnType<typeof vi.fn> }).request.mockRejectedValueOnce("daemon unavailable");
    await act(async () => { app.stdin.write("n"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("daemon unavailable");
  });

  it("shows empty search results and uses the fallback for events without messages", async () => {
    const props = makeProps();
    props.api.searchTracks = vi.fn(async () => ({ tracks: [] })) as unknown as GroovenetClient["searchTracks"];
    const app = render(<PlayerTui {...props} options={{ search: "missing track" }} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("No tracks found.");
    await act(async () => {
      (props.control as unknown as EventEmitter).emit("event", { event: "error", data: { error: {} } });
    });
    expect(app.lastFrame()).toContain("A track could not be played.");
  });

  it("reports playlist loading errors and supports cancelling search", async () => {
    const props = makeProps();
    props.api.listPlaylists = vi.fn(async () => { throw new Error("Could not load playlists"); }) as unknown as GroovenetClient["listPlaylists"];
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    await act(async () => { app.stdin.write("l"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("Could not load playlists");
    await act(async () => { app.stdin.write("/"); });
    await act(async () => { app.stdin.write("jazz"); });
    await act(async () => { app.stdin.write("\u001b"); await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(app.lastFrame()).toContain("Query: jazz");
    expect(app.lastFrame()).not.toContain("Search: jazz");
  });

  it("opens devices and selects one, and removes a selected queue entry", async () => {
    const props = makeProps([{ id: "q1", track }]);
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    await act(async () => { app.stdin.write("d"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("Living room [airplay]");
    await act(async () => { app.stdin.write("\r"); await new Promise((resolve) => setImmediate(resolve)); });
    const request = (props.control as unknown as { request: ReturnType<typeof vi.fn> }).request;
    expect(request).toHaveBeenCalledWith("devices.select", { id: "airplay" });
    await act(async () => { app.stdin.write("u"); app.stdin.write("x"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(request).toHaveBeenCalledWith("queue.remove", { id: "q1" });
  });

  it("renders unselected items, handles empty selections, and respects playback boundaries", async () => {
    const props = makeProps([{ id: "q1", track }, { id: "q2", track: { ...track, title: "Second track" } as Track }]);
    const request = (props.control as unknown as { request: ReturnType<typeof vi.fn> }).request;
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("Second track");
    await act(async () => { app.stdin.write("j"); });
    await act(async () => { app.stdin.write("x"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(request).toHaveBeenCalledWith("queue.remove", { id: "q2" });
    request.mockResolvedValueOnce([]);
    await act(async () => { app.stdin.write("d"); await new Promise((resolve) => setImmediate(resolve)); });
    await act(async () => { app.stdin.write("\r"); });
    expect(request).not.toHaveBeenCalledWith("devices.select", expect.anything());
    request.mockResolvedValueOnce({ not: "a device list" });
    await act(async () => { app.stdin.write("d"); await new Promise((resolve) => setImmediate(resolve)); });
  });

  it("adds a startup playlist to the queue", async () => {
    const props = makeProps();
    render(<PlayerTui {...props} options={{ playlist: "28" }} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    const request = (props.control as unknown as { request: ReturnType<typeof vi.fn> }).request;
    expect(request).toHaveBeenCalledWith("queue.add", { playlistId: "28" });
  });

  it("attaches to an existing daemon and restores its client on exit", async () => {
    const props = makeProps();
    const control = makeControl(async () => props.initialSnapshot);
    const renderTui = vi.fn(() => ({ waitUntilExit: async () => undefined }));
    const runtime: PlayerTuiRuntime = {
      createControl: () => control,
      render: renderTui,
    };
    await runPlayerTui({}, runtime);
    expect(renderTui).toHaveBeenCalledWith(expect.anything(), { alternateScreen: true, exitOnCtrlC: true });
    expect(control.close).toHaveBeenCalledOnce();
  });

  it("starts and owns an embedded daemon only when the socket is unavailable", async () => {
    const props = makeProps();
    const first = makeControl(async () => { throw new PlayerProtocolError("DAEMON_UNAVAILABLE", "missing"); });
    const second = makeControl(async () => props.initialSnapshot);
    const createControl = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const daemon = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) } as unknown as PlayerDaemon;
    const renderTui = vi.fn(() => ({ waitUntilExit: async () => undefined }));
    await runPlayerTui({}, {
      createControl,
      createDaemon: () => daemon,
      createApi: () => props.api,
      render: renderTui,
    });
    expect(daemon.start).toHaveBeenCalledOnce();
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(daemon.stop).toHaveBeenCalledOnce();
  });

  it("cleans an owned daemon when the second connection fails", async () => {
    const first = makeControl(async () => { throw new PlayerProtocolError("DAEMON_UNAVAILABLE", "missing"); });
    const second = makeControl(async () => { throw new Error("daemon failed after start"); });
    const createControl = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const daemon = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) } as unknown as PlayerDaemon;
    const runtime: PlayerTuiRuntime = { createControl, createDaemon: () => daemon, render: vi.fn() };
    await expect(runPlayerTui({}, runtime)).rejects.toThrow("daemon failed after start");
    expect(second.close).toHaveBeenCalledOnce();
    expect(daemon.stop).toHaveBeenCalledOnce();
  });

  it("does not launch a second daemon for an incompatible running protocol", async () => {
    const control = makeControl(async () => { throw new PlayerProtocolError("VERSION_MISMATCH", "upgrade packages"); });
    const renderTui = vi.fn();
    await expect(runPlayerTui({}, { createControl: () => control, render: renderTui })).rejects.toThrow("upgrade packages");
    expect(control.close).toHaveBeenCalledOnce();
    expect(renderTui).not.toHaveBeenCalled();
  });

  it("cleans up when the embedded daemon cannot start", async () => {
    const control = makeControl(async () => { throw new PlayerProtocolError("DAEMON_UNAVAILABLE", "missing"); });
    const daemon = { start: vi.fn(async () => { throw new Error("mpv unavailable"); }), stop: vi.fn(async () => undefined) } as unknown as PlayerDaemon;
    await expect(runPlayerTui({}, { createControl: () => control, createDaemon: () => daemon })).rejects.toThrow("mpv unavailable");
    expect(control.close).toHaveBeenCalledOnce();
    expect(daemon.stop).toHaveBeenCalledOnce();
  });
});

describe("remote TUI", () => {
  afterEach(() => act(() => cleanup()));
  const remotePlayer = { id: "room", name: "Room", revision: 8, engine_id: "primary", assigned_output: "speaker",
    state: { queue: [], current_entry_id: null, status: "stopped", position: 0, duration: null, volume: 50, error: null, desired_output: "speaker", checkpoint: true } };
  it("selects only the remote controller and leaves audio running on exit or render failure", async () => {
    const remote = Object.assign(new EventEmitter(), { refresh: vi.fn(async () => makeProps().initialSnapshot), startEvents: vi.fn(), close: vi.fn(async () => undefined) });
    const createDaemon = vi.fn();
    const createControl = vi.fn();
    const runtime = { createRemote: vi.fn(() => remote), createDaemon, createControl, createApi: () => makeProps().api, render: vi.fn(() => ({ waitUntilExit: async () => undefined })) } as unknown as PlayerTuiRuntime;
    await runPlayerTui({ remote: "room" }, runtime);
    expect(runtime.createRemote).toHaveBeenCalledWith("room");
    expect(remote.startEvents).toHaveBeenCalledOnce();
    expect(remote.close).toHaveBeenCalledOnce();
    expect(createDaemon).not.toHaveBeenCalled(); expect(createControl).not.toHaveBeenCalled();
    remote.refresh.mockRejectedValueOnce(new Error("unreachable"));
    await expect(runPlayerTui({ remote: "room" }, runtime)).rejects.toThrow("unreachable");
    expect(createDaemon).not.toHaveBeenCalled();
    await expect(runPlayerTui({ remote: "room", backend: "mpv" }, runtime)).rejects.toThrow("server engine settings");
  });
  it("displays remote identity/checkpoints/disconnection and explicit speaker controls", async () => {
    const props = makeProps([{ id: "entry-uuid", track }]);
    const snapshot = { ...props.initialSnapshot, remote: { player: remotePlayer, connected: true } };
    const request = props.control.request as ReturnType<typeof vi.fn>;
    request.mockResolvedValue(snapshot);
    const app = render(<PlayerTui {...props} initialSnapshot={snapshot} options={{ remote: "room" }} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("Remote: Room [room]");
    expect(app.lastFrame()).toContain("saved checkpoint");
    await act(async () => { app.stdin.write("\r"); });
    expect(request).toHaveBeenCalledWith("play", { id: "entry-uuid" });
    request.mockResolvedValueOnce([{ id: "speaker", name: "Room · activity=unknown · assigned=other · sender=unknown" }]);
    await act(async () => { app.stdin.write("d"); });
    expect(app.lastFrame()).toContain("activity=unknown");
    for (const key of ["U", "T", "t", "Y", "!"]) await act(async () => { app.stdin.write(key); });
    expect(request).toHaveBeenCalledWith("play", { allow_unknown: true });
    expect(request).toHaveBeenCalledWith("play", { takeover: true });
    expect(request).toHaveBeenCalledWith("devices.transfer", { id: "speaker" });
    expect(request).toHaveBeenCalledWith("devices.transfer", { id: "speaker", allow_unknown: true });
    expect(request).toHaveBeenCalledWith("devices.transfer", { id: "speaker", takeover: true });
    await act(async () => { app.stdin.write("u"); });
    await act(async () => { app.stdin.write("["); });
    await act(async () => { app.stdin.write("]"); });
    await act(async () => { app.stdin.write("s"); });
    expect(request).toHaveBeenCalledWith("queue.move", { id: "entry-uuid", to: 0 });
    expect(request).toHaveBeenCalledWith("stop", undefined);
    await act(async () => { props.control.emit("event", { event: "state", data: { ...snapshot, remote: { player: { ...remotePlayer, state: { ...remotePlayer.state, checkpoint: false } }, connected: false } } }); });
    expect(app.lastFrame()).toContain("DISCONNECTED");
    expect(app.lastFrame()).toContain("live state");
    await act(async () => { props.control.emit("event", { event: "state", data: { ...snapshot, queue: [], remote: { player: { ...remotePlayer, assigned_output: null, state: { ...remotePlayer.state, desired_output: null } }, connected: true } } }); });
    await act(async () => { app.stdin.write("]"); });
    request.mockResolvedValueOnce([]);
    await act(async () => { app.stdin.write("d"); });
    await act(async () => { app.stdin.write("t"); });
  });
});


it("uses the default remote factory without touching local playback", async () => {
  const refresh = vi.spyOn(RemotePlayerController.prototype, "refresh").mockResolvedValue(makeProps().initialSnapshot as never);
  const events = vi.spyOn(RemotePlayerController.prototype, "startEvents").mockImplementation(() => undefined);
  const close = vi.spyOn(RemotePlayerController.prototype, "close").mockResolvedValue(undefined);
  try {
    await runPlayerTui({ remote: "room" }, { render: () => ({ waitUntilExit: async () => undefined }) });
    expect(refresh).toHaveBeenCalledOnce(); expect(events).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  } finally { refresh.mockRestore(); events.mockRestore(); close.mockRestore(); }
});

it("refreshes speaker observations and clears failed/stale reads after unmount", async () => {
  let poll!: () => void;
  const interval = vi.spyOn(globalThis, "setInterval").mockImplementation(((callback: () => void) => { poll = callback; return 123; }) as never);
  const props = makeProps();
  const snapshot = { ...props.initialSnapshot, remote: { player: { id: "room", name: "Room", revision: 1, assigned_output: null, state: { desired_output: "speaker", checkpoint: false } }, connected: true } };
  const request = props.control.request as ReturnType<typeof vi.fn>;
  request.mockImplementation(async (method: string) => method === "devices" ? [{ id: "speaker", name: "Room · activity=idle" }] : snapshot);
  let app: ReturnType<typeof render>;
  try {
    await act(async () => { app = render(<PlayerTui {...props} initialSnapshot={snapshot as never} options={{ remote: "room" }} />); });
    expect(app!.lastFrame()).toContain("Room · activity=idle");
    request.mockRejectedValueOnce(new Error("observer offline"));
    await act(async () => { poll(); });
    expect(app!.lastFrame()).toContain("Speaker observations unavailable: observer offline");
    let resolve!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { poll(); });
    await act(async () => { app!.unmount(); resolve([]); });
  } finally { interval.mockRestore(); await act(async () => cleanup()); }
});
