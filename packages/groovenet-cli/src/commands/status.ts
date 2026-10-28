import { Command } from "commander";
import { formatSeconds, getTrackDurationSeconds } from "@groovenet/client";
import type { ServerPlayer } from "@groovenet/contracts";
import { PlayerControlClient, type PlaybackSnapshot } from "@groovenet/player";
import { PLAYER_DAEMON_PATHS } from "./player.js";
import { makeRemoteApi } from "./remotePlayer.js";
import { boundedIntOption } from "../options.js";
import { displayWidth as width, progressBar, sliceWidth, truncate } from "../tui/text.js";

// Shared with the player TUI; re-exported so the segment's API stays in one place.
export { progressBar, truncate };

// `groovenet status`: a one-line now-playing segment for tmux and status bars
// (#828). Unlike `player status` it never reports an error: a status bar polls
// it every few seconds, so anything unreachable prints nothing and exits 0.

export type SegmentState = "playing" | "paused" | "loading" | "error";

/** What the segment shows; null when nothing is playing. */
export interface NowPlaying {
  state: SegmentState;
  title: string;
  artist: string;
  position: number;
  duration: number | null;
  target: string;
}

export const DEFAULT_FORMAT = "{icon} {title} · {artist} {bar} {position} · {target}";
export const SEGMENT_FIELDS = ["icon", "title", "artist", "position", "duration", "bar", "target"] as const;
type Field = (typeof SEGMENT_FIELDS)[number];

const ICONS: Record<SegmentState, string> = { playing: "▶", paused: "‖", loading: "…", error: "!" };

// tmux styles by role. Attributes and ANSI colour names only, so the segment
// follows the terminal theme; every style is undone explicitly rather than
// with #[default], which would also drop the user's own status-right styles.
const TMUX_ICON: Record<SegmentState, [string, string]> = {
  playing: ["#[reverse,bold]", "#[noreverse,nobold]"],
  paused: ["#[fg=yellow,bold]", "#[fg=default,nobold]"],
  loading: ["#[fg=cyan]", "#[fg=default]"],
  error: ["#[fg=red,bold]", "#[fg=default,nobold]"],
};
const BOLD: [string, string] = ["#[bold]", "#[nobold]"];
const DIM: [string, string] = ["#[dim]", "#[nodim]"];
const TMUX_ROLE: Record<Exclude<Field, "icon" | "bar">, [string, string]> = {
  title: BOLD, artist: DIM, position: DIM, duration: DIM, target: BOLD,
};

/** One line of track text: control characters and runs of whitespace become a single space. */
export function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Widths for title and artist that fit `budget`, taking from the longer one first. */
export function fitPair(title: number, artist: number, budget: number): [number, number] {
  let a = title, b = artist;
  const target = Math.max(0, budget);
  while (a + b > target) { if (a >= b) a--; else b--; }
  return [a, b];
}

function nowPlaying(state: string, title: string | null | undefined, artist: string | null | undefined,
  position: number, duration: number | null, target: string): NowPlaying | null {
  if (state !== "playing" && state !== "paused" && state !== "loading" && state !== "error") return null;
  return { state, title: cleanText(title) || "Unknown track", artist: cleanText(artist) || "Unknown artist",
    position: Number.isFinite(position) ? Math.max(0, position) : 0, duration, target: cleanText(target) };
}

/** The segment for the local daemon's snapshot; null when it is stopped, ended or has no track. */
export function fromLocalSnapshot(snapshot: PlaybackSnapshot): NowPlaying | null {
  const track = snapshot.current?.track;
  if (!track) return null;
  return nowPlaying(snapshot.status, track.title, track.artist, snapshot.position,
    snapshot.duration ?? getTrackDurationSeconds(track), "LOCAL");
}

/** The segment for a server player; its name, upper-cased, is the target. */
export function fromServerPlayer(player: ServerPlayer): NowPlaying | null {
  const { state } = player;
  const entry = state.queue.find((item) => item.id === state.current_entry_id);
  if (!entry) return null;
  return nowPlaying(state.status, entry.title, entry.artist, state.position, state.duration, player.name.toUpperCase());
}

export interface RenderOptions {
  format?: string;
  maxWidth?: number;
  barWidth?: number;
  tmux?: boolean;
}

type Piece = { text: string; field?: Field };

function parseFormat(format: string): Piece[] {
  const pieces: Piece[] = [];
  const pattern = /\{(\w+)\}/g;
  let last = 0;
  for (const match of format.matchAll(pattern)) {
    const name = match[1] as Field;
    if (!SEGMENT_FIELDS.includes(name)) continue; // unknown fields stay literal
    if (match.index > last) pieces.push({ text: format.slice(last, match.index) });
    pieces.push({ text: "", field: name });
    last = match.index + match[0].length;
  }
  if (last < format.length) pieces.push({ text: format.slice(last) });
  return pieces;
}

/** Escape track text for a tmux format: a literal `#` is `##`. */
export function escapeTmux(text: string): string { return text.replace(/#/g, "##"); }

function style(piece: Piece, np: NowPlaying): string {
  if (!piece.field) return piece.text;
  const text = escapeTmux(piece.text);
  if (piece.field === "icon") { const [on, off] = TMUX_ICON[np.state]; return `${on}${text}${off}`; }
  if (piece.field === "bar") {
    const filled = text.match(/^━*/)![0];
    const rest = text.slice(filled.length);
    return `${filled ? `${BOLD[0]}${filled}${BOLD[1]}` : ""}${rest ? `${DIM[0]}${rest}${DIM[1]}` : ""}`;
  }
  const [on, off] = TMUX_ROLE[piece.field];
  return text ? `${on}${text}${off}` : "";
}

/**
 * The one-line segment. `maxWidth` shortens title and artist first (the longer
 * one first) and only cuts the rest of the line when the fixed parts alone are
 * too wide. In tmux mode the width counts what shows, not the `#[…]` styles.
 */
export function renderSegment(np: NowPlaying, options: RenderOptions = {}): string {
  const values: Record<Field, string> = {
    icon: options.tmux ? ` ${ICONS[np.state]} ` : ICONS[np.state],
    title: np.title,
    artist: np.artist,
    position: formatSeconds(np.position),
    duration: np.duration == null ? "" : formatSeconds(np.duration),
    bar: progressBar(np.position, np.duration, options.barWidth ?? 6),
    target: np.target,
  };
  let pieces = parseFormat(options.format ?? DEFAULT_FORMAT).map((piece) => piece.field ? { ...piece, text: values[piece.field] } : piece);
  if (options.maxWidth !== undefined) pieces = fit(pieces, options.maxWidth);
  return pieces.map((piece) => options.tmux ? style(piece, np) : piece.text).join("");
}

function fit(pieces: Piece[], maxWidth: number): Piece[] {
  const total = (list: Piece[]) => list.reduce((sum, piece) => sum + width(piece.text), 0);
  if (total(pieces) <= maxWidth) return pieces;
  const flexible = (piece: Piece) => piece.field === "title" || piece.field === "artist";
  const titleWidth = pieces.filter((p) => p.field === "title").reduce((sum, p) => sum + width(p.text), 0);
  const artistWidth = pieces.filter((p) => p.field === "artist").reduce((sum, p) => sum + width(p.text), 0);
  const fixed = total(pieces.filter((piece) => !flexible(piece)));
  const [titleMax, artistMax] = fitPair(titleWidth, artistWidth, maxWidth - fixed);
  const fitted = pieces.map((piece) => {
    if (piece.field === "title") return { ...piece, text: truncate(piece.text, titleMax) };
    if (piece.field === "artist") return { ...piece, text: truncate(piece.text, artistMax) };
    return piece;
  });
  if (total(fitted) <= maxWidth) return fitted;
  // The fixed parts alone are too wide: cut the line from the end.
  let room = maxWidth;
  return fitted.map((piece) => {
    const text = sliceWidth(piece.text, Math.max(0, room));
    room -= width(text);
    return { ...piece, text };
  });
}

export interface StatusSources {
  local(timeoutMs: number): Promise<PlaybackSnapshot>;
  remote(playerId: string): Promise<ServerPlayer>;
}

/**
 * The local daemon's status over its socket. Never starts a daemon.
 *
 * Resolves only once the daemon has closed its side too. The daemon streams
 * position events to every client, and exiting with those unread makes the
 * kernel reset the connection, which the daemon does not survive.
 */
export async function readLocalSnapshot(socketPath: string, timeoutMs: number, closeWaitMs = 250): Promise<PlaybackSnapshot> {
  const client = new PlayerControlClient(socketPath, timeoutMs);
  const disconnected = new Promise<void>((resolve) => client.once("disconnect", resolve));
  const snapshot = await client.request<PlaybackSnapshot>("status").finally(() => client.close());
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([disconnected, new Promise((resolve) => { timer = setTimeout(resolve, closeWaitMs); })]);
  clearTimeout(timer);
  return snapshot;
}

export const defaultStatusSources: StatusSources = {
  local: (timeoutMs) => readLocalSnapshot(PLAYER_DAEMON_PATHS.socketPath, timeoutMs),
  remote: (playerId) => makeRemoteApi().getServerPlayer(playerId),
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timed out")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface StatusOptions extends RenderOptions {
  remote?: string;
  timeout?: number;
  idle?: string;
  json?: boolean;
}

/**
 * What is playing; null when nothing is, undefined when the player is
 * unreachable for any reason (no daemon, no server, no key, a timeout).
 * Never throws.
 */
export async function readNowPlaying(options: StatusOptions, sources: StatusSources = defaultStatusSources): Promise<NowPlaying | null | undefined> {
  const timeoutMs = options.timeout ?? 1000;
  try {
    if (options.remote) return fromServerPlayer(await withTimeout(sources.remote(options.remote), timeoutMs));
    return fromLocalSnapshot(await withTimeout(sources.local(timeoutMs), timeoutMs));
  } catch {
    return undefined;
  }
}

/** The text to print: the segment, the idle string, JSON, or "" for nothing. */
export async function runStatus(options: StatusOptions, sources: StatusSources = defaultStatusSources): Promise<string> {
  const np = await readNowPlaying(options, sources);
  if (options.json) return JSON.stringify(np ?? null);
  if (np === undefined) return "";
  if (!np) return options.idle ? (options.tmux ? escapeTmux(options.idle) : options.idle) : "";
  return renderSegment(np, options);
}

export function addStatusCommand(program: Command, sources: StatusSources = defaultStatusSources,
  exit: (code: number) => void = (code) => process.exit(code)): void {
  program.command("status")
    .description("Print a one-line now-playing segment for tmux and status bars (quiet: prints nothing when unreachable)")
    .option("--remote <player-id>", "read a server player instead of the local daemon")
    .option("--format <template>", `fields: ${SEGMENT_FIELDS.map((field) => `{${field}}`).join(" ")}`, DEFAULT_FORMAT)
    .option("--max-width <n>", "shorten title and artist to fit this many cells", boundedIntOption(1))
    .option("--bar-width <n>", "progress bar cells", boundedIntOption(0), 6)
    .option("--tmux", "emit tmux #[…] styles in ANSI colour names")
    .option("--idle <text>", "print this when nothing is playing (default: nothing)")
    .option("--timeout <ms>", "give up after this long and print nothing", boundedIntOption(1), 1000)
    .option("--json", "print the now-playing fields as JSON (null when idle or unreachable)")
    .action(async (options: StatusOptions) => {
      // A status bar that hangs up early must not get a stack trace.
      process.stdout.once("error", () => exit(0));
      const text = await runStatus(options, sources);
      // Exit explicitly: a timed-out request would otherwise hold the process
      // open, and a status bar runs this every few seconds.
      if (text) process.stdout.write(`${text}\n`, () => exit(0)); else exit(0);
    });
}
