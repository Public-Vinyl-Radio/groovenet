import React, { act } from "react";
import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroovenetClient, Playlist, Track } from "@groovenet/client";
import type { PlaybackSnapshot, QueueEntry } from "@groovenet/player";
import type { PlayerController } from "./remotePlayer.js";
import { PlayerTui } from "./playerTui.js";
import { PlaylistsView, playlistHints, playlistRow, playlistTrackRow } from "./playerTuiPlaylists.js";
import { playlistDate, playlistDuration, playlistGroups, queuePlaylist, usePlayerPlaylists, type PlayerPlaylists } from "./playerTuiPlaylistsState.js";
import { buildKeymap, defaultKeymap } from "./playerKeymap.js";
import { forceTerminal, resizeTerminal } from "../tui/testing.js";
import { displayWidth } from "../tui/text.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const track = { track_id: "t1", friend_id: 2, title: "La Borrachita", artist: "Junior Y Su Equipo", local_audio_url: "cumbia.flac", bpm: 98, key: "A minor" } as Track;
const tracks = Array.from({ length: 28 }, (_, index) => ({ ...track, track_id: `t${index}`, title: `Cumbia ${index}` }));
const refs = tracks.map(({ track_id, friend_id }, position) => ({ track_id, friend_id, position }));
const playlist: Playlist = { id: 1, name: "Cumbia Hi-Energy", created_at: "2026-10-20T12:00:00Z", total_duration_seconds: 3598, tracks: refs };
const liveSet: Playlist = { ...playlist, id: 2, name: "Inner Signals", created_at: "2025-01-01T12:00:00Z", set: { id: 1, title: "Inner Signals", last_performed_at: "2026-08-20T12:00:00Z", status: "performed", collaborators: [], cover_image_url: null, venue_name: null, location_city: null } };
const tick = async () => { await act(async () => { await new Promise((resolve) => setImmediate(resolve)); }); };
async function key(app: ReturnType<typeof render>, input: string) { await act(async () => { app.stdin.write(input); await new Promise((resolve) => setTimeout(resolve, input === "\u001b" ? 30 : 0)); }); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  let queue: QueueEntry[] = [{ id: "old", track }];
  let status = "playing" as PlaybackSnapshot["status"];
  const snapshot = (): PlaybackSnapshot => ({ status, current: queue[0] ?? null, queue: [...queue], position: 44, duration: 166, volume: 77, error: null });
  const control = new EventEmitter() as EventEmitter & { request: ReturnType<typeof vi.fn> };
  let counter = 0;
  control.request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
    if (method === "queue.list") return [...queue];
    if (method === "devices") return [];
    if (method === "stop") status = "stopped";
    if (method === "play") status = "playing";
    if (method === "queue.remove") queue = queue.filter((entry) => entry.id !== params!.id);
    if (method === "queue.addTrack") queue.push({ id: `new-${counter++}`, track: params!.track as Track });
    if (method === "queue.add") queue.push(...tracks.map((track) => ({ id: `new-${counter++}`, track })));
    if (method === "queue.replace") queue = tracks.map((track) => ({ id: `new-${counter++}`, track }));
    return snapshot();
  });
  const api = {
    listPlaylists: vi.fn(async (): Promise<Playlist[]> => [liveSet, playlist]),
    getPlaylistTracks: vi.fn(async () => ({ track_refs: refs })),
    batchGetTracks: vi.fn(async () => [...tracks].reverse()), // batch order is not playlist order
  };
  const props = { control: control as unknown as PlayerController, api: api as unknown as GroovenetClient, initialSnapshot: snapshot(), options: {} };
  return { props, api, control, snapshot };
}
async function open(f: ReturnType<typeof fixture>) {
  const app = render(<PlayerTui {...f.props} />); await tick(); await key(app, "l"); await tick(); return app;
}
beforeEach(() => forceTerminal(120, 40));
afterEach(() => act(() => cleanup()));

describe("playlist data and controls", () => {
  it("groups/filter names by performance then creation date, newest first, undated last", () => {
    const bad = { ...playlist, id: 3, created_at: "bad" };
    const missing = { ...bad, created_at: "" };
    expect(playlistDate(bad)).toBeNull(); expect(playlistDate(missing)).toBeNull();
    expect(playlistDate(liveSet)?.getFullYear()).toBe(2026);
    expect(playlistDate({ ...liveSet, set: { ...liveSet.set!, last_performed_at: null } })?.getFullYear()).toBe(2025);
    const groups = playlistGroups([bad, liveSet, playlist, missing], "  ");
    expect(groups.map((group) => group.label)).toEqual(["OCT 2026", "AUG 2026", "UNDATED"]);
    expect(groups[2].playlists).toEqual([bad, missing]);
    expect(playlistGroups([playlist, liveSet], "INNER")[0].playlists).toEqual([liveSet]);
    expect(playlistGroups([playlist], "missing")).toEqual([]);
    expect(playlistDuration(playlist)).toBe("59:58");
    expect(playlistDuration({ ...playlist, total_duration_seconds: undefined })).toBe("--:--");
    expect(playlistDuration({ ...playlist, total_duration_seconds: 0 })).toBe("0:00");
  });

  it("formats SET and selection roles and measured track columns including missing analysis", () => {
    expect(playlistRow(liveSet, false, 60)[1]).toMatchObject({ text: " SET", role: "reverse" });
    expect(playlistRow(playlist, true, 60).every((part) => part.role === "selection")).toBe(true);
    const row = playlistTrackRow(track, 1, false, 60);
    expect(row[0].text).toMatch(/2 .*La Borrachita.*Junior.*98.*8A/);
    expect(playlistTrackRow(null, 0, false, 60)[0].text).toMatch(/#.*TITLE.*ARTIST.*BPM.*KEY/);
    expect(playlistTrackRow({ ...track, bpm: null, key: null } as Track, 0, true, 48)[0]).toMatchObject({ role: "selection", text: expect.stringMatching(/---.*---/) });
    expect(displayWidth(playlistTrackRow({ ...track, title: "世界🎵".repeat(40) }, 0, false, 60)[0].text)).toBeLessThanOrEqual(60);
  });

  it.each([false, true])("enqueues without stop, replace or play (remote=%s)", async (remote) => {
    const f = fixture();
    await queuePlaylist(f.props.control, playlist, tracks, false, remote);
    expect(f.control.request.mock.calls).toEqual([["queue.add", { playlistId: "1" }]]);
    expect(f.snapshot().queue).toHaveLength(29); expect(f.snapshot().status).toBe("playing");
  });

  it("replaces the local queue using supported commands, retaining track order", async () => {
    const f = fixture();
    await queuePlaylist(f.props.control, playlist, tracks.slice(0, 2), true, false);
    expect(f.control.request.mock.calls).toEqual([["queue.list"], ["stop"], ["queue.remove", { id: "old" }], ["queue.addTrack", { track: tracks[0] }], ["queue.addTrack", { track: tracks[1] }], ["play", { index: 0 }]]);
    expect(f.snapshot().queue.map((entry) => entry.track)).toEqual(tracks.slice(0, 2));
  });

  it.each(["queue.list", "stop", "queue.remove", "queue.addTrack", "play"])("halts local replacement when %s fails", async (failed) => {
    const f = fixture();
    const implementation = f.control.request.getMockImplementation()! as (method: string, params?: Record<string, unknown>) => Promise<unknown>;
    f.control.request.mockImplementation(async (method: string, params?: Record<string, unknown>) => { if (method === failed) throw new Error("local failure"); return implementation(method, params); });
    await expect(queuePlaylist(f.props.control, playlist, tracks, true, false)).rejects.toThrow("local failure");
    expect(f.control.request.mock.calls.at(-1)?.[0]).toBe(failed);
  });

  it("uses a single remote replace, omits acknowledgements and refuses empty playlists", async () => {
    const f = fixture();
    await queuePlaylist(f.props.control, playlist, tracks.slice(0, 2), true, true);
    expect(f.control.request.mock.calls).toEqual([["queue.replace", { entries: refs.slice(0, 2).map(({ track_id, friend_id }) => ({ track_id, friend_id })), play: true }]]);
    f.control.request.mockClear();
    await expect(queuePlaylist(f.props.control, playlist, [], true, false)).rejects.toThrow("No tracks");
    expect(f.control.request).not.toHaveBeenCalled();
  });
});

describe("playlist TUI", () => {
  it("previews metadata/ordered tracks, opens the full table and goes back preserving selection/filter", async () => {
    const f = fixture(); const app = await open(f);
    expect(app.lastFrame()).toContain("OCT 2026"); expect(app.lastFrame()).toContain("AUG 2026");
    expect(app.lastFrame()).toContain("SET");
    expect(app.lastFrame()).toMatch(/28 tracks · 59:58 · Oct 20, 2026/);
    expect(app.lastFrame()).toContain("Enter PLAY"); expect(app.lastFrame()).toContain("a ENQUEUE"); expect(app.lastFrame()).toContain("→ OPEN");
    expect(app.lastFrame()).toMatch(/1 Cumbia 0.*Junior.*98.*8A/);
    expect(app.lastFrame()).toMatchSnapshot("full playlists 120x40");
    await key(app, "/"); await key(app, "i"); await key(app, "\r");
    await key(app, "j"); expect(app.lastFrame()).toContain("2/2");
    await key(app, "\u001b[C");
    expect(app.lastFrame()).toContain("Inner Signals"); expect(app.lastFrame()).toContain("1/28");
    for (let i = 0; i < 27; i++) await key(app, "j");
    expect(app.lastFrame()).toContain("28/28"); expect(app.lastFrame()).toContain("Cumbia 27");
    await key(app, "\u001b");
    expect(app.lastFrame()).toContain("2/2"); expect(app.lastFrame()).toContain(" / i");
    await key(app, "u"); await key(app, "l");
    expect(app.lastFrame()).toContain("2/2"); expect(app.lastFrame()).toContain(" / i");
  });

  it("types printable keys, focuses results with arrows, edits and clears without playback", async () => {
    const f = fixture(); const app = await open(f);
    await key(app, "/"); await key(app, "qna /世界");
    expect(app.lastFrame()).toContain("qna /世界▏"); expect(app.lastFrame()).toContain("No playlists match");
    expect(f.control.request.mock.calls.every(([method]) => method === "status")).toBe(true);
    await key(app, "\u007f"); expect(app.lastFrame()).toContain("qna /世▏");
    await key(app, "\u001b[A"); expect(app.lastFrame()).not.toContain("▏");
    await key(app, "\u001b"); expect(app.lastFrame()).toContain("Cumbia Hi-Energy");
    await key(app, "/"); await key(app, "\u001b[B"); expect(app.lastFrame()).not.toContain("▏");
    await key(app, "/"); await key(app, "\u001b"); expect(app.lastFrame()).not.toContain("▏");
    for (const arrow of ["\u001b[C", "\u001b[D"]) { await key(app, "/"); await key(app, arrow); expect(app.lastFrame()).not.toContain("▏"); }
  });

  it("uses custom filter/input/open/back/action bindings and their hints", async () => {
    const f = fixture();
    const keymap = buildKeymap({ "playlists.filter": "f", "nav.open": "ctrl+o", "input.submit": "ctrl+e", "input.cancel": "ctrl+b", "queue.add": "z", "list.select": "ctrl+y", "view.search": "ctrl+f" });
    expect(keymap.problems).toEqual([]);
    const app = render(<PlayerTui {...f.props} keymap={keymap} />); await tick(); await key(app, "l"); await tick();
    expect(app.lastFrame()).toContain("f filter"); expect(app.lastFrame()).toContain("^O OPEN");
    await key(app, "f"); await key(app, "Inner"); await key(app, "\u0005");
    expect(app.lastFrame()).toContain("1/1");
    await key(app, "\u000f"); expect(app.lastFrame()).toContain("1/28");
    await key(app, "\u0002"); expect(app.lastFrame()).toContain("1/1");
    await key(app, "z"); expect(f.control.request).toHaveBeenCalledWith("queue.add", { playlistId: "2" });
    await key(app, "\u0019"); expect(f.control.request).toHaveBeenCalledWith("play", { index: 0 });
    await key(app, "\u0006"); expect(app.lastFrame()).toContain("FIND");
  });

  it.each([false, true])("plays a playlist and enqueues in place (remote=%s)", async (remote) => {
    const f = fixture(); f.props.options = remote ? { remote: "room" } : {};
    const app = await open(f); f.control.request.mockClear();
    await key(app, "a"); expect(app.lastFrame()).toContain("Added 28 tracks to queue.");
    expect(f.control.request.mock.calls).toEqual([["queue.add", { playlistId: "1" }], ["status"]]);
    await key(app, "\r"); expect(app.lastFrame()).toContain("Playing Cumbia Hi-Energy");
    expect(f.snapshot().queue).toHaveLength(28);
    expect(f.control.request).toHaveBeenCalledWith(remote ? "queue.replace" : "play", remote ? { entries: refs.map(({ track_id, friend_id }) => ({ track_id, friend_id })), play: true } : { index: 0 });
  });

  it.each(["AVAILABILITY_UNKNOWN", "SPEAKER_OCCUPIED", "REVISION_CONFLICT", "Remote player is disconnected"])("reports %s without fallback or automatic acknowledgement", async (reason) => {
    const f = fixture(); f.props.options = { remote: "room" };
    const app = await open(f); const before = f.snapshot();
    f.control.request.mockRejectedValueOnce(new Error(reason));
    await key(app, "\r");
    expect(app.lastFrame()).toContain(reason); expect(f.snapshot()).toEqual(before);
    expect(f.control.request).not.toHaveBeenCalledWith("play", expect.anything());
    expect(f.control.request).not.toHaveBeenCalledWith("queue.add", expect.anything());
  });

  it("handles loading, detail errors, missing tracks and empty playlists without mutating the queue", async () => {
    const f = fixture(); const pending = deferred<{ track_refs: typeof refs }>();
    f.api.getPlaylistTracks.mockReturnValueOnce(pending.promise);
    const app = await open(f); expect(app.lastFrame()).toContain("Loading playlist…");
    await key(app, "\r"); expect(app.lastFrame()).toContain("Loading playlist…");
    await key(app, "\u001b[C"); expect(app.lastFrame()).toContain("Loading playlist…");
    await act(async () => pending.reject("Track lookup failed"));
    expect(app.lastFrame()).toContain("Track lookup failed");
    await key(app, "a"); expect(app.lastFrame()).toContain("Track lookup failed");
    await key(app, "\u001b");
    f.api.batchGetTracks.mockResolvedValueOnce([]);
    await key(app, "j"); await tick();
    expect(app.lastFrame()).toContain("Playlist contains unavailable tracks");
    await key(app, "a"); expect(app.lastFrame()).toContain("Playlist contains unavailable tracks");
    f.api.getPlaylistTracks.mockResolvedValueOnce({ track_refs: [] });
    await key(app, "k"); await tick(); expect(app.lastFrame()).toContain("No tracks in this playlist.");
    await key(app, "\r"); expect(app.lastFrame()).toContain("No tracks in this playlist.");
    expect(f.control.request.mock.calls.every(([method]) => method === "status")).toBe(true);
  });

  it("handles list loading, errors and empty state, and retries after re-entering", async () => {
    const f = fixture(); const pending = deferred<Playlist[]>(); f.api.listPlaylists.mockReturnValueOnce(pending.promise);
    const app = await open(f); expect(app.lastFrame()).toContain("Loading playlists…");
    await key(app, "\r"); await key(app, "a"); await key(app, "\u001b[C");
    await act(async () => pending.reject(new Error("Playlist service unavailable")));
    expect(app.lastFrame()).toContain("Playlist service unavailable");
    await key(app, "a");
    f.api.listPlaylists.mockResolvedValueOnce([]);
    await key(app, "u"); await key(app, "l"); expect(app.lastFrame()).toContain("No playlists.");
    await key(app, "\r");
    await key(app, "u"); await key(app, "l"); expect(app.lastFrame()).toContain("Cumbia Hi-Energy");
  });

  it.each([false, true])("ignores stale list success/failure (failure=%s)", async (failure) => {
    const f = fixture(); const pending = deferred<Playlist[]>(); f.api.listPlaylists.mockReturnValueOnce(pending.promise);
    const app = await open(f); await key(app, "u"); await key(app, "l");
    await act(async () => { if (failure) pending.reject("Stale error"); else pending.resolve([]); });
    expect(app.lastFrame()).toContain("Cumbia Hi-Energy"); expect(app.lastFrame()).not.toContain("Stale error");
  });

  it.each([false, true])("ignores stale detail success/failure (failure=%s)", async (failure) => {
    const f = fixture(); const pending = deferred<Track[]>(); f.api.batchGetTracks.mockReturnValueOnce(pending.promise);
    const app = await open(f); await key(app, "j"); await tick();
    await act(async () => { if (failure) pending.reject("Stale detail"); else pending.resolve(tracks.map((track) => ({ ...track, title: "Stale track" }))); });
    expect(app.lastFrame()).toContain("Cumbia 0"); expect(app.lastFrame()).not.toContain("Stale");
  });

  it("fences repeated commands and ignores old action notices after navigation", async () => {
    const f = fixture(); const app = await open(f); const pending = deferred<unknown>();
    f.control.request.mockReturnValueOnce(pending.promise);
    await key(app, "a"); expect(app.lastFrame()).toContain("Updating queue…");
    await key(app, "a"); expect(f.control.request.mock.calls.filter(([method]) => method === "queue.add")).toHaveLength(1);
    await key(app, "j"); await act(async () => pending.resolve(f.snapshot()));
    expect(app.lastFrame()).not.toContain("Added 28 tracks");
    const failed = deferred<unknown>(); f.control.request.mockReturnValueOnce(failed.promise);
    await key(app, "a"); await key(app, "u"); await act(async () => failed.reject("Old action failure"));
    await key(app, "l"); expect(app.lastFrame()).not.toContain("Old action failure");
  });

  it("resizes across full, short, side, strip and back without overflow or losing filter/selection", async () => {
    const f = fixture(); const app = await open(f);
    await key(app, "/"); await key(app, "i"); await key(app, "\r"); await key(app, "j");
    for (const [columns, rows] of [[80, 24], [40, 50], [32, 30], [120, 5], [30, 10], [120, 40]]) {
      await act(async () => resizeTerminal(app.stdout as unknown as NodeJS.EventEmitter, columns, rows)); await tick();
      const lines = app.lastFrame()!.split("\n");
      expect(lines.length).toBeLessThanOrEqual(rows);
      for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(columns);
      if (columns === 40) expect(app.lastFrame()).toMatchSnapshot("side playlists 40x50");
      if (columns === 80) expect(app.lastFrame()).toMatchSnapshot("short playlists 80x24");
    }
    expect(app.lastFrame()).toContain("2/2"); expect(app.lastFrame()).toContain(" / i");
    await key(app, "\u001b[C");
    await act(async () => resizeTerminal(app.stdout as unknown as NodeJS.EventEmitter, 32, 30));
    expect(app.lastFrame()).toContain("Cumbia 0");
    await key(app, "j"); expect(app.lastFrame()).toContain("Cumbia 1");
    await key(app, "k");
    await act(async () => resizeTerminal(app.stdout as unknown as NodeJS.EventEmitter, 120, 5));
    const fullView = vi.fn(async () => "Resize to see playlists.");
    app.rerender(<PlayerTui {...f.props} fullView={fullView} />); await tick();
    await key(app, "\r"); expect(fullView).toHaveBeenCalledOnce();
  });

  it("keeps the selected playlist visible when scrolling through month headers", async () => {
    forceTerminal(40, 30);
    const f = fixture(); f.api.listPlaylists.mockResolvedValue(Array.from({ length: 50 }, (_, id) => ({ ...playlist, id, name: `Playlist ${id}` })));
    const app = await open(f);
    for (let i = 0; i < 49; i++) await key(app, "j");
    expect(app.lastFrame()).toContain("› Playlist 49"); expect(app.lastFrame()).toContain("OCT 2026"); expect(app.lastFrame()).toContain("50/50");
    await key(app, "/"); await key(app, "Playlist 0"); await key(app, "\r"); expect(app.lastFrame()).toContain("1/1");
  });
});


describe("playlist constrained rendering", () => {
  async function stateFixture() {
    const f = fixture();
    let state!: PlayerPlaylists;
    function State() { state = usePlayerPlaylists(f.props.api, true, async () => {}); return null; }
    const app = render(<State />); await tick();
    return { state, app };
  }

  it("renders zero/one-row slots, table headers without room for tracks, and missing analysis in compact tracks", async () => {
    const { state } = await stateFixture();
    for (const [width, rows, editing, opened] of [[80, 0, false, false], [80, 1, true, false], [80, 1, false, true], [80, 2, false, true], [32, 2, false, true], [32, 6, false, true]] as const) {
      const app = render(<PlaylistsView state={{ ...state, editing, opened, tracks: [{ ...track, bpm: null, key: null } as Track] }} area={{ width, rows }} keymap={defaultKeymap} />);
      await tick();
      if (width === 32 && rows === 6) expect(app.lastFrame()).toContain("--- · ---");
      expect(app.lastFrame()!.split("\n").filter(Boolean).length).toBeLessThanOrEqual(rows);
      for (const line of app.lastFrame()!.split("\n")) expect(displayWidth(line)).toBeLessThanOrEqual(width);
    }
  });

  it("shows undated preview and hides unbound action hints/labels", async () => {
    const { state } = await stateFixture();
    const keymap = buildKeymap({ "list.select": [], "queue.add": [], "nav.open": [], "list.up": [], "list.down": [], "playlists.filter": [], "input.cancel": [], "app.help": [] });
    expect(playlistHints(state, keymap)).toEqual([]);
    const app = render(<PlaylistsView state={{ ...state, playlist: { ...playlist, created_at: "bad" } }} area={{ width: 120, rows: 20 }} keymap={keymap} />); await tick();
    expect(app.lastFrame()).toContain("Undated"); expect(app.lastFrame()).not.toContain("PLAY "); expect(app.lastFrame()).not.toContain("ENQUEUE");
  });

  it("clamps an opened table when refreshed tracks shrink, and handles a removed opened playlist", async () => {
    const f = fixture(); const app = await open(f);
    await key(app, "\u001b[C");
    for (let i = 0; i < 27; i++) await key(app, "j");
    f.api.getPlaylistTracks.mockResolvedValueOnce({ track_refs: refs.slice(0, 1) });
    await key(app, "u"); await key(app, "l"); await tick();
    expect(app.lastFrame()).toContain("1/1");
    f.api.listPlaylists.mockResolvedValueOnce([]);
    await key(app, "u"); await key(app, "l");
    expect(app.lastFrame()).toContain("No playlists.");
  });

  it("plays and enqueues the whole playlist from its full tracklist", async () => {
    const f = fixture(); const app = await open(f);
    await key(app, "\u001b[C"); await key(app, "j"); await key(app, "a");
    expect(f.control.request).toHaveBeenCalledWith("queue.add", { playlistId: "1" });
    await key(app, "\r");
    expect(f.snapshot().queue.map((entry) => entry.track)).toEqual(tracks);
  });
});


it("shows idle playback in the compact playlist header", async () => {
  const f = fixture(); const idle = { ...f.props.initialSnapshot, current: null, queue: [] };
  f.control.request.mockResolvedValue(idle);
  const app = render(<PlayerTui {...f.props} initialSnapshot={idle} />); await tick(); await key(app, "l"); await tick();
  expect(app.lastFrame()).toContain("Nothing playing");
});
