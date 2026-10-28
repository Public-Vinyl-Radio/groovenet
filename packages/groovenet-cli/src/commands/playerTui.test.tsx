import React, { act } from "react";
import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroovenetClient, Track } from "@groovenet/client";
import { PlayerProtocolError, type PlayerControlClient, type PlayerDaemon, type PlaybackSnapshot } from "@groovenet/player";
import { RemotePlayerController } from "./remotePlayer.js";
import { PlayerTui, runPlayerTui, type PlayerTuiRuntime } from "./playerTui.js";
import { buildKeymap } from "./playerKeymap.js";
import { forceTerminal, resizeTerminal } from "../tui/testing.js";
import { makeTheme } from "../tui/theme.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The full window board's size, in plain text.
beforeEach(() => { forceTerminal(120, 40); });

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
    expect(app.lastFrame()).toMatch(/Blue Train\s+┃/);
    expect(app.lastFrame()).toMatch(/John Coltrane\s+┃/);
    expect(app.lastFrame()).toContain("132 BPM · 8A");
    expect(app.lastFrame()).toMatch(/0:12 ━+─+ 3:00 {2}▶ PLAYING/);
    expect(app.lastFrame()).toContain("Space pause");
    expect(app.lastFrame()).toMatch(/1 {2}Blue Train\s+John Coltrane\s+-:--\s+132 {2}8A$/m);
    const updated = { ...props.initialSnapshot, position: 28 };
    await act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "state", data: updated }); });
    expect(app.lastFrame()).toMatch(/0:28 ━+─+ 3:00/);
    await act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "error", data: { error: { message: "mpv stream failed" } } }); });
    expect(app.lastFrame()).toContain("mpv stream failed");
  });

  it("scrolls a long list so the selection stays visible", async () => {
    const queue = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, track: { ...track, title: `Song ${i}` } }));
    const props = makeProps(queue);
    const app = render(<PlayerTui {...props} options={{}} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    // 120×40 leaves 21 body rows: the column header and 20 entries.
    expect(app.lastFrame()).toContain("Song 0 ");
    expect(app.lastFrame()).toContain("Song 19 ");
    expect(app.lastFrame()).not.toContain("Song 20 ");
    for (let i = 0; i < 25; i++) await act(async () => { app.stdin.write("j"); });
    const frame = app.lastFrame()!;
    expect(frame).toMatch(/^› {2}26 {2}Song 25 /m);
    expect(frame).toContain("30 in queue · 26/30");
    expect(frame).not.toContain("Song 5 ");
    expect(frame).toContain("Song 6 ");
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
    expect(app.lastFrame()).toContain("KEYS");
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
    await act(async () => { app.stdin.write("u"); });
    await act(async () => { app.stdin.write("x"); await new Promise((resolve) => setImmediate(resolve)); });
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
    const props = makeProps([{ id: "entry-uuid", track }, { id: "second", track: { ...track, title: "Second" } as Track }]);
    const snapshot = { ...props.initialSnapshot, remote: { player: remotePlayer, connected: true } };
    const request = props.control.request as ReturnType<typeof vi.fn>;
    request.mockResolvedValue(snapshot);
    const app = render(<PlayerTui {...props} initialSnapshot={snapshot} options={{ remote: "room" }} />);
    await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("PLAY ON ROOM ● LIVE");
    expect(app.lastFrame()).toContain("NO OUTPUT · connected · saved checkpoint · 2 in queue · 1/2");
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
    expect(request).not.toHaveBeenCalledWith("queue.move", expect.anything());
    await act(async () => { app.stdin.write("]"); });
    await act(async () => { app.stdin.write("]"); });
    await act(async () => { app.stdin.write("["); });
    await act(async () => { app.stdin.write("s"); });
    // The cursor follows the moved entry; the stub's queue keeps its order, so `[` then moves the other one.
    expect(request.mock.calls.filter(([method]) => method === "queue.move")).toEqual([["queue.move", { id: "entry-uuid", to: 1 }], ["queue.move", { id: "second", to: 0 }]]);
    expect(request).toHaveBeenCalledWith("stop", undefined);
    await act(async () => { props.control.emit("event", { event: "state", data: { ...snapshot, remote: { player: { ...remotePlayer, state: { ...remotePlayer.state, checkpoint: false } }, connected: false } } }); });
    expect(app.lastFrame()).toContain("DISCONNECTED · state may be stale · 2 in queue");
    expect(app.lastFrame()).not.toContain("saved checkpoint");
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
    expect(app!.lastFrame()).toContain("Room · connected · 0 in queue");
    request.mockRejectedValueOnce(new Error("observer offline"));
    await act(async () => { poll(); });
    expect(app!.lastFrame()).toContain("Speaker observations unavailable: observer offline");
    let resolve!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { poll(); });
    await act(async () => { app!.unmount(); resolve([]); });
  } finally { interval.mockRestore(); await act(async () => cleanup()); }
});

describe("PlayerTui keymap", () => {
  afterEach(() => act(() => cleanup()));
  const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
  const requestOf = (props: ReturnType<typeof makeProps>) => (props.control as unknown as { request: ReturnType<typeof vi.fn> }).request;

  it("renders the hint bar from the default keymap, and the help overlay when toggled", async () => {
    const app = render(<PlayerTui {...makeProps()} options={{}} />);
    await settle();
    expect(app.lastFrame()).toContain("↑/↓ select   Enter add/play   r play   x remove   [/] move   Space pause   n/p skip");
    expect(app.lastFrame()).toContain("? help   q quit");
    expect(app.lastFrame()).not.toContain("KEYS");
    await act(async () => { app.stdin.write("?"); });
    expect(app.lastFrame()).toContain(" KEYS ");
    expect(app.lastFrame()).toMatch(/Space\s+Pause or resume/);
    expect(app.lastFrame()).toMatch(/q\s+Quit the player/);
    await act(async () => { app.stdin.write("?"); });
    expect(app.lastFrame()).not.toContain("KEYS");
  });

  it("shows a rebound key everywhere and acts on it", async () => {
    const props = makeProps();
    const keymap = buildKeymap({ "transport.next": ["ctrl+n"], "app.help": ["h"], "app.quit": ["Q"] });
    const app = render(<PlayerTui {...props} options={{}} keymap={keymap} />);
    await settle();
    expect(app.lastFrame()).toContain("^N/p skip");
    expect(app.lastFrame()).toContain("h help   Q quit");
    await act(async () => { app.stdin.write("n"); });
    expect(requestOf(props)).not.toHaveBeenCalledWith("next", undefined);
    await act(async () => { app.stdin.write("\u000e"); });
    expect(requestOf(props)).toHaveBeenCalledWith("next", undefined);
    await act(async () => { app.stdin.write("h"); });
    expect(app.lastFrame()).toMatch(/\^N\s+Skip to the next track/);
    expect(app.lastFrame()).toMatch(/h\s+Show or hide the key list/);
  });

  it("omits help text for keys that are unbound", async () => {
    const app = render(<PlayerTui {...makeProps()} options={{}} keymap={buildKeymap({ "app.help": [], "app.quit": [] })} />);
    await settle();
    await act(async () => { app.stdin.write("q"); });
    expect(app.lastFrame()).not.toContain("quit");
  });

  it("lets typing win in the search box, with the input keys as its hints", async () => {
    const props = makeProps();
    const keymap = buildKeymap({ "input.submit": ["ctrl+g"], "transport.next": ["n"] });
    const app = render(<PlayerTui {...props} options={{}} keymap={keymap} />);
    await settle();
    await act(async () => { app.stdin.write("/"); });
    expect(app.lastFrame()).toContain("^G search   Esc cancel");
    // q, n, space and capital letters are typed, not commands.
    await act(async () => { app.stdin.write("qn U"); });
    expect(app.lastFrame()).toContain("Search: qn U");
    expect(requestOf(props)).not.toHaveBeenCalledWith("next", undefined);
    await act(async () => { app.stdin.write("\u007f"); });
    expect(app.lastFrame()).toContain("Search: qn ");
    await act(async () => { app.stdin.write("\r"); });
    expect(props.api.searchTracks).not.toHaveBeenCalled();
    await act(async () => { app.stdin.write("\u0007"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(props.api.searchTracks).toHaveBeenCalledWith({ query: "qn ", limit: 30 });
  });

  it("moves the selection with k and the up arrow, stopping at the first entry", async () => {
    const queue = [0, 1, 2].map((i) => ({ id: `q${i}`, track: { ...track, title: `Song ${i}` } }));
    const app = render(<PlayerTui {...makeProps(queue)} options={{}} />);
    await settle();
    await act(async () => { app.stdin.write("j"); });
    await act(async () => { app.stdin.write("j"); });
    expect(app.lastFrame()).toMatch(/^› {3}3 {2}Song 2 /m);
    await act(async () => { app.stdin.write("k"); });
    await act(async () => { app.stdin.write("\u001b[A"); });
    await act(async () => { app.stdin.write("k"); });
    expect(app.lastFrame()).toMatch(/^› {3}1 {2}Song 0 /m);
  });

  it("opens the output list with play-on and ignores the keys for views that do not exist yet", async () => {
    const props = makeProps([{ id: "q1", track }]);
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    await act(async () => { app.stdin.write("~"); });
    await act(async () => { app.stdin.write("\t"); });
    await act(async () => { app.stdin.write("\u001b[C"); });
    expect(requestOf(props)).toHaveBeenCalledWith("seek", { seconds: 22 });
    await act(async () => { app.stdin.write("o"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("Living room [airplay]");
  });

  it("shows keymap problems once and dismisses them on the next key", async () => {
    const props = makeProps();
    const keymap = buildKeymap({ "transport.nxt": ["n"], "transport.prev": ["bogus"] });
    const app = render(<PlayerTui {...props} options={{}} keymap={keymap} />);
    await settle();
    expect(app.lastFrame()).toContain("Keymap: ");
    expect(app.lastFrame()).toContain('Unknown action "transport.nxt"');
    expect(app.lastFrame()).toContain("groovenet player keys");
    await act(async () => { app.stdin.write("j"); });
    expect(app.lastFrame()).not.toContain("Keymap: ");
  });

  it("summarises a long list of problems", async () => {
    const keymap = buildKeymap(Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`bad.action${i}`, ["x"]])));
    const app = render(<PlayerTui {...makeProps()} options={{}} keymap={keymap} />);
    await settle();
    expect(app.lastFrame()).toContain("+2 more");
  });

  it("builds the remote key line and handles remote keys from the keymap", async () => {
    const props = makeProps([{ id: "entry-uuid", track }]);
    const snapshot = { ...props.initialSnapshot, remote: { player: { id: "room", name: "Room", revision: 8, assigned_output: "speaker", state: { desired_output: "speaker", checkpoint: false } }, connected: true } };
    const request = requestOf(props);
    request.mockImplementation(async (method: string) => method === "devices" ? [{ id: "speaker", name: "Speaker" }] : snapshot);
    const keymap = buildKeymap({ "devices.transfer": ["ctrl+t"], "app.quit": ["Q"], "queue.move-down": ["}"] });
    const app = render(<PlayerTui {...props} initialSnapshot={snapshot as never} options={{ remote: "room" }} keymap={keymap} />);
    await settle();
    expect(app.lastFrame()).toContain("Remote keys: U play desired output allowing unknown");
    expect(app.lastFrame()).toContain("^T transfer+play");
    // The line wraps to the body width; "Q" lands on the next row.
    expect(app.lastFrame()).toContain("! transfer taking over occupied · s stop · server audio continues after Q");
    expect(app.lastFrame()).toContain("[/} move");
    await act(async () => { app.stdin.write("d"); });
    await settle();
    await act(async () => { app.stdin.write("t"); });
    expect(request).not.toHaveBeenCalledWith("devices.transfer", expect.anything());
    await act(async () => { app.stdin.write("\u0014"); });
    expect(request).toHaveBeenCalledWith("devices.transfer", { id: "speaker" });
  });

  it("passes the configured keymap into the TUI, and builds one from the config by default", async () => {
    const props = makeProps();
    const keymap = buildKeymap({ "app.quit": ["Q"] });
    const renderTui = vi.fn(() => ({ waitUntilExit: async () => undefined }));
    await runPlayerTui({}, { createControl: () => makeControl(async () => props.initialSnapshot), keymap, render: renderTui });
    expect((renderTui.mock.calls[0] as unknown as [{ props: { keymap: unknown } }])[0].props.keymap).toBe(keymap);
    const fallback = vi.fn(() => ({ waitUntilExit: async () => undefined }));
    await runPlayerTui({}, { createControl: () => makeControl(async () => props.initialSnapshot), render: fallback });
    expect((fallback.mock.calls[0] as unknown as [{ props: { keymap: { actions: unknown[] } } }])[0].props.keymap.actions.length).toBeGreaterThan(20);
  });
});

describe("PlayerTui layouts", () => {
  afterEach(() => act(() => cleanup()));
  const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
  const queue = [
    { id: "q1", track },
    { id: "q2", track: { ...track, title: "東京の夜 (Tokyo Night) — extended edit for the long-title case", artist: "坂本龍一" } as Track },
    { id: "q3", track: { ...track, title: "Cafe\u0301 Ünïcode 🎧", artist: "Les Combine\u0301s" } as Track },
  ];

  it.each([
    ["full window", 120, 40],
    ["side pane", 40, 50],
    ["bottom strip", 120, 5],
    ["too small", 50, 4],
  ])("renders the %s at %i×%i", async (_name, columns, rows) => {
    forceTerminal(columns, rows);
    const app = render(<PlayerTui {...makeProps(queue)} options={{}} />);
    await settle();
    expect(app.lastFrame()).toMatchSnapshot();
  });

  it("relayouts on resize, down to the size message and back", async () => {
    const props = makeProps(queue);
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    expect(app.lastFrame()).toContain("PLAY ON LOCAL");
    await act(async () => { resizeTerminal(app.stdout, 40, 50); });
    expect(app.lastFrame()!.split("\n")[0]).toMatch(/^ GROOVENET\s+LOCAL$/);
    await act(async () => { resizeTerminal(app.stdout, 120, 5); });
    expect(app.lastFrame()!.split("\n")[0]).toMatch(/^┏━ GROOVENET/);
    await act(async () => { resizeTerminal(app.stdout, 50, 4); });
    expect(app.lastFrame()).toContain("Terminal too small (50×4)");
    await act(async () => { resizeTerminal(app.stdout, 120, 40); });
    expect(app.lastFrame()).toContain("NOW PLAYING");
    // Keys still work in every layout.
    await act(async () => { resizeTerminal(app.stdout, 120, 5); });
    await act(async () => { app.stdin.write("n"); });
    expect(props.control.request).toHaveBeenCalledWith("next", undefined);
  });

  it("emits ANSI colours, or under NO_COLOR only inverse and bold", async () => {
    forceTerminal(120, 40, { colorLevel: 1 });
    const colour = render(<PlayerTui {...makeProps(queue)} options={{}} theme={makeTheme({ color: true })} />);
    await settle();
    const coloured = colour.lastFrame()!;
    expect(coloured).toContain("\u001b[32m"); // live: green
    expect(coloured).toContain("\u001b[90m"); // dim: bright black
    expect(coloured).toContain("\u001b[2m"); // muted: dim
    expect(coloured).toContain("\u001b[7m"); // selection and reverse labels: inverse
    expect(coloured).not.toMatch(/\u001b\[38;[25];/); // never 256-colour or truecolour
    colour.unmount();
    const mono = render(<PlayerTui {...makeProps(queue)} options={{}} theme={makeTheme({ color: false })} />);
    await settle();
    const plain = mono.lastFrame()!;
    expect(plain).not.toMatch(/\u001b\[(3[0-9]|9[0-7]|2)m/);
    expect(plain).toContain("\u001b[7m");
    expect(plain).toContain("\u001b[1m");
  });

  it("reads NO_COLOR from the environment when no theme is passed", async () => {
    forceTerminal(120, 40, { colorLevel: 1 });
    vi.stubEnv("NO_COLOR", "1");
    try {
      const app = render(<PlayerTui {...makeProps(queue)} options={{}} />);
      await settle();
      expect(app.lastFrame()).not.toContain("\u001b[32m");
      expect(app.lastFrame()).toContain("\u001b[7m");
    } finally { vi.unstubAllEnvs(); }
  });

  it("shows paused, stopped and empty playback in the strip, and errors in place of its hints", async () => {
    forceTerminal(120, 5);
    const props = makeProps();
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    const emit = (data: Partial<PlaybackSnapshot>) => act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "state", data: { ...props.initialSnapshot, ...data } }); });
    await emit({ status: "paused" });
    expect(app.lastFrame()).toContain("‖ Blue Train · John Coltrane");
    await emit({ status: "stopped" });
    expect(app.lastFrame()).toContain("■ Blue Train");
    await emit({ current: null, status: "stopped", error: { code: "MPV_EXITED", message: "mpv quit" } as PlaybackSnapshot["error"] });
    expect(app.lastFrame()).toContain("Nothing playing");
    expect(app.lastFrame()).toContain("MPV_EXITED: mpv quit");
  });

  it("shows the query, playlist count and an error alert in the full window", async () => {
    const props = makeProps();
    const app = render(<PlayerTui {...props} options={{ search: "jazz" }} />);
    await settle();
    expect(app.lastFrame()).toContain("Query: jazz");
    expect(app.lastFrame()).toContain(" / SEARCH ");
    await act(async () => { app.stdin.write("l"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("PLAYLISTS · 1");
    await act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "state", data: { ...props.initialSnapshot, status: "paused", error: { code: "E", message: "device gone" } } }); });
    expect(app.lastFrame()).toContain("E: device gone");
  });

  it("falls back to 80×24 when the terminal reports no size", async () => {
    forceTerminal(0, 0);
    const app = render(<PlayerTui {...makeProps(queue)} options={{}} />);
    await settle();
    expect(app.lastFrame()).toContain("NOW PLAYING");
    expect(app.lastFrame()).toContain("1/3");
  });

  it("names quitting in the remote key line when quit is unbound", async () => {
    const props = makeProps();
    const snapshot = { ...props.initialSnapshot, remote: { player: { id: "room", name: "Room", revision: 1, assigned_output: null, state: { desired_output: null, checkpoint: false } }, connected: true } };
    (props.control.request as ReturnType<typeof vi.fn>).mockResolvedValue(snapshot);
    const app = render(<PlayerTui {...props} initialSnapshot={snapshot as never} options={{ remote: "room" }} keymap={buildKeymap({ "app.quit": [] })} />);
    await settle();
    expect(app.lastFrame()).toMatch(/server audio continues after\s+quitting/);
  });
});

describe("PlayerTui queue view", () => {
  afterEach(() => act(() => cleanup()));
  const settle = () => act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
  const queue = ["One", "Two", "Three", "Four"].map((title, i) => ({ id: `q${i}`, track: { ...track, title, duration_seconds: 200 + i } as Track }));
  const playingSecond = () => {
    const props = makeProps(queue);
    const initialSnapshot = { ...props.initialSnapshot, current: queue[1]! };
    (props.control.request as ReturnType<typeof vi.fn>).mockResolvedValue(initialSnapshot);
    return { ...props, initialSnapshot };
  };
  const emit = (props: ReturnType<typeof makeProps>, data: Partial<PlaybackSnapshot>) =>
    act(async () => { (props.control as unknown as EventEmitter).emit("event", { event: "state", data: { ...props.initialSnapshot, ...data } }); });

  it("opens on the playing entry and returns to it with the queue key", async () => {
    const props = playingSecond();
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    expect(app.lastFrame()).toMatch(/^› {3}2 {2}Two /m);
    expect(app.lastFrame()).toContain("LOCAL · local daemon · 4 in queue · 2/4");
    await act(async () => { app.stdin.write("j"); });
    await act(async () => { app.stdin.write("j"); });
    expect(app.lastFrame()).toMatch(/^▶ {3}2 {2}Two /m);
    await act(async () => { app.stdin.write("u"); });
    expect(app.lastFrame()).toMatch(/^› {3}2 {2}Two /m);
  });

  it("moves the selected entry locally with [ and ], the cursor following it", async () => {
    const props = makeProps(queue);
    const request = props.control.request as ReturnType<typeof vi.fn>;
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    await act(async () => { app.stdin.write("["); });
    expect(request).not.toHaveBeenCalledWith("queue.move", expect.anything());
    await act(async () => { app.stdin.write("]"); });
    expect(request).toHaveBeenCalledWith("queue.move", { id: "q0", to: 1 });
    expect(app.lastFrame()).toContain("2/4");
    for (let i = 0; i < 3; i++) await act(async () => { app.stdin.write("j"); });
    await act(async () => { app.stdin.write("]"); });
    expect(request.mock.calls.filter(([method]) => method === "queue.move")).toHaveLength(1);
  });

  it("keeps the cursor on a row when the queue shrinks under it", async () => {
    const props = makeProps(queue);
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    for (let i = 0; i < 3; i++) await act(async () => { app.stdin.write("j"); });
    expect(app.lastFrame()).toContain("4/4");
    await emit(props, { queue: queue.slice(0, 2) });
    expect(app.lastFrame()).toMatch(/^› {3}2 {2}Two /m);
    expect(app.lastFrame()).toContain("2 in queue · 2/2");
  });

  it("opens the full view with Enter in the strip, and plays the entry with it elsewhere", async () => {
    forceTerminal(120, 5);
    const props = makeProps(queue);
    const fullView = vi.fn(async () => "The full view needs 80×24; enlarge the terminal.");
    const app = render(<PlayerTui {...props} options={{}} fullView={fullView} />);
    await settle();
    expect(app.lastFrame()).toContain("Space pause   n next   p prev   +/- volume   Enter full view");
    await act(async () => { app.stdin.write("\r"); });
    await settle();
    expect(fullView).toHaveBeenCalledOnce();
    expect(props.control.request).not.toHaveBeenCalledWith("play", expect.anything());
    expect(app.lastFrame()).toContain("The full view needs 80×24");
    // Typing a query uses the input hints, not the strip's (the prompt covers them here).
    await act(async () => { app.stdin.write("/"); });
    expect(app.lastFrame()).toContain("Type a query");
    await act(async () => { app.stdin.write("\u001b"); await new Promise((resolve) => setTimeout(resolve, 30)); });
    await act(async () => { resizeTerminal(app.stdout, 120, 40); });
    await act(async () => { app.stdin.write("u"); });
    await act(async () => { app.stdin.write("\r"); });
    expect(props.control.request).toHaveBeenCalledWith("play", { index: 0 });
    expect(fullView).toHaveBeenCalledOnce();
  });

  it("names the remote output and connection in the side pane, with the position on the right", async () => {
    forceTerminal(40, 50);
    const props = playingSecond();
    const snapshot = { ...props.initialSnapshot, remote: { player: { id: "lounge", name: "Lounge", revision: 3, assigned_output: "speaker", state: { desired_output: "speaker", checkpoint: false } }, connected: true } };
    (props.control.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string) => method === "devices" ? [{ id: "speaker", name: "Lounge Room Audio · activity=idle" }] : snapshot);
    const app = render(<PlayerTui {...props} initialSnapshot={snapshot as never} options={{ remote: "lounge" }} />);
    await settle();
    const frame = app.lastFrame()!;
    expect(frame).toContain("PLAY ON Lounge Room Audio");
    expect(frame).toMatch(/^Lounge Room Audio · connected · 4 i… 2\/4$/m);
    expect(frame).toMatch(/^› Two +3:21$/m);
    expect(frame).toMatch(/^ {2}One +3:20$/m);
    props.api.listPlaylists = vi.fn(async () => [{ id: 1, name: "Late night" }, { id: 2, name: "Early" }]) as unknown as GroovenetClient["listPlaylists"];
    await act(async () => { app.stdin.write("l"); await new Promise((resolve) => setImmediate(resolve)); });
    expect(app.lastFrame()).toContain("› Late night");
    expect(app.lastFrame()).toMatch(/^ {2}Early$/m);
  });
});
