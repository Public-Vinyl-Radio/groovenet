import React, { act } from "react";
import { EventEmitter } from "node:events";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Album, AlbumDetail, AlbumSearchResponse, GroovenetClient, Track, TrackSearchResponse } from "@groovenet/client";
import type { PlayerControlClient, PlaybackSnapshot } from "@groovenet/player";
import { PlayerTui } from "./playerTui.js";
import { buildKeymap, defaultKeymap } from "./playerKeymap.js";
import {
  albumKey, AlbumPreview, dataOf, nextSearchMode, SEARCH_DEBOUNCE_MS, searchHints, searchKeys, searchStatus, SearchView, trackAlbumRef,
  type Loadable, type SearchViewProps,
} from "./playerTuiSearch.js";
import { forceTerminal, resizeTerminal } from "../tui/testing.js";
import { makeTheme, ThemeContext } from "../tui/theme.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => { forceTerminal(120, 40); });
afterEach(() => act(() => cleanup()));

function makeTrack(i: number, extra: Partial<Track> = {}): Track {
  return {
    track_id: `t${i}`, friend_id: 1, title: `Cumbia ${i}`, artist: "Los Demonios Del Mantaro", album: "Cumbia Vol. 1", release_id: "r1",
    position: `A${i + 1}`, duration_seconds: 200 + i, bpm: 96, key: "A minor", local_audio_url: `a${i}.flac`, ...extra,
  } as Track;
}

function makeAlbum(i: number, extra: Partial<Album> = {}): Album {
  return { release_id: `r${i}`, friend_id: 1, title: `Cumbia Vol. ${i}`, artist: "Various", year: 2020 + i, library_identifier: `LP-0${30 + i}`, track_count: 12, label: "Vampi Soul", ...extra } as Album;
}

const tracksOf = (list: Track[], extra: Partial<TrackSearchResponse> = {}): Loadable<TrackSearchResponse> =>
  ({ status: "ready", data: { tracks: list, estimatedTotalHits: list.length, offset: 0, limit: 30, processingTimeMs: 1, ...extra } });
const albumsOf = (list: Album[]): Loadable<AlbumSearchResponse> =>
  ({ status: "ready", data: { hits: list, estimatedTotalHits: list.length, offset: 0, limit: 30, query: "", sort: "" } });
const detailOf = (album: Album, tracks: Track[]): Loadable<AlbumDetail> => ({ status: "ready", data: { album, tracks } as AlbumDetail });

function view(overrides: Partial<SearchViewProps> = {}) {
  const props: SearchViewProps = {
    area: { width: 120, rows: 21 }, kind: "full", keys: searchKeys(defaultKeymap), query: "cumbia", editing: false, mode: "lexical",
    scope: "tracks", tracks: tracksOf([makeTrack(0), makeTrack(1)]), albums: albumsOf([makeAlbum(0), makeAlbum(1)]), selected: 0,
    openAlbum: null, details: {}, ...overrides,
  };
  return render(<SearchView {...props} />).lastFrame()!;
}

describe("search helpers", () => {
  it("cycles keyword, semantic and hybrid", () => {
    expect(nextSearchMode("lexical")).toBe("semantic");
    expect(nextSearchMode("semantic")).toBe("hybrid");
    expect(nextSearchMode("hybrid")).toBe("lexical");
  });

  it("reads data from a loadable, and keys albums by friend and release", () => {
    expect(dataOf<number>({ status: "idle" })).toBeUndefined();
    expect(dataOf<number>({ status: "error", error: "x" })).toBeUndefined();
    expect(dataOf<number>({ status: "loading", data: 1 })).toBe(1);
    expect(dataOf<number>(undefined)).toBeUndefined();
    expect(albumKey({ release_id: "r1", friend_id: 2 })).toBe("2:r1");
  });

  it("finds a track's album only when it has a release", () => {
    expect(trackAlbumRef(makeTrack(0))).toEqual({ release_id: "r1", friend_id: 1, title: "Cumbia Vol. 1", artist: "Los Demonios Del Mantaro" });
    expect(trackAlbumRef(makeTrack(0, { release_id: null }))).toBeNull();
  });

  it("labels the hints by scope, from the active keymap", () => {
    const hints = (options: Partial<Parameters<typeof searchHints>[1]>) => searchHints(defaultKeymap, { editing: false, scope: "tracks", albumOpen: false, remote: false, omit: [], ...options });
    expect(hints({}).slice(0, 6)).toEqual([
      { keys: "↑/↓", label: "select" }, { keys: "Enter", label: "play" }, { keys: "a", label: "add to queue" },
      { keys: "→", label: "open" }, { keys: "Tab", label: "albums" }, { keys: "Esc", label: "clear" },
    ]);
    expect(hints({ scope: "albums" }).slice(1, 5).map((hint) => hint.label)).toEqual(["play album", "add all", "open", "tracks"]);
    expect(hints({ scope: "albums", albumOpen: true }).map((hint) => hint.label)).toEqual(expect.arrayContaining(["play", "add to queue", "tracks", "back"]));
    expect(hints({ albumOpen: true }).map((hint) => hint.label)).not.toContain("open");
    expect(hints({ editing: true }).slice(0, 4)).toEqual([{ keys: "Enter", label: "results" }, { keys: "Esc", label: "done" }, { keys: "Tab", label: "albums" }, { keys: "S-Tab", label: "mode" }]);
    // The view's other hints follow, without repeating these.
    expect(hints({}).map((hint) => hint.label)).toContain("pause");
    // An unbound action drops its hint.
    expect(searchHints(buildKeymap({ "search.back": [] }), { editing: false, scope: "tracks", albumOpen: false, remote: false, omit: [] }).map((hint) => hint.label)).not.toContain("clear");
  });

  it("summarises the results in the status line", () => {
    const base = { scope: "tracks" as const, mode: "lexical" as const, tracks: tracksOf([makeTrack(0)]), albums: albumsOf([]) };
    const text = (overrides: Partial<Parameters<typeof searchStatus>[0]>) => searchStatus({ ...base, ...overrides }).map((segment) => segment.text).join("");
    expect(text({})).toBe("SEARCH · keyword · 1 track");
    expect(text({ mode: "semantic", tracks: tracksOf([makeTrack(0), makeTrack(1)], { estimatedTotalHits: 400 }) })).toBe("SEARCH · semantic · 2 of 400 tracks");
    expect(text({ mode: "hybrid", tracks: tracksOf([makeTrack(0)], { degraded: true }) })).toBe("SEARCH · hybrid · 1 track · semantic unavailable, keyword results");
    expect(text({ tracks: { status: "loading" } })).toBe("SEARCH · keyword · searching…");
    expect(text({ scope: "albums", mode: "semantic", albums: albumsOf([makeAlbum(0)]) })).toBe("SEARCH · keyword · 1 album");
    expect(text({ scope: "albums", albums: albumsOf([makeAlbum(0), makeAlbum(1)]) })).toBe("SEARCH · keyword · 2 albums");
    expect(text({ albumOpen: true, album: detailOf(makeAlbum(0), [makeTrack(0)]) })).toBe("SEARCH · album · 1 track");
    expect(text({ albumOpen: true })).toBe("SEARCH · album");
    expect(text({ selectedTrack: makeTrack(0, { local_audio_url: null }) })).toBe("SEARCH · keyword · 1 track · selected: no downloaded audio");
    expect(text({ selectedTrack: makeTrack(0) })).toBe("SEARCH · keyword · 1 track");
  });
});

describe("SearchView", () => {
  it("draws the tracks board: FIND box, scope tabs, columns and the selected row", () => {
    const frame = view({ editing: true, tracks: tracksOf([makeTrack(0), makeTrack(1, { bpm: null, key: null, duration_seconds: null })]) });
    expect(frame).toMatchSnapshot();
    expect(frame).toMatch(/┃ \/ cumbia█\s+KEYWORD {3}S-Tab mode ┃▐$/m);
    expect(frame).toContain(" TRACKS · 2   ALBUMS · 2   Tab tracks / albums");
    expect(frame).toMatch(/^ {2}TITLE\s+ARTIST\s+TIME {3}BPM {2}KEY$/m);
    expect(frame).toMatch(/^› Cumbia 0\s+Los Demonios Del Mantaro\s+3:20\s+96 {2}8A$/m);
    expect(frame).toMatch(/^ {2}Cumbia 1\s+Los Demonios Del Mantaro\s+-:--\s+-- {2}--$/m);
  });

  it("draws albums as two-line rows with the preview panel", () => {
    const albums = [makeAlbum(0), makeAlbum(1)];
    const tracks = Array.from({ length: 12 }, (_, i) => makeTrack(i));
    const frame = view({ scope: "albums", albums: albumsOf(albums), selected: 1, details: { [albumKey(albums[1]!)]: detailOf(albums[1]!, tracks) } });
    expect(frame).toMatchSnapshot();
    expect(frame).toMatch(/^› Cumbia Vol\. 1\s+Various\s+2021\s+┃/m);
    expect(frame).toMatch(/^ {4}LP-031 · 12 tracks\s+┃/m);
    expect(frame).toContain("┏━ LP-031 ━");
    expect(frame).toContain("Vampi Soul · 2021");
    expect(frame).toContain(" Enter PLAY   a ADD ALL ");
    expect(frame).toMatch(/A1 {2}Cumbia 0\s+3:20/);
    expect(frame).toMatch(/… 10 more · → open album/);
  });

  it("shows the preview's loading, error and empty tracklists", () => {
    const album = makeAlbum(0);
    const key = albumKey(album);
    const props = { scope: "albums" as const, albums: albumsOf([album]) };
    expect(view(props)).toContain("Loading tracklist…");
    expect(view({ ...props, details: { [key]: { status: "error", error: "502 Bad Gateway" } } })).toContain("Tracklist unavailable: 502 Bad Gateway");
    expect(view({ ...props, details: { [key]: detailOf(album, []) } })).toContain("No tracks.");
    const odd = view({ ...props, details: { [key]: detailOf(album, [makeTrack(0, { position: undefined, local_audio_url: null, duration_seconds: null, title: "Untimed" })]) } });
    expect(odd).toMatch(/┃ {6}Untimed\s+-:-- {2}┃/);
    // Every track fits: no "more" line.
    expect(view({ ...props, details: { [key]: detailOf(album, [makeTrack(0)]) } })).not.toContain("more");
  });

  it("leaves out album fields that are missing", () => {
    const album = makeAlbum(0, { library_identifier: null, track_count: undefined, year: null, label: null });
    const frame = view({ scope: "albums", albums: albumsOf([album]) });
    expect(frame).toContain("┏━ ALBUM ━");
    expect(frame).toMatch(/^› Cumbia Vol\. 0\s+Various\s+┃/m);
    expect(view({ scope: "albums", albums: albumsOf([makeAlbum(0, { year: "" })]) })).toMatch(/^› Cumbia Vol\. 0\s+Various\s+┃/m);
  });

  it("drops the preview where it does not fit", () => {
    expect(view({ scope: "albums", area: { width: 90, rows: 21 } })).not.toContain("TRACKLIST");
    expect(view({ scope: "albums", area: { width: 120, rows: 12 } })).not.toContain("TRACKLIST");
  });

  it("collapses to one-line FIND and two-line rows in the side pane", () => {
    const frame = view({ kind: "side", area: { width: 40, rows: 23 } });
    expect(frame).toMatchSnapshot();
    expect(frame).toMatch(/^ FIND {2}\/ cumbia\s+KEYWORD$/m);
    expect(frame).toContain("Tab scope");
    expect(frame).toMatch(/^› Cumbia 0\s+3:20$/m);
    expect(frame).toMatch(/^ {4}Los Demonios Del Mantaro$/m);
    expect(frame).not.toContain("TITLE");
    expect(view({ kind: "side", area: { width: 40, rows: 23 }, tracks: tracksOf([makeTrack(0, { local_audio_url: null, duration_seconds: null })]) })).toMatch(/^› Cumbia 0\s+-:--$/m);
    const albums = view({ kind: "side", area: { width: 40, rows: 23 }, scope: "albums", albums: albumsOf([makeAlbum(0, { library_identifier: null })]) });
    expect(albums).toMatch(/^› Cumbia Vol\. 0\s+2020$/m);
    expect(albums).toMatch(/^ {4}Various · 12 tracks$/m);
  });

  it("uses the one-line FIND in a short full window", () => {
    const frame = view({ area: { width: 80, rows: 5 } });
    expect(frame).toMatch(/^ FIND {2}\/ cumbia/m);
    expect(frame).not.toContain("┏━ FIND");
    expect(frame).not.toContain("TITLE");
  });

  it("shows the empty, loading, error and no-match states", () => {
    expect(view({ query: "" })).toContain("Type to search tracks (/).");
    expect(view({ query: "  ", editing: true, scope: "albums" })).toContain("Type to search albums.");
    expect(view({ query: "" })).toContain("/ type to search");
    expect(view({ tracks: { status: "loading" } })).toContain("Searching…");
    expect(view({ tracks: { status: "loading" } })).toContain("TRACKS · …");
    // A query in flight keeps the last results on screen.
    expect(view({ tracks: { status: "loading", data: dataOf(tracksOf([makeTrack(0)])) } })).toContain("Cumbia 0");
    expect(view({ tracks: { status: "error", error: "API key rejected" } })).toContain("Search failed: API key rejected");
    expect(view({ tracks: tracksOf([]) })).toContain("No tracks match “cumbia”.");
    expect(view({ scope: "albums", albums: albumsOf([]) })).toContain("No albums match “cumbia”.");
    expect(view({ tracks: { status: "idle" } })).toContain(" TRACKS   ALBUMS · 2 ");
    expect(view({ area: { width: 120, rows: 2 } })).not.toContain("Cumbia 0");
  });

  it("draws an open album's whole tracklist, with positions", () => {
    const album = makeAlbum(1);
    const openAlbum = { release_id: "r1", friend_id: 1, title: "Cumbia Vol. 1", artist: "Various" };
    const tracks = [makeTrack(0), makeTrack(1, { position: undefined })];
    const frame = view({ openAlbum, details: { [albumKey(openAlbum)]: detailOf(album, tracks) } });
    expect(frame).toMatchSnapshot();
    expect(frame).toContain("Cumbia Vol. 1 · Various · Vampi Soul · 2021 · 2 tracks");
    expect(frame).not.toContain("TRACKS ·");
    expect(frame).toMatch(/^ {2}POS TITLE/m);
    expect(frame).toMatch(/^› A1 {2}Cumbia 0/m);
    expect(view({ openAlbum, kind: "side", area: { width: 40, rows: 23 }, details: { [albumKey(openAlbum)]: detailOf(album, tracks) } })).toMatch(/^› A1 Cumbia 0\s+3:20$/m);
    expect(view({ openAlbum, kind: "side", area: { width: 40, rows: 23 }, details: { [albumKey(openAlbum)]: detailOf(album, tracks) } })).toMatch(/^ {2}Cumbia 1\s+3:21$/m);
    expect(view({ openAlbum })).toContain("Cumbia Vol. 1 · Various");
    expect(view({ openAlbum })).toContain("Loading tracklist…");
    expect(view({ openAlbum, details: { [albumKey(openAlbum)]: { status: "error", error: "gone" } } })).toContain("Album unavailable: gone");
    expect(view({ openAlbum, details: { [albumKey(openAlbum)]: detailOf(makeAlbum(1, { label: null, year: null }), []) } })).toContain("No tracks.");
  });

  it("dims tracks with no downloaded audio, and spans the selection across the row", () => {
    forceTerminal(120, 40, { colorLevel: 1 });
    const frame = render(
      <ThemeContext.Provider value={makeTheme({ color: true })}>
        <SearchView area={{ width: 60, rows: 6 }} kind="full" keys={searchKeys(defaultKeymap)} query="x" editing={false} mode="lexical" scope="tracks"
          tracks={tracksOf([makeTrack(0), makeTrack(1, { local_audio_url: null })])} albums={albumsOf([])} selected={0} openAlbum={null} details={{}} />
      </ThemeContext.Provider>,
    ).lastFrame()!;
    // Inverse (7) runs to the row's last cell, and the unplayable title is grey (90).
    expect(frame).toMatch(/\u001b\[7m\u001b\[1m› Cumbia 0.* {2}\u001b\[27m$/m);
    expect(frame).toMatch(/\u001b\[90mCumbia 1/);
  });

  it("leaves unbound keys out of the box, tabs and buttons", () => {
    const keymap = buildKeymap({ "view.search": [], "search.mode": [], "search.scope": [], "list.select": [], "queue.add": [], "nav.open": [] });
    const album = makeAlbum(0);
    const frame = view({ keys: searchKeys(keymap), scope: "albums", albums: albumsOf([album]), details: { [albumKey(album)]: detailOf(album, Array.from({ length: 12 }, (_, i) => makeTrack(i))) } });
    expect(frame).not.toContain("S-Tab");
    expect(frame).not.toContain("tracks / albums");
    expect(frame).toContain(" PLAY   ADD ALL ");
    expect(frame).toMatch(/… 10 more\s+┃/);
    expect(view({ keys: searchKeys(keymap), query: "" })).toContain("Type to search tracks.");
    expect(view({ keys: searchKeys(keymap), query: "" })).toMatch(/┃ type to search/);
  });

  it("renders the preview panel on its own", () => {
    const frame = render(<AlbumPreview album={makeAlbum(0)} state={undefined} width={56} height={14} keys={searchKeys(defaultKeymap)} />).lastFrame()!;
    expect(frame).toContain("12 tracks");
    expect(frame).toContain(" ART ");
  });
});

// ── The view inside the player ────────────────────────────────────────────────

const settle = (ms = 0) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const press = (app: ReturnType<typeof render>, keys: string, ms = 0) => act(async () => { app.stdin.write(keys); await new Promise((resolve) => setTimeout(resolve, ms)); });
const ESC = "\u001b";
const TAB = "\t";
const SHIFT_TAB = "\u001b[Z";
const RIGHT = "\u001b[C";

function makePlayer({ remote = false } = {}) {
  let queue: PlaybackSnapshot["queue"] = [];
  const snapshot = () => ({ status: "stopped", current: null, queue, position: 0, duration: null, volume: 70, error: null,
    ...(remote ? { remote: { player: { id: "room", name: "Room", revision: 1, assigned_output: null, state: { desired_output: null, checkpoint: false } }, connected: true } } : {}) }) as PlaybackSnapshot;
  const control = new EventEmitter() as EventEmitter & { request: ReturnType<typeof vi.fn> };
  control.request = vi.fn(async (method: string, params?: { track?: Track }) => {
    if (method === "queue.addTrack") queue = [...queue, { id: `e${queue.length}`, track: params!.track! }];
    if (method === "devices") return [];
    return snapshot();
  });
  const albums = [makeAlbum(0), makeAlbum(1)];
  const albumTracks = [makeTrack(0), makeTrack(1)];
  const api = {
    searchTracks: vi.fn(async () => ({ tracks: [makeTrack(0), makeTrack(1, { release_id: null })], estimatedTotalHits: 2, offset: 0, limit: 30, processingTimeMs: 1 })),
    searchAlbums: vi.fn(async () => ({ hits: albums, estimatedTotalHits: 2, offset: 0, limit: 30, query: "", sort: "" })),
    getAlbum: vi.fn(async (releaseId: string) => ({ album: albums.find((album) => album.release_id === releaseId) ?? albums[0], tracks: albumTracks })),
    listPlaylists: vi.fn(async () => []),
  };
  const props = { control: control as unknown as PlayerControlClient, api: api as unknown as GroovenetClient, initialSnapshot: snapshot() };
  return { props, api, request: control.request, albums, albumTracks, remote };
}

describe("PlayerTui search", () => {
  it("debounces typing into one query per scope, then shows the results", async () => {
    const { props, api } = makePlayer();
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    await press(app, "/");
    expect(app.lastFrame()).toContain("Type to search tracks.");
    for (const char of "cumb") await press(app, char);
    expect(api.searchTracks).not.toHaveBeenCalled();
    await settle(SEARCH_DEBOUNCE_MS + 30);
    expect(api.searchTracks).toHaveBeenCalledTimes(1);
    expect(api.searchTracks).toHaveBeenCalledWith({ query: "cumb", limit: 30 });
    expect(api.searchAlbums).toHaveBeenCalledWith({ q: "cumb", limit: 30 });
    expect(app.lastFrame()).toContain("TRACKS · 2   ALBUMS · 2");
    // Still typing: the box keeps the keys, and the list is selectable after Enter.
    await press(app, "\r");
    await press(app, "j");
    expect(app.lastFrame()).toContain("2/2");
  });

  it("ignores a response that arrives after a newer query", async () => {
    const { props, api } = makePlayer();
    let resolveOld!: (value: unknown) => void;
    api.searchTracks.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }) as never);
    const app = render(<PlayerTui {...props} options={{ search: "old" }} />);
    await settle();
    await press(app, "/");
    await press(app, "x");
    await press(app, "\r", 10);
    expect(api.searchTracks).toHaveBeenLastCalledWith({ query: "oldx", limit: 30 });
    expect(app.lastFrame()).toContain("Cumbia 0");
    await act(async () => { resolveOld({ tracks: [makeTrack(9, { title: "Stale" })], estimatedTotalHits: 1 }); });
    await settle();
    expect(app.lastFrame()).not.toContain("Stale");
  });

  it("shows a failed search, and drops a stale failure", async () => {
    const { props, api } = makePlayer();
    api.searchTracks.mockRejectedValueOnce("offline");
    const app = render(<PlayerTui {...props} options={{ search: "a" }} />);
    await settle();
    expect(app.lastFrame()).toContain("Search failed: offline");
    let rejectOld!: (reason: unknown) => void;
    api.searchTracks.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }) as never);
    await press(app, "/");
    await press(app, "b");
    await press(app, "\r", 10);
    await press(app, "/");
    await press(app, "c");
    await press(app, "\r", 10);
    await act(async () => { rejectOld(new Error("late failure")); });
    await settle();
    expect(app.lastFrame()).not.toContain("late failure");
    expect(app.lastFrame()).toContain("Cumbia 0");
  });

  it("leaves → to the playlists view", async () => {
    const { props, api } = makePlayer();
    const app = render(<PlayerTui {...props} options={{}} />);
    await settle();
    await press(app, "l", 10);
    await press(app, RIGHT, 10);
    expect(api.getAlbum).not.toHaveBeenCalled();
  });

  it("cycles the mode with S-Tab and searches tracks in it", async () => {
    const { props, api } = makePlayer();
    const app = render(<PlayerTui {...props} options={{ search: "dusty brass" }} />);
    await settle();
    await press(app, SHIFT_TAB, SEARCH_DEBOUNCE_MS + 30);
    expect(app.lastFrame()).toContain(" SEMANTIC ");
    expect(api.searchTracks).toHaveBeenLastCalledWith({ query: "dusty brass", limit: 30, mode: "semantic" });
    expect(app.lastFrame()).toContain("SEARCH · semantic · 2 tracks");
    await press(app, TAB);
    // Albums only search by keyword.
    expect(app.lastFrame()).toContain(" KEYWORD ");
  });

  it("previews the selected album, opens it with →, and goes back with Esc", async () => {
    const { props, api } = makePlayer();
    const app = render(<PlayerTui {...props} options={{ search: "cumbia" }} />);
    await settle();
    await press(app, TAB);
    await press(app, "j", 200);
    expect(api.getAlbum).toHaveBeenCalledTimes(1);
    expect(api.getAlbum).toHaveBeenCalledWith("r1", 1);
    expect(app.lastFrame()).toContain("┏━ LP-031 ━");
    expect(app.lastFrame()).toMatch(/A1 {2}Cumbia 0/);
    await press(app, RIGHT, 10);
    // The preview's fetch is reused, not repeated.
    expect(api.getAlbum).toHaveBeenCalledTimes(1);
    expect(app.lastFrame()).toContain("Cumbia Vol. 1 · Various · Vampi Soul · 2021 · 2 tracks");
    expect(app.lastFrame()).toContain("SEARCH · album · 2 tracks");
    expect(app.lastFrame()).toContain("Esc back");
    await press(app, RIGHT);
    await press(app, ESC, 30);
    expect(app.lastFrame()).toMatch(/^› Cumbia Vol\. 1/m);
    expect(app.lastFrame()).toContain("2/2");
    await press(app, ESC, 30);
    expect(app.lastFrame()).toContain("Type to search albums.");
    expect(app.lastFrame()).toContain("█");
  });

  it("opens a track's album from the track scope, and does nothing without one", async () => {
    const { props, api } = makePlayer();
    const app = render(<PlayerTui {...props} options={{ search: "cumbia" }} />);
    await settle();
    await press(app, "j");
    await press(app, RIGHT, 10);
    expect(api.getAlbum).not.toHaveBeenCalled();
    await press(app, "k");
    await press(app, RIGHT, 10);
    expect(api.getAlbum).toHaveBeenCalledWith("r1", 1);
    expect(app.lastFrame()).toContain("POS TITLE");
    // Tab leaves the album for the other scope.
    await press(app, TAB);
    expect(app.lastFrame()).toContain(" ALBUMS · 2 ");
  });

  it("reports an album that cannot be loaded", async () => {
    const { props, api } = makePlayer();
    api.getAlbum.mockRejectedValue(new Error("Album not found"));
    const app = render(<PlayerTui {...props} options={{ search: "cumbia" }} />);
    await settle();
    await press(app, TAB);
    await press(app, "\r", 10);
    expect(app.lastFrame()).toContain("Album not found");
    expect(props.control.request).not.toHaveBeenCalledWith("queue.addTrack", expect.anything());
  });

  it.each([false, true])("plays a track with Enter and adds one with a (remote %s)", async (remote) => {
    const { props, request } = makePlayer({ remote });
    const app = render(<PlayerTui {...props} options={{ search: "cumbia", ...(remote ? { remote: "room" } : {}) }} />);
    await settle();
    await press(app, "\r", 10);
    expect(request).toHaveBeenCalledWith("queue.addTrack", { track: expect.objectContaining({ track_id: "t0" }) });
    // The first track added is the one played: by index locally, by entry id on a server player.
    expect(request).toHaveBeenCalledWith("play", remote ? { id: "e0" } : { index: 0 });
    expect(app.lastFrame()).toContain("Playing “Cumbia 0”.");
    await press(app, "j");
    await press(app, "a", 10);
    expect(request).toHaveBeenCalledWith("queue.addTrack", { track: expect.objectContaining({ track_id: "t1" }) });
    expect(request).toHaveBeenCalledTimes(request.mock.calls.filter(([method]) => method !== "play").length + 1);
    expect(app.lastFrame()).toContain("Added “Cumbia 1” to the queue.");
    // Search stays open for the next one.
    expect(app.lastFrame()).toContain(" / SEARCH ");
  });

  it.each([false, true])("plays a whole album with Enter and adds it with a (remote %s)", async (remote) => {
    const { props, request } = makePlayer({ remote });
    const app = render(<PlayerTui {...props} options={{ search: "cumbia", ...(remote ? { remote: "room" } : {}) }} />);
    await settle();
    await press(app, TAB);
    await press(app, "a", 10);
    expect(request.mock.calls.filter(([method]) => method === "queue.addTrack").map(([, params]) => (params as { track: Track }).track.track_id)).toEqual(["t0", "t1"]);
    expect(app.lastFrame()).toContain("Added 2 tracks from “Cumbia Vol. 0” to the queue.");
    await press(app, "\r", 10);
    // Two were queued already, so the album starts at the third entry.
    expect(request).toHaveBeenCalledWith("play", remote ? { id: "e2" } : { index: 2 });
    expect(app.lastFrame()).toContain("Playing 2 tracks from “Cumbia Vol. 0”.");
  });

  it("says when there is nothing to add, and stops when the player refuses", async () => {
    const { props, api, request } = makePlayer();
    api.getAlbum.mockResolvedValue({ album: makeAlbum(0), tracks: [] } as never);
    const app = render(<PlayerTui {...props} options={{ search: "cumbia" }} />);
    await settle();
    await press(app, TAB);
    await press(app, "a", 10);
    expect(app.lastFrame()).toContain("Nothing to add.");
    api.getAlbum.mockResolvedValue({ album: makeAlbum(1), tracks: [makeTrack(0, { title: "Solo" })] } as never);
    await press(app, "j");
    await press(app, "a", 10);
    expect(app.lastFrame()).toContain("Added 1 track from “Cumbia Vol. 1” to the queue.");

    await press(app, TAB);
    request.mockRejectedValueOnce(new Error("daemon gone"));
    await press(app, "\r", 10);
    expect(app.lastFrame()).toContain("daemon gone");
    expect(request).not.toHaveBeenCalledWith("queue.addTrack", { track: expect.objectContaining({ track_id: "t0", title: "Cumbia 0" }) });

    request.mockImplementation(async (method: string) => { if (method === "queue.addTrack") throw new Error("queue full"); return props.initialSnapshot; });
    await press(app, "\r", 10);
    expect(app.lastFrame()).toContain("queue full");
    expect(request).not.toHaveBeenCalledWith("play", expect.anything());

    // The add succeeds but the new entry is missing from the next status: nothing is played.
    request.mockImplementation(async () => props.initialSnapshot);
    await press(app, "\r", 10);
    expect(request).not.toHaveBeenCalledWith("play", expect.anything());
  });

  it("does nothing on Enter, a or → with no results", async () => {
    const { props, api, request } = makePlayer();
    api.searchTracks.mockResolvedValue({ tracks: [], estimatedTotalHits: 0 } as never);
    const app = render(<PlayerTui {...props} options={{ search: "nothing" }} />);
    await settle();
    await press(app, "\r");
    await press(app, "a");
    await press(app, RIGHT, 10);
    expect(request).not.toHaveBeenCalledWith("queue.addTrack", expect.anything());
    expect(api.getAlbum).not.toHaveBeenCalled();
  });

  it("renders at the full, side and short sizes and follows a live resize", async () => {
    const { props } = makePlayer();
    const app = render(<PlayerTui {...props} options={{ search: "cumbia" }} />);
    await settle();
    expect(app.lastFrame()).toContain("┏━ FIND ━");
    await act(async () => { resizeTerminal(app.stdout as unknown as EventEmitter, 40, 50); });
    expect(app.lastFrame()).toMatch(/^ FIND {2}\/ cumbia/m);
    expect(app.lastFrame()).toMatch(/^ {4}Los Demonios Del Mantaro$/m);
    await act(async () => { resizeTerminal(app.stdout as unknown as EventEmitter, 80, 24); });
    expect(app.lastFrame()).toMatchSnapshot();
    // The strip has no body; the search is kept for when there is room again.
    await act(async () => { resizeTerminal(app.stdout as unknown as EventEmitter, 120, 5); });
    expect(app.lastFrame()).not.toContain("FIND");
    await act(async () => { resizeTerminal(app.stdout as unknown as EventEmitter, 120, 40); });
    expect(app.lastFrame()).toContain("/ cumbia");
  });
});
