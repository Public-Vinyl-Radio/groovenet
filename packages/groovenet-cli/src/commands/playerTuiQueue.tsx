/**
 * The queue view (#824): the Now Playing card's text, the queue list and the
 * strip's hints. Everything renders into the slots `PlayerFrame` hands it and
 * is fitted to their exact cells; keys come from the keymap.
 */
import React from "react";
import { Text } from "ink";
import { camelotOf, formatSeconds, parseBpm, trackDurationLabel, trackMetaLine } from "@groovenet/client";
import type { PlaybackSnapshot, QueueEntry } from "@groovenet/player";
import { primaryKey, type Keymap } from "./playerKeymap.js";
import type { ActionId, KeymapView } from "./playerKeymapRegistry.js";
import { visibleWindow } from "./playerTuiView.js";
import type { BodyArea, CardArea } from "../tui/frame.js";
import { fitSegments, Line, segmentsWidth, progressSegments, Styled, type Hint, type Segment } from "../tui/primitives.js";
import { fit, fitRight } from "../tui/text.js";
import type { Role } from "../tui/theme.js";

/** Index of the playing entry in the queue, or -1. Entries before it count as played. */
export function currentIndex(snapshot: PlaybackSnapshot): number {
  const id = snapshot.current?.id;
  return id ? snapshot.queue.findIndex((entry) => entry.id === id) : -1;
}

const STATUS: Record<PlaybackSnapshot["status"], Segment> = {
  playing: { text: "▶ PLAYING", role: "live" },
  paused: { text: "‖ PAUSED", role: "strong" },
  loading: { text: "… LOADING", role: "muted" },
  stopped: { text: "■ STOPPED", role: "dim" },
  ended: { text: "■ ENDED", role: "dim" },
  error: { text: "✕ ERROR", role: "error" },
};

const STRIP_ICON: Partial<Record<PlaybackSnapshot["status"], Segment>> = { playing: { text: "▶", role: "live" }, paused: { text: "‖", role: "strong" } };

function times(snapshot: PlaybackSnapshot): [string, string] {
  return [formatSeconds(snapshot.position), snapshot.duration == null ? "-:--" : formatSeconds(snapshot.duration)];
}

/** `0:44 ━━━──── 6:26`, the bar taking what `width` leaves (at most `maxBar`). */
function progressLine(snapshot: PlaybackSnapshot, width: number, maxBar: number): Segment[] {
  const [position, duration] = times(snapshot);
  const bar = Math.max(0, Math.min(maxBar, width - position.length - duration.length - 2));
  return [{ text: position }, { text: " " }, ...progressSegments(snapshot.position, snapshot.duration, bar), { text: " " }, { text: duration }];
}

function volumeBar(volume: number, width: number): Segment[] {
  return [{ text: "VOL ", role: "dim" }, ...progressSegments(volume, 100, width), { text: ` ${Math.round(volume)}%` }];
}

/** The transport chips: `|◀ p`, the pause/play toggle, `▶| n`. The side pane drops the keys. */
function transportChips(snapshot: PlaybackSnapshot, keymap: Keymap, withKeys: boolean): Segment[] {
  const chip = (icon: string, id: ActionId) => {
    const key = withKeys ? primaryKey(keymap, id, "queue") : "";
    return ` ${icon}${key ? ` ${key}` : ""} `;
  };
  const toggle = snapshot.status === "playing" || snapshot.status === "loading" ? "||" : "▶";
  return [
    { text: chip("|◀", "transport.prev"), role: "selection" }, { text: " " },
    { text: chip(toggle, "transport.toggle"), role: "reverse" }, { text: " " },
    { text: chip("▶|", "transport.next"), role: "selection" },
  ];
}

/** `+/-` from the keymap, or whichever of the two is bound. */
function volumeKeys(keymap: Keymap, view: KeymapView): string {
  return [primaryKey(keymap, "transport.volume-up", view), primaryKey(keymap, "transport.volume-down", view)].filter(Boolean).join("/");
}

function Row({ segments, width }: { segments: Segment[]; width: number }) {
  return <Line left={segments} width={width} />;
}

const Blank = () => <Text> </Text>;

export interface NowPlayingProps {
  snapshot: PlaybackSnapshot;
  area: CardArea;
  keymap: Keymap;
  /** Where audio plays, for the side pane's PLAY ON row. */
  target: string;
}

/**
 * The card's text. Full: title, artist, album, meta, progress with the status,
 * transport chips and volume. Side: title to meta beside the art, the rest
 * below it (`area.region`). Strip: one line.
 */
export function NowPlaying({ snapshot, area, keymap, target }: NowPlayingProps) {
  const track = snapshot.current?.track;
  const { width } = area;
  if (area.kind === "strip") {
    const left: Segment[] = track
      ? [STRIP_ICON[snapshot.status] ?? { text: "■", role: "dim" }, { text: " " }, { text: track.title, role: "strong" }, { text: ` · ${track.artist}`, role: "muted" }]
      : [{ text: "Nothing playing", role: "dim" }];
    const bar = Math.max(4, Math.min(44, Math.floor(width / 3)));
    const right = [...progressLine(snapshot, Infinity, bar), { text: "   " }, { text: `VOL ${Math.round(snapshot.volume)}%`, role: "dim" as const }];
    return <Line left={left} right={right} width={width} />;
  }
  if (area.region === "below") {
    const play = primaryKey(keymap, "play-on.open", "queue");
    const controls = [...transportChips(snapshot, keymap, false), { text: "  " }];
    return (
      <>
        <Blank />
        <Row segments={progressLine(snapshot, width, width)} width={width} />
        <Blank />
        <Row segments={[...controls, ...volumeBar(snapshot.volume, Math.max(0, Math.min(10, width - segmentsWidth(controls) - 8)))]} width={width} />
        <Blank />
        <Row segments={[{ text: "PLAY ON ", role: "dim" }, { text: target, role: "strong" }]} width={width} />
        {play ? <Row segments={[{ text: play, role: "strong" }, { text: " change output", role: "dim" }]} width={width} /> : null}
      </>
    );
  }
  const title = <Row segments={[track ? { text: track.title, role: "strong" } : { text: "Nothing playing", role: "dim" }]} width={width} />;
  const artist = <Row segments={[{ text: track?.artist ?? "" }]} width={width} />;
  const album = <Row segments={[{ text: track?.album ?? "", role: "muted" }]} width={width} />;
  const meta = <Row segments={[{ text: trackMetaLine(track), role: "dim" }]} width={width} />;
  if (area.kind === "side") return <>{title}{artist}{album}<Blank />{meta}</>;
  const status = STATUS[snapshot.status];
  const volume = volumeKeys(keymap, "queue");
  const controls = [...transportChips(snapshot, keymap, true), { text: "   " }, ...volumeBar(snapshot.volume, 16)];
  const volumeHint: Segment[] = volume ? [{ text: "   " }, { text: volume, role: "strong" }, { text: " volume", role: "dim" }] : [];
  return (
    <>
      {title}{artist}{album}{meta}
      <Blank />
      <Row segments={[...progressLine(snapshot, width - status.text.length - 2, 60), { text: "  " }, status]} width={width} />
      <Blank />
      {/* The volume hint goes whole when it does not fit, like the hint bar's. */}
      <Row segments={segmentsWidth(controls) + segmentsWidth(volumeHint) <= width ? [...controls, ...volumeHint] : controls} width={width} />
    </>
  );
}

/** Column widths for the full queue: title and artist share what the fixed columns leave, 40:46 as on the board. */
export function queueColumns(width: number): { title: number; artist: number } {
  const flex = Math.max(0, width - FIXED_COLUMNS);
  const title = Math.floor((flex * 40) / 86);
  return { title, artist: flex - title };
}

// Marker and gap, `#` (3), gaps of 2/3/3, time (5), gap, BPM (4), gap, key (6).
const FIXED_COLUMNS = 2 + 3 + 2 + 3 + 3 + 5 + 2 + 4 + 2 + 6;

export type EntryState = { cursor: boolean; playing: boolean; played: boolean };

function marker({ cursor, playing }: EntryState): Segment {
  if (cursor) return { text: "›", role: "selectionStrong" };
  return playing ? { text: "▶", role: "live" } : { text: " " };
}

function titleRole({ cursor, playing, played }: EntryState): Role {
  return cursor ? "selectionStrong" : playing ? "strong" : played ? "dim" : "ink";
}

function artistRole({ played }: EntryState): Role {
  return played ? "dim" : "muted";
}

/** The cursor row takes the selection role throughout, padded so the background spans the row. */
function selectRow(segments: Segment[], width: number, cursor: boolean): Segment[] {
  if (!cursor) return segments;
  const fitted = fitSegments(segments, width).map((segment) => segment.role === "selectionStrong" ? segment : { ...segment, role: "selection" as const });
  const padded = fitSegments(fitted, width, { pad: true });
  return padded.map((segment) => segment.role ? segment : { ...segment, role: "selection" as const });
}

function entryTime(entry: QueueEntry): string {
  return trackDurationLabel(entry.track) || "-:--";
}

/** One full-window queue row as segments, `width` cells. */
export function fullRow(entry: QueueEntry, index: number, state: EntryState, width: number): Segment[] {
  const { title, artist } = queueColumns(width);
  const bpm = parseBpm(entry.track.bpm);
  return selectRow([
    marker(state), { text: " " },
    { text: fitRight(String(index + 1), 3), role: "dim" }, { text: "  " },
    { text: fit(entry.track.title, title), role: titleRole(state) }, { text: "   " },
    { text: fit(entry.track.artist ?? "", artist), role: artistRole(state) }, { text: "   " },
    { text: fitRight(entryTime(entry), 5), role: "dim" }, { text: "  " },
    { text: fitRight(bpm === null ? "---" : String(Math.round(bpm)), 4), role: "dim" }, { text: "  " },
    { text: fit(camelotOf(entry.track.key) ?? "---", 6), role: "dim" },
  ], width, state.cursor);
}

function header(width: number): Segment[] {
  const { title, artist } = queueColumns(width);
  return [{ text: `  ${fitRight("#", 3)}  ${fit("TITLE", title)}   ${fit("ARTIST", artist)}   ${fitRight("TIME", 5)}  ${fitRight("BPM", 4)}  KEY`, role: "dim" }];
}

/** The side pane's two rows: title and time, then the artist indented under it. */
export function sideRows(entry: QueueEntry, state: EntryState, width: number): [Segment[], Segment[]] {
  return [
    selectRow([marker(state), { text: " " }, { text: fit(entry.track.title, width - 9), role: titleRole(state) }, { text: " " }, { text: fitRight(entryTime(entry), 5), role: "dim" }], width, state.cursor),
    selectRow([{ text: "    " }, { text: fit(entry.track.artist ?? "", width - 7), role: artistRole(state) }], width, state.cursor),
  ];
}

/**
 * The queue list. Full: a header and one row per entry with `#`, title,
 * artist, time, BPM and key. Side: two rows per entry. `▶` marks the playing
 * entry, `›` and the selection role the cursor; earlier entries are dimmed. The
 * window scrolls to keep the cursor on screen.
 */
export function QueueView({ snapshot, selected, area, kind }: { snapshot: PlaybackSnapshot; selected: number; area: BodyArea; kind: "full" | "side" }) {
  const { queue } = snapshot;
  if (!queue.length) return <Styled role="dim">{fit("Queue is empty.", area.width)}</Styled>;
  const playing = currentIndex(snapshot);
  const state = (index: number): EntryState => ({ cursor: index === selected, playing: index === playing, played: playing >= 0 && index < playing });
  if (kind === "side") {
    const rows = visibleWindow(queue.length, selected, Math.max(1, Math.floor(area.rows / 2)));
    return (
      <>
        {queue.slice(rows.start, rows.end).flatMap((entry, offset) => sideRows(entry, state(rows.start + offset), area.width)
          .map((segments, line) => <Row key={`${entry.id}-${line}`} segments={segments} width={area.width} />))}
      </>
    );
  }
  const width = Math.max(0, area.width - 2);
  const rows = visibleWindow(queue.length, selected, Math.max(1, area.rows - 1));
  return (
    <>
      <Row segments={header(width)} width={area.width} />
      {queue.slice(rows.start, rows.end).map((entry, offset) => (
        <Row key={entry.id} segments={fullRow(entry, rows.start + offset, state(rows.start + offset), width)} width={area.width} />
      ))}
    </>
  );
}

/** The strip's hints, as on the board: pause, next, prev, volume and `↵` for the full view. */
export function stripHints(keymap: Keymap, view: KeymapView): Hint[] {
  const hint = (id: ActionId, label: string) => ({ keys: primaryKey(keymap, id, view), label });
  return [
    hint("transport.toggle", "pause"), hint("transport.next", "next"), hint("transport.prev", "prev"),
    { keys: volumeKeys(keymap, view), label: "volume" }, hint("list.select", "full view"),
  ].filter((item) => item.keys);
}
