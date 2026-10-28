/**
 * The player TUI's search view (#825): a FIND box with live, debounced
 * queries, track and album scopes, an album preview and an album's full
 * tracklist. `playerTui.tsx` owns the state and keys; this file owns the
 * fetching hooks and renders into the frame's body.
 */
import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Text } from "ink";
import {
  camelotOf, parseBpm, trackDurationLabel,
  type Album, type AlbumDetail, type AlbumSearchResponse, type GroovenetClient, type Track, type TrackSearchMode, type TrackSearchResponse,
} from "@groovenet/client";
import { hintItems, primaryKey, type HintItem, type Keymap } from "./playerKeymap.js";
import type { ActionId } from "./playerKeymapRegistry.js";
import { visibleWindow } from "./playerTuiView.js";
import type { BodyArea } from "../tui/frame.js";
import { ART_SIDE, type LayoutKind } from "../tui/layout.js";
import { ArtSlot, fitSegments, Line, OutlinedBox, reverseLabel, Rule, segmentsWidth, Styled, type Segment } from "../tui/primitives.js";
import { fit, fitRight } from "../tui/text.js";
import type { Role } from "../tui/theme.js";

export type SearchScope = "tracks" | "albums";

/** The modes `GET /tracks/search` supports, in `S-Tab` order. Albums only search by keyword. */
export const SEARCH_MODES: readonly TrackSearchMode[] = ["lexical", "semantic", "hybrid"];
const MODE_LABEL: Record<TrackSearchMode, string> = { lexical: "keyword", semantic: "semantic", hybrid: "hybrid" };

export function nextSearchMode(mode: TrackSearchMode): TrackSearchMode {
  return SEARCH_MODES[(SEARCH_MODES.indexOf(mode) + 1) % SEARCH_MODES.length]!;
}

/** Typing waits this long before querying; `input.submit` queries at once. */
export const SEARCH_DEBOUNCE_MS = 250;
/** Moving through albums waits this long before fetching the preview's tracklist. */
export const PREVIEW_DEBOUNCE_MS = 150;
/** Results per scope. Non-lexical track modes allow at most 50. */
export const SEARCH_LIMIT = 30;

/** A request's state. `loading` keeps the last data so the list does not flash empty while a query is in flight. */
export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading"; data?: T }
  | { status: "ready"; data: T }
  | { status: "error"; error: string };

export function dataOf<T>(state: Loadable<T> | undefined): T | undefined {
  return state && "data" in state ? state.data : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `load` debounced on `key`. A new key cancels the pending timer and marks any
 * response still in flight as stale, so an older query can never overwrite a
 * newer one. A changed `nonce` (and the first run) skip the wait.
 */
export function useDebouncedLoad<T>(key: string | null, nonce: number, load: () => Promise<T>, delay: number): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: "idle" });
  const last = useRef<number | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const immediate = last.current === null || last.current !== nonce;
    last.current = nonce;
    if (key === null) { setState({ status: "idle" }); return; }
    let stale = false;
    setState((previous) => ({ status: "loading", data: dataOf(previous) }));
    const run = () => {
      // Through a promise, so a loader that throws synchronously still lands in the error state.
      Promise.resolve().then(() => loadRef.current()).then(
        (data) => { if (!stale) setState({ status: "ready", data }); },
        (error: unknown) => { if (!stale) setState({ status: "error", error: errorMessage(error) }); },
      );
    };
    const timer = immediate ? null : setTimeout(run, delay);
    if (immediate) run();
    return () => { stale = true; if (timer) clearTimeout(timer); };
  }, [key, nonce, delay]);
  return state;
}

/** Track and album results for `query`; an empty query is idle, not a browse. */
export function useSearchResults(api: GroovenetClient, query: string, mode: TrackSearchMode, nonce: number) {
  const text = query.trim();
  const tracks = useDebouncedLoad<TrackSearchResponse>(text ? `${mode}:${text}` : null, nonce,
    () => api.searchTracks({ query: text, limit: SEARCH_LIMIT, ...(mode !== "lexical" ? { mode } : {}) }), SEARCH_DEBOUNCE_MS);
  const albums = useDebouncedLoad<AlbumSearchResponse>(text || null, nonce, () => api.searchAlbums({ q: text, limit: SEARCH_LIMIT }), SEARCH_DEBOUNCE_MS);
  return { tracks, albums };
}

/** What identifies an album, plus enough to title it before its detail arrives. */
export interface AlbumRef { release_id: string; friend_id: number; title: string; artist: string }

export function albumKey(album: Pick<AlbumRef, "release_id" | "friend_id">): string {
  return `${album.friend_id}:${album.release_id}`;
}

/** Album details (`getAlbum`), fetched once per album and shared by the preview, the open album and PLAY / ADD ALL. */
export function useAlbumDetails(api: GroovenetClient) {
  const [details, setDetails] = useState<Record<string, Loadable<AlbumDetail>>>({});
  const pending = useRef(new Map<string, Promise<AlbumDetail>>());
  const load = useCallback((album: AlbumRef): Promise<AlbumDetail> => {
    const key = albumKey(album);
    const existing = pending.current.get(key);
    if (existing) return existing;
    setDetails((current) => ({ ...current, [key]: { status: "loading" } }));
    const promise = api.getAlbum(album.release_id, album.friend_id).then(
      (detail) => { setDetails((current) => ({ ...current, [key]: { status: "ready", data: detail } })); return detail; },
      (error: unknown) => {
        // A failure is not cached: the next request tries again.
        pending.current.delete(key);
        setDetails((current) => ({ ...current, [key]: { status: "error", error: errorMessage(error) } }));
        throw error;
      },
    );
    pending.current.set(key, promise);
    return promise;
  }, [api]);
  return { details, load };
}

/** Fetches the selected album's tracklist for the preview once the selection settles. */
export function useAlbumPreview(album: AlbumRef | null, load: (album: AlbumRef) => Promise<AlbumDetail>): void {
  const key = album ? albumKey(album) : null;
  const albumRef = useRef(album);
  albumRef.current = album;
  useEffect(() => {
    if (!albumRef.current) return;
    const target = albumRef.current;
    const timer = setTimeout(() => { load(target).catch(() => undefined); }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, load]);
}

export function albumRefOf(album: Album): AlbumRef {
  return { release_id: album.release_id, friend_id: album.friend_id, title: album.title, artist: album.artist };
}

/** The album a track is on, for `nav.open` in the track scope; null without a release. */
export function trackAlbumRef(track: Track): AlbumRef | null {
  return track.release_id ? { release_id: track.release_id, friend_id: track.friend_id, title: track.album, artist: track.artist } : null;
}

/**
 * The search view's hint bar: its own labels (what `↵` and `a` do depend on
 * the scope) with keys from the keymap, then the view's other hints.
 */
export function searchHints(keymap: Keymap, { editing, scope, albumOpen, remote, omit }: {
  editing: boolean; scope: SearchScope; albumOpen: boolean; remote: boolean; omit: readonly ActionId[];
}): HintItem[] {
  const view = editing ? "input" : "search";
  const albums = scope === "albums" && !albumOpen;
  // Tab always goes to the other scope, even from an album opened in this one.
  const other = scope === "albums" ? "tracks" : "albums";
  const wanted: Array<[ActionId[], string]> = editing
    ? [[["input.submit"], "results"], [["input.cancel"], "done"], [["search.scope"], other], [["search.mode"], "mode"]]
    : [
      [["list.up", "list.down"], "select"],
      [["list.select"], albums ? "play album" : "play"],
      [["queue.add"], albums ? "add all" : "add to queue"],
      ...(albumOpen ? [] : [[["nav.open"], "open"]] as Array<[ActionId[], string]>),
      [["search.scope"], other],
      [["search.back"], albumOpen ? "back" : "clear"],
    ];
  const items: HintItem[] = [];
  const used: ActionId[] = [];
  for (const [ids, label] of wanted) {
    const keys = ids.map((id) => primaryKey(keymap, id, view)).filter(Boolean).join("/");
    used.push(...ids);
    if (keys) items.push({ keys, label });
  }
  return [...items, ...hintItems(keymap, view, { remote, omit: [...omit, ...used] })];
}

/** Keys the body itself shows (the FIND box, the scope tabs, the preview's buttons), already formatted. */
export interface SearchKeys { find: string; mode: string; scope: string; select: string; add: string; open: string }

export function searchKeys(keymap: Keymap): SearchKeys {
  return {
    find: primaryKey(keymap, "view.search", "search"),
    mode: primaryKey(keymap, "search.mode", "search"),
    scope: primaryKey(keymap, "search.scope", "search"),
    select: primaryKey(keymap, "list.select", "search"),
    add: primaryKey(keymap, "queue.add", "search"),
    open: primaryKey(keymap, "nav.open", "search"),
  };
}

/** `SEARCH · keyword · 30 tracks`: the status line's left side in the search view. */
export function searchStatus({ scope, mode, tracks, albums, albumOpen = false, album, selectedTrack }: {
  scope: SearchScope; mode: TrackSearchMode; tracks: Loadable<TrackSearchResponse>; albums: Loadable<AlbumSearchResponse>;
  /** An album's tracklist is open; `album` is its detail, once requested. */
  albumOpen?: boolean; album?: Loadable<AlbumDetail>;
  /** The selected row when it is a track: the line notes when it has no downloaded audio. */
  selectedTrack?: Track;
}): Segment[] {
  const parts = ["SEARCH"];
  if (albumOpen) {
    parts.push("album");
    const detail = dataOf(album);
    if (detail) parts.push(count(detail.tracks.length, "track"));
  } else {
    const state = scope === "tracks" ? tracks : albums;
    parts.push(scope === "tracks" ? MODE_LABEL[mode] : "keyword");
    const data = dataOf(state as Loadable<TrackSearchResponse | AlbumSearchResponse>);
    if (data) {
      const shown = "tracks" in data ? data.tracks.length : data.hits.length;
      parts.push(`${data.estimatedTotalHits > shown ? `${shown} of ${data.estimatedTotalHits}` : shown} ${scope === "tracks" ? (shown === 1 ? "track" : "tracks") : (shown === 1 ? "album" : "albums")}`);
    }
    if (state.status === "loading") parts.push("searching…");
    if (scope === "tracks" && tracks.status === "ready" && tracks.data.degraded) parts.push("semantic unavailable, keyword results");
  }
  return [{ text: parts.join(" · "), role: "dim" }, ...(selectedTrack && !selectedTrack.local_audio_url ? [{ text: " · selected: no downloaded audio", role: "warn" as const }] : [])];
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export interface SearchViewProps {
  area: BodyArea;
  kind: Exclude<LayoutKind, "too-small" | "strip">;
  keys: SearchKeys;
  query: string;
  editing: boolean;
  mode: TrackSearchMode;
  scope: SearchScope;
  tracks: Loadable<TrackSearchResponse>;
  albums: Loadable<AlbumSearchResponse>;
  selected: number;
  openAlbum: AlbumRef | null;
  details: Record<string, Loadable<AlbumDetail>>;
}

/** The FIND box takes four rows (with its shadow) and a blank; below this many body rows it is one line. */
const ROOMY_ROWS = 12;
/** The album preview panel needs this many columns beside the list. */
const PREVIEW_MIN_COLUMNS = 96;

export function SearchView(props: SearchViewProps) {
  const { area, kind } = props;
  const roomy = kind === "full" && area.rows >= ROOMY_ROWS;
  const width = area.width;
  const header: ReactNode[] = roomy
    ? [<FindBox key="find" {...props} width={Math.max(4, width - 2)} />, <Text key="gap"> </Text>]
    : [<Line key="find" left={[reverseLabel("FIND"), { text: " " }, ...queryText(props)]} right={modeTag(props)} width={width} />];
  const used = roomy ? 5 : 1;
  const tabsRows = props.openAlbum ? 0 : 1;
  const ruleRows = roomy ? 1 : 0;
  const rows = Math.max(0, area.rows - used - tabsRows - ruleRows);
  return (
    <Box flexDirection="column" width={width}>
      {header}
      {props.openAlbum ? null : <ScopeTabs {...props} width={width} />}
      {roomy ? <Rule width={width} /> : null}
      <SearchBody {...props} rows={rows} roomy={roomy} />
    </Box>
  );
}

function queryText({ keys, query, editing }: SearchViewProps): Segment[] {
  const out: Segment[] = keys.find ? [{ text: keys.find, role: "strong" }, { text: " " }] : [];
  if (query) out.push({ text: query, role: "strong" });
  if (editing) out.push({ text: "█" });
  else if (!query) out.push({ text: "type to search", role: "dim" });
  return out;
}

/** The mode tag, and its key hint where there is room for it beside the query. */
function modeTag({ keys, mode, scope, area }: SearchViewProps): Segment[] {
  const label = scope === "albums" ? "KEYWORD" : MODE_LABEL[mode].toUpperCase();
  return [{ text: ` ${label} `, role: "selection" }, ...(keys.mode && area.width >= 60 ? [{ text: "  " }, { text: keys.mode, role: "strong" as const }, { text: " mode", role: "dim" as const }] : [])];
}

function FindBox(props: SearchViewProps & { width: number }) {
  const inner = Math.max(0, props.width - 2);
  return (
    <OutlinedBox width={props.width} height={3} title={[reverseLabel("FIND")]}>
      <Box paddingX={1}><Line left={queryText(props)} right={modeTag(props)} width={Math.max(0, inner - 2)} /></Box>
    </OutlinedBox>
  );
}

function ScopeTabs({ scope, tracks, albums, keys, width }: SearchViewProps & { width: number }) {
  const label = (name: string, state: Loadable<TrackSearchResponse | AlbumSearchResponse>) => {
    const data = dataOf(state);
    const n = data ? ("tracks" in data ? data.tracks.length : data.hits.length) : null;
    return ` ${name}${n === null ? (state.status === "loading" ? " · …" : "") : ` · ${n}`} `;
  };
  const left: Segment[] = [
    { text: label("TRACKS", tracks), role: scope === "tracks" ? "reverse" : "muted" },
    { text: " " },
    { text: label("ALBUMS", albums), role: scope === "albums" ? "reverse" : "muted" },
    ...(keys.scope ? [{ text: "  " }, { text: keys.scope, role: "strong" as const }, { text: width >= 60 ? " tracks / albums" : " scope", role: "dim" as const }] : []),
  ];
  return <Line left={left} width={width} />;
}

/** A cell of a list row: its role, and its role when the row is selected. */
interface Cell { text: string; role?: Role; selected?: Role }

/** One list row exactly `width` cells, the selected one in the selection role end to end. */
function Row({ cells, width, selected }: { cells: Cell[]; width: number; selected: boolean }) {
  const segments: Segment[] = cells.map((cell) => ({ text: cell.text, role: selected ? (cell.selected ?? "selection") : cell.role }));
  const fitted = fitSegments(segments, width);
  const rest = width - segmentsWidth(fitted);
  // Padding in the row's role keeps the selection bar full width.
  return <Line left={rest > 0 ? [...fitted, { text: " ".repeat(rest), role: selected ? "selection" : undefined }] : fitted} width={width} />;
}

function marker(selected: boolean): Cell {
  return { text: selected ? "› " : "  ", selected: "selectionStrong" };
}

function message(text: string, role: Role = "dim"): ReactNode {
  return <Styled role={role}>{text}</Styled>;
}

function SearchBody(props: SearchViewProps & { rows: number; roomy: boolean }) {
  const { scope, tracks, albums, query, openAlbum, details, area, rows } = props;
  if (rows <= 0) return null;
  if (openAlbum) return <OpenAlbum {...props} album={openAlbum} state={details[albumKey(openAlbum)]} />;
  if (!query.trim()) return message(`Type to search ${scope}${props.editing || !props.keys.find ? "" : ` (${props.keys.find})`}.`);
  const state = scope === "tracks" ? tracks : albums;
  if (state.status === "error") return message(fit(`Search failed: ${state.error}`, area.width), "warn");
  const data = dataOf(state as Loadable<TrackSearchResponse | AlbumSearchResponse>);
  if (!data) return message("Searching…");
  if (scope === "tracks") {
    const list = (data as TrackSearchResponse).tracks;
    if (!list.length) return message(fit(`No tracks match “${query.trim()}”.`, area.width));
    return <TrackList {...props} list={list} />;
  }
  const list = (data as AlbumSearchResponse).hits;
  if (!list.length) return message(fit(`No albums match “${query.trim()}”.`, area.width));
  return <AlbumList {...props} list={list} />;
}

/** Fixed columns of a wide track row: marker, gaps, TIME (5), BPM (4), KEY (3) and a right margin. */
const TRACK_FIXED = 2 + 2 + 1 + 5 + 2 + 4 + 2 + 3 + 1;
const POSITION_WIDTH = 4;

function trackColumns(width: number, withPosition: boolean) {
  const avail = Math.max(2, width - TRACK_FIXED - (withPosition ? POSITION_WIDTH : 0));
  const title = Math.ceil(avail * 0.45);
  return { title, artist: avail - title };
}

function bpmText(track: Track): string {
  const bpm = parseBpm(track.bpm);
  return bpm === null ? "--" : String(Math.round(bpm));
}

/** A track's cells in the wide layout. A track with no downloaded audio is dim. */
function trackCells(track: Track, width: number, selected: boolean, withPosition: boolean): Cell[] {
  const columns = trackColumns(width, withPosition);
  const playable = !!track.local_audio_url;
  return [
    marker(selected),
    ...(withPosition ? [{ text: fit(String(track.position ?? ""), POSITION_WIDTH), role: "dim" as const }] : []),
    { text: fit(track.title, columns.title), role: playable ? "ink" : "dim", selected: "selectionStrong" },
    { text: "  " },
    { text: fit(track.artist, columns.artist), role: playable ? "muted" : "dim" },
    { text: " " },
    { text: fitRight(trackDurationLabel(track) || "-:--", 5), role: "dim" },
    { text: "  " },
    { text: fitRight(bpmText(track), 4), role: "dim" },
    { text: "  " },
    { text: fit(camelotOf(track.key) ?? "--", 3), role: "dim" },
  ];
}

function TrackHeader({ width, withPosition }: { width: number; withPosition: boolean }) {
  const columns = trackColumns(width, withPosition);
  const text = `  ${withPosition ? fit("POS", POSITION_WIDTH) : ""}${fit("TITLE", columns.title)}  ${fit("ARTIST", columns.artist)} ${fitRight("TIME", 5)}  ${fitRight("BPM", 4)}  KEY`;
  return <Styled role="dim">{fit(text, width)}</Styled>;
}

/** Tracks, one row each in the full window and two (title and time, then artist) in the side pane. */
function TrackList({ list: tracks, selected, area, kind, roomy, withPosition = false, rows }: SearchViewProps & { list: Track[]; rows: number; roomy: boolean; withPosition?: boolean }) {
  const width = area.width;
  const wide = kind === "full";
  const headerRows = wide && roomy ? 1 : 0;
  const perRow = wide ? 1 : 2;
  const window = visibleWindow(tracks.length, selected, Math.max(1, Math.floor((rows - headerRows) / perRow)));
  return (
    <>
      {headerRows ? <TrackHeader width={width} withPosition={withPosition} /> : null}
      {tracks.slice(window.start, window.end).map((track, row) => {
        const index = window.start + row;
        const isSelected = index === selected;
        if (wide) return <Row key={index} cells={trackCells(track, width, isSelected, withPosition)} width={width} selected={isSelected} />;
        const playable = !!track.local_audio_url;
        const position = withPosition ? String(track.position ?? "").trim() : "";
        const lead = position ? `${position} ` : "";
        return (
          <Box key={index} flexDirection="column">
            <Row cells={[marker(isSelected), { text: fit(`${lead}${track.title}`, Math.max(1, width - 8)), role: playable ? "ink" : "dim", selected: "selectionStrong" }, { text: " " }, { text: fitRight(trackDurationLabel(track) || "-:--", 5), role: "dim" }]} width={width} selected={isSelected} />
            <Row cells={[{ text: "    " }, { text: fit(track.artist, Math.max(1, width - 5)), role: playable ? "muted" : "dim" }]} width={width} selected={isSelected} />
          </Box>
        );
      })}
    </>
  );
}

function albumYear(album: Album): string {
  return album.year == null || album.year === "" ? "" : String(album.year);
}

function albumIdLine(album: Album): string {
  return [album.library_identifier || null, album.track_count != null ? count(album.track_count, "track") : null].filter(Boolean).join(" · ");
}

/** Albums, two rows each; the full window adds the preview panel when it is wide enough. */
function AlbumList(props: SearchViewProps & { list: Album[]; rows: number; roomy: boolean }) {
  const { list, selected, area, kind, roomy, rows, details } = props;
  const preview = kind === "full" && area.width >= PREVIEW_MIN_COLUMNS && rows >= 8;
  const boxWidth = preview ? Math.floor(area.width * 0.47) : 0;
  // The panel takes its width plus a shadow column, and a gap from the list.
  const listWidth = preview ? area.width - boxWidth - 1 - 2 : area.width;
  const headerRows = kind === "full" && roomy ? 1 : 0;
  const window = visibleWindow(list.length, selected, Math.max(1, Math.floor((rows - headerRows) / 2)));
  const current = list[Math.min(selected, list.length - 1)];
  const wide = kind === "full";
  const titleWidth = Math.max(1, Math.floor((listWidth - 10) * 0.65));
  const artistWidth = Math.max(1, listWidth - 10 - titleWidth);
  return (
    <Box flexDirection="row">
      <Box flexDirection="column" width={listWidth} flexShrink={0}>
        {headerRows ? <Styled role="dim">{fit(`  ${fit("ALBUM", titleWidth)} ${fit("ARTIST", artistWidth)} YEAR`, listWidth)}</Styled> : null}
        {list.slice(window.start, window.end).map((album, row) => {
          const index = window.start + row;
          const isSelected = index === selected;
          const first: Cell[] = wide
            ? [marker(isSelected), { text: fit(album.title, titleWidth), selected: "selectionStrong" }, { text: " " }, { text: fit(album.artist, artistWidth), role: "muted" }, { text: " " }, { text: fit(albumYear(album), 4), role: "dim" }]
            : [marker(isSelected), { text: fit(album.title, Math.max(1, listWidth - 8)), selected: "selectionStrong" }, { text: " " }, { text: fitRight(albumYear(album), 4), role: "dim" }];
          const second: Cell[] = wide
            ? [{ text: "    " }, { text: albumIdLine(album), role: "dim" }]
            : [{ text: "    " }, { text: [album.artist, albumIdLine(album)].filter(Boolean).join(" · "), role: "muted" }];
          return (
            <Box key={`${album.friend_id}:${album.release_id}`} flexDirection="column">
              <Row cells={first} width={listWidth} selected={isSelected} />
              <Row cells={second} width={listWidth} selected={isSelected} />
            </Box>
          );
        })}
      </Box>
      {preview && current ? (
        <Box marginLeft={2} flexShrink={0}>
          <AlbumPreview album={current} state={details[albumKey(current)]} width={boxWidth} height={Math.min(24, rows - 1)} keys={props.keys} />
        </Box>
      ) : null}
    </Box>
  );
}

/** The art size in the preview panel: fixed, like the card's, so #829 can fill it without relayout. */
export const PREVIEW_ART = ART_SIDE;

/** The selected album: art, title, artist, label · year, track count, PLAY / ADD ALL, and the start of the tracklist. */
export function AlbumPreview({ album, state, width, height, keys }: { album: Album; state: Loadable<AlbumDetail> | undefined; width: number; height: number; keys: SearchKeys }) {
  const inner = Math.max(0, width - 2);
  const content = Math.max(0, inner - 4);
  const textWidth = Math.max(0, content - PREVIEW_ART.width - 2);
  const detail = dataOf(state);
  const tracks = detail?.tracks ?? [];
  const meta = [album.label || null, albumYear(album) || null].filter(Boolean).join(" · ");
  const total = detail ? tracks.length : album.track_count;
  // Rows for the tracklist: the inner height less the art block, a blank, the TRACKLIST rule and the "more" line.
  const listRows = Math.max(0, height - 2 - PREVIEW_ART.height - 1 - 1 - 1);
  const shown = tracks.length > listRows ? Math.max(0, listRows) : tracks.length;
  const more = tracks.length - shown;
  const buttons: Segment[] = [
    { text: ` ${keys.select ? `${keys.select} ` : ""}PLAY `, role: "reverse" },
    { text: " " },
    { text: ` ${keys.add ? `${keys.add} ` : ""}ADD ALL `, role: "selection" },
  ];
  return (
    <OutlinedBox width={width} height={height} title={[reverseLabel(album.library_identifier || "ALBUM")]}>
      <Box flexDirection="column" paddingX={2}>
        <Box flexDirection="row">
          <ArtSlot width={PREVIEW_ART.width} height={PREVIEW_ART.height} />
          <Box flexDirection="column" marginLeft={2} width={textWidth}>
            <Styled role="strong">{fit(album.title, textWidth)}</Styled>
            <Styled>{fit(album.artist, textWidth)}</Styled>
            <Styled role="muted">{fit(meta, textWidth)}</Styled>
            <Styled role="dim">{fit(total != null ? count(total, "track") : "", textWidth)}</Styled>
            <Text> </Text>
            <Line left={buttons} width={textWidth} />
          </Box>
        </Box>
        <Text> </Text>
        <Line left={[{ text: "TRACKLIST ", role: "dim" }, { text: "─".repeat(Math.max(0, content - 10)), role: "dim" }]} width={content} />
        {!state || state.status === "loading" || state.status === "idle" ? message("Loading tracklist…")
          : state.status === "error" ? message(fit(`Tracklist unavailable: ${state.error}`, content), "warn")
            : !tracks.length ? message("No tracks.")
              : (
                <>
                  {tracks.slice(0, shown).map((track, index) => (
                    <Line key={index} left={[{ text: fit(String(track.position ?? ""), POSITION_WIDTH), role: "dim" }, { text: track.title, role: track.local_audio_url ? "ink" : "dim" }]} right={[{ text: trackDurationLabel(track) || "-:--", role: "dim" }]} width={content} />
                  ))}
                  {more ? <Styled role="dim">{fit(`… ${more} more${keys.open ? ` · ${keys.open} open album` : ""}`, content)}</Styled> : null}
                </>
              )}
      </Box>
    </OutlinedBox>
  );
}

/** An album's whole tracklist, opened with `nav.open`; `search.back` returns to the results. */
function OpenAlbum(props: SearchViewProps & { album: AlbumRef; state: Loadable<AlbumDetail> | undefined; rows: number; roomy: boolean }) {
  const { album, state, area, rows } = props;
  const detail = dataOf(state);
  const meta = detail ? [detail.album.label || null, albumYear(detail.album) || null, count(detail.tracks.length, "track")].filter(Boolean).join(" · ") : "";
  const title: Segment[] = [{ text: detail?.album.title ?? album.title, role: "strong" }, { text: ` · ${detail?.album.artist ?? album.artist}`, role: "muted" }, ...(meta ? [{ text: ` · ${meta}`, role: "dim" as const }] : [])];
  const body = !state || state.status === "loading" || state.status === "idle" ? message("Loading tracklist…")
    : state.status === "error" ? message(fit(`Album unavailable: ${state.error}`, area.width), "warn")
      : !detail!.tracks.length ? message("No tracks.")
        : <TrackList {...props} list={detail!.tracks} rows={rows - 1} withPosition />;
  return (
    <>
      <Line left={title} width={area.width} />
      {body}
    </>
  );
}
