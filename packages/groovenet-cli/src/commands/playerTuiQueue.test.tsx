import React from "react";
import { Box } from "ink";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Track } from "@groovenet/client";
import type { PlaybackSnapshot, QueueEntry } from "@groovenet/player";
import { buildKeymap, defaultKeymap } from "./playerKeymap.js";
import { currentIndex, fullRow, NowPlaying, queueColumns, QueueView, sideRows, stripHints } from "./playerTuiQueue.js";
import type { CardArea } from "../tui/frame.js";
import { segmentsWidth } from "../tui/primitives.js";
import { forceTerminal } from "../tui/testing.js";

beforeEach(() => { forceTerminal(120, 40); });
afterEach(() => { cleanup(); });

const track = { track_id: "t1", friend_id: 1, title: "Money Trees", artist: "Kendrick Lamar", album: "good kid, m.A.A.d city", bpm: 72, key: "D minor", duration_seconds: 386, position: "B2" } as unknown as Track;
const entry = (id: string, overrides: Partial<Track> = {}): QueueEntry => ({ id, track: { ...track, ...overrides } as Track });
const queue = [entry("a", { title: "Conversation Pt.1", artist: "Mac Miller" }), entry("b"), entry("c", { title: "Astronomy (8th Light)", artist: "Mos Def, Talib Kweli" })];

function snapshot(overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
  return { status: "playing", current: queue[1]!, queue, position: 44, duration: 386, volume: 81, error: null, ...overrides };
}

const card = (area: CardArea, data = snapshot(), keymap = defaultKeymap) =>
  render(<Box flexDirection="column" width={area.width}><NowPlaying snapshot={data} area={area} keymap={keymap} target="LOUNGE ROOM AUDIO" /></Box>).lastFrame()!;

describe("currentIndex", () => {
  it("finds the playing entry, or -1", () => {
    expect(currentIndex(snapshot())).toBe(1);
    expect(currentIndex(snapshot({ current: null }))).toBe(-1);
    expect(currentIndex(snapshot({ current: entry("gone") }))).toBe(-1);
  });
});

describe("NowPlaying", () => {
  const full: CardArea = { kind: "full", width: 93, height: 8 };

  it("draws the full card as on the board", () => {
    expect(card(full).split("\n")).toEqual([
      "Money Trees",
      "Kendrick Lamar",
      "good kid, m.A.A.d city",
      "B2 · 72 BPM · 7A",
      "",
      `0:44 ${"━".repeat(7)}${"─".repeat(53)} 6:26  ▶ PLAYING`,
      "",
      ` |◀ p   || Space   ▶| n    VOL ${"━".repeat(13)}${"─".repeat(3)} 81%   +/- volume`,
    ]);
  });

  it.each([
    ["paused", "‖ PAUSED", "▶ Space"],
    ["loading", "… LOADING", "|| Space"],
    ["stopped", "■ STOPPED", "▶ Space"],
    ["ended", "■ ENDED", "▶ Space"],
    ["error", "✕ ERROR", "▶ Space"],
  ] as const)("labels %s playback and its toggle", (status, label, toggle) => {
    const frame = card(full, snapshot({ status }));
    expect(frame).toContain(label);
    expect(frame).toContain(toggle);
  });

  it("shows nothing playing with an unknown duration", () => {
    const frame = card(full, snapshot({ current: null, status: "stopped", position: 0, duration: null }));
    expect(frame.split("\n")[0]).toBe("Nothing playing");
    expect(frame).toMatch(/0:00 ─+ -:-- {2}■ STOPPED/);
  });

  it("takes the chip and volume keys from the keymap, dropping what is unbound or does not fit", () => {
    const rebound = buildKeymap({ "transport.prev": [], "transport.next": ["ctrl+n"], "transport.volume-down": [] });
    const frame = card(full, snapshot(), rebound);
    expect(frame).toContain(" |◀   || Space   ▶| ^N ");
    expect(frame).toMatch(/81% {3}\+ volume$/m);
    expect(card(full, snapshot(), buildKeymap({ "transport.volume-up": [], "transport.volume-down": [] }))).not.toContain("volume");
    // At 80 columns the hint would be cut, so it goes whole.
    expect(card({ ...full, width: 57 })).toMatch(/ 81%$/m);
  });

  it("splits the side pane's card beside and below the art", () => {
    expect(card({ kind: "side", width: 18, height: 6 }).split("\n")).toEqual(["Money Trees", "Kendrick Lamar", "good kid, m.A.A.d…", "", "B2 · 72 BPM · 7A"]);
    expect(card({ kind: "side", region: "below", width: 34, height: 7 }).split("\n")).toEqual([
      "",
      `0:44 ${"━".repeat(3)}${"─".repeat(21)} 6:26`,
      "",
      ` |◀   ||   ▶|   VOL ${"━".repeat(8)}${"─".repeat(2)} 81%`,
      "",
      "PLAY ON LOUNGE ROOM AUDIO",
      "o change output",
    ]);
    expect(card({ kind: "side", region: "below", width: 34, height: 7 }, snapshot(), buildKeymap({ "play-on.open": [] }))).not.toContain("change output");
  });

  it("puts one line in the strip", () => {
    const strip: CardArea = { kind: "strip", width: 114, height: 1 };
    expect(card(strip)).toMatch(/^▶ Money Trees · Kendrick Lamar +0:44 ━+─+ 6:26 {3}VOL 81%$/);
    expect(card(strip, snapshot({ status: "paused" }))).toMatch(/^‖ Money Trees/);
    expect(card(strip, snapshot({ status: "stopped" }))).toMatch(/^■ Money Trees/);
    expect(card(strip, snapshot({ current: null, duration: null }))).toMatch(/^Nothing playing +0:44 ─+ -:--/);
  });
});

describe("queue rows", () => {
  it("shares the flexible width 40:46 as on the board", () => {
    expect(queueColumns(118)).toEqual({ title: 40, artist: 46 });
    expect(queueColumns(78)).toEqual({ title: 21, artist: 25 });
    expect(queueColumns(10)).toEqual({ title: 0, artist: 0 });
  });

  it("styles played, playing, upcoming and cursor rows", () => {
    const role = (segments: ReturnType<typeof fullRow>, text: string) => segments.find((segment) => segment.text.startsWith(text))?.role;
    const played = fullRow(queue[0]!, 0, { cursor: false, playing: false, played: true }, 118);
    expect(segmentsWidth(played)).toBe(118);
    expect(role(played, "Conversation")).toBe("dim");
    expect(role(played, "Mac Miller")).toBe("dim");
    const playing = fullRow(queue[1]!, 1, { cursor: false, playing: true, played: false }, 118);
    expect(playing[0]).toEqual({ text: "▶", role: "live" });
    expect(role(playing, "Money Trees")).toBe("strong");
    expect(role(playing, "Kendrick")).toBe("muted");
    const upcoming = fullRow(queue[2]!, 2, { cursor: false, playing: false, played: false }, 118);
    expect(role(upcoming, "Astronomy")).toBe("ink");
    const cursor = fullRow(queue[1]!, 1, { cursor: true, playing: true, played: false }, 118);
    expect(cursor[0]).toEqual({ text: "›", role: "selectionStrong" });
    expect(role(cursor, "Money Trees")).toBe("selectionStrong");
    // The selection spans the whole row, padding included.
    expect(segmentsWidth(cursor)).toBe(118);
    expect(cursor.every((segment) => segment.role === "selection" || segment.role === "selectionStrong")).toBe(true);
  });

  it("shows placeholders for what a track does not have", () => {
    const bare = fullRow(entry("x", { bpm: null, key: null, duration_seconds: null, artist: undefined } as Partial<Track>), 0, { cursor: false, playing: false, played: false }, 118);
    expect(bare.map((segment) => segment.text).join("")).toMatch(/Money Trees\s+-:--   --- {2}---\s*$/);
    const [title, artist] = sideRows(entry("x", { artist: undefined } as Partial<Track>), { cursor: true, playing: false, played: false }, 40);
    expect(segmentsWidth(title)).toBe(40);
    expect(artist.map((segment) => segment.text).join("").trim()).toBe("");
  });
});

describe("QueueView", () => {
  const view = (data: PlaybackSnapshot, selected: number, kind: "full" | "side", rows: number, width = 120) =>
    render(<Box flexDirection="column"><QueueView snapshot={data} selected={selected} area={{ width, rows }} kind={kind} /></Box>).lastFrame()!;

  it("draws the full queue with a header, ▶ on the playing entry and › on the cursor", () => {
    const lines = view(snapshot(), 2, "full", 10).split("\n");
    expect(lines[0]).toMatch(/^ {4}# {2}TITLE +ARTIST +TIME {3}BPM {2}KEY$/);
    expect(lines[1]).toMatch(/^ {4}1 {2}Conversation Pt\.1 +Mac Miller +6:26 {4}72 {2}7A$/);
    expect(lines[2]).toMatch(/^▶ {3}2 {2}Money Trees/);
    expect(lines[3]).toMatch(/^› {3}3 {2}Astronomy/);
  });

  it("draws two rows per entry in the side pane, and scrolls to keep the cursor", () => {
    const long = Array.from({ length: 10 }, (_, i) => entry(`e${i}`, { title: `Song ${i}`, artist: `Artist ${i}` }));
    const lines = view(snapshot({ queue: long, current: long[0]! }), 7, "side", 6, 40).split("\n");
    expect(lines).toEqual(["  Song 5                           6:26", "    Artist 5", "  Song 6                           6:26", "    Artist 6", "› Song 7                           6:26", "    Artist 7"]);
    expect(view(snapshot({ queue: long, current: long[0]! }), 1, "side", 4, 40)).toMatch(/^▶ Song 0/);
  });

  it("says when the queue is empty", () => {
    expect(view(snapshot({ queue: [], current: null }), 0, "full", 5)).toBe("Queue is empty.");
  });
});

describe("stripHints", () => {
  it("lists the strip's keys, leaving out unbound ones", () => {
    expect(stripHints(defaultKeymap, "queue")).toEqual([
      { keys: "Space", label: "pause" }, { keys: "n", label: "next" }, { keys: "p", label: "prev" },
      { keys: "+/-", label: "volume" }, { keys: "Enter", label: "full view" },
    ]);
    const keymap = buildKeymap({ "transport.volume-up": [], "transport.volume-down": [], "list.select": [] });
    expect(stripHints(keymap, "queue").map((hint) => hint.label)).toEqual(["pause", "next", "prev"]);
  });
});
