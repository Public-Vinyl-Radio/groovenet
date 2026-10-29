import { createConnection, type Socket } from "node:net";
import type { Track } from "@groovenet/client";
import {
  PlayerControlClient,
  PlayerProtocolError,
  defaultPlayerPaths,
  type AudioDevice,
  type PlaybackSnapshot,
  type QueueEntry,
} from "@groovenet/player";

/** Per-request limit; queue.add runs a library search or playlist lookup in the daemon. */
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** Slack past the request limit before the wall-clock cap, which also covers a socket that never connects. */
const CALL_TIMEOUT_MARGIN_MS = 500;

const START_HINT =
  "Start it with `groovenet player start --detach` (the MCP server never starts the daemon itself).";

/** Raw tool arguments; every field is validated before use. */
export type PlayerToolArgs = Record<string, unknown>;

export interface PlayerToolDeps {
  /** Turns `{ track_id, friend_id? }` refs into full tracks, in order. */
  resolveTracks: (items: Array<Record<string, unknown>>, argName: string) => Promise<Track[]>;
}

export const PLAYER_TOOL_NAMES: readonly string[] = [
  "player_status",
  "player_play",
  "player_pause",
  "player_resume",
  "player_next",
  "player_previous",
  "player_seek",
  "player_volume",
  "player_queue_list",
  "player_queue_add",
  "player_queue_remove",
  "player_devices",
  "player_select_device",
];

const NO_ARGS = { type: "object", properties: {} } as const;
const DAEMON_NOTE =
  "Talks to the local Groovenet player daemon (start it with `groovenet player start --detach`).";

export const playerTools = [
  {
    name: "player_status",
    description: `Show what the local player is doing: status (stopped, loading, playing, paused, ended, error), the current track with BPM and key, position and duration, volume, and the queue with each entry's zero-based index and id. ${DAEMON_NOTE}`,
    inputSchema: NO_ARGS,
  },
  {
    name: "player_play",
    description:
      "Start playback, or resume if paused. With `index`, jump to that zero-based queue position (see player_status / player_queue_list). Fails if the queue is empty or the index is out of range; tracks without downloaded audio are skipped by the daemon.",
    inputSchema: {
      type: "object",
      properties: {
        index: {
          type: "integer",
          minimum: 0,
          description: "Zero-based queue index to play; omit to play from the current position",
        },
      },
    },
  },
  { name: "player_pause", description: "Pause playback.", inputSchema: NO_ARGS },
  { name: "player_resume", description: "Resume paused playback.", inputSchema: NO_ARGS },
  {
    name: "player_next",
    description: "Skip to the next track in the queue.",
    inputSchema: NO_ARGS,
  },
  {
    name: "player_previous",
    description: "Go back to the previous track in the queue.",
    inputSchema: NO_ARGS,
  },
  {
    name: "player_seek",
    description: "Seek within the current track to an absolute position.",
    inputSchema: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          minimum: 0,
          description: "Position in seconds from the start of the track",
        },
      },
      required: ["seconds"],
    },
  },
  {
    name: "player_volume",
    description: "Set the player volume.",
    inputSchema: {
      type: "object",
      properties: {
        volume: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "Volume percentage, 0-100",
        },
      },
      required: ["volume"],
    },
  },
  {
    name: "player_queue_list",
    description:
      "List the playback queue with each entry's zero-based index and id (use these with player_play and player_queue_remove).",
    inputSchema: NO_ARGS,
  },
  {
    name: "player_queue_add",
    description:
      "Append tracks to the end of the queue; playback is not started (call player_play). Supply exactly one of: `query` (library search, like search_tracks lexical), `playlist_id` (a saved playlist, in its saved order), or `tracks` (refs as returned by search_tracks, so its results can be queued directly). Tracks without downloaded audio are skipped by the daemon when played.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          description: "Search text; matching tracks are queued",
        },
        playlist_id: {
          type: ["string", "integer"],
          description: "Playlist ID (from list_playlists)",
        },
        tracks: {
          type: "array",
          minItems: 1,
          description: "Tracks to queue, as references",
          items: {
            type: "object",
            properties: {
              track_id: {
                type: "string",
                minLength: 1,
                description: "The track ID (string, from search_tracks, NOT the numeric `id`)",
              },
              friend_id: {
                type: "number",
                description:
                  "Friend who owns the track (defaults to the configured default friend)",
              },
            },
            required: ["track_id"],
          },
        },
      },
    },
  },
  {
    name: "player_queue_remove",
    description:
      "Remove one entry from the queue. Supply exactly one of `id` or `index` (both shown by player_queue_list).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, description: "Queue entry id" },
        index: { type: "integer", minimum: 0, description: "Zero-based queue index" },
      },
    },
  },
  {
    name: "player_devices",
    description:
      "List the audio output devices mpv can use, with the ids player_select_device takes.",
    inputSchema: NO_ARGS,
  },
  {
    name: "player_select_device",
    description: "Switch audio output to a device from player_devices.",
    inputSchema: {
      type: "object",
      properties: {
        device_id: { type: "string", minLength: 1, description: "Device id from player_devices" },
      },
      required: ["device_id"],
    },
  },
];

/** `GROOVENET_PLAYER_TIMEOUT_MS` overrides the per-request limit (mainly for tests). */
export function playerTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.GROOVENET_PLAYER_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

export function playerSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GROOVENET_PLAYER_SOCKET?.trim() || defaultPlayerPaths().socketPath;
}

/** Turns a failure from the control client into a message that says what to do next. */
export function describePlayerError(error: unknown, socketPath: string): string {
  if (error instanceof PlayerProtocolError) {
    switch (error.code) {
      case "DAEMON_UNAVAILABLE":
        return `The player daemon is not running (no live socket at ${socketPath}, or it is stale). ${START_HINT}`;
      case "DAEMON_DISCONNECTED":
        return `The player daemon closed the connection. It may have stopped; check with player_status. ${START_HINT}`;
      case "REQUEST_TIMEOUT":
      case "PLAYER_TIMEOUT":
        return `The player daemon did not answer in time (${error.message}). It may be hung; restart it with \`groovenet player stop\` then \`groovenet player start --detach\`.`;
      case "VERSION_MISMATCH":
        return `Player protocol version mismatch: ${error.message} Update the MCP server and the groovenet CLI together, then restart the daemon.`;
      default:
        return `Player daemon error (${error.code}): ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs `action` over a fresh connection and always tears it down, including on
 * errors and timeouts. The socket is tracked so a connect that never completes
 * cannot outlive the call.
 */
async function withPlayer<T>(
  socketPath: string,
  action: (client: PlayerControlClient) => Promise<T>,
): Promise<T> {
  const sockets: Socket[] = [];
  const requestTimeout = playerTimeoutMs();
  const client = new PlayerControlClient(socketPath, requestTimeout, (path) => {
    const socket = createConnection(path);
    sockets.push(socket);
    return socket;
  });
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new PlayerProtocolError("PLAYER_TIMEOUT", "no response from the player daemon")),
      requestTimeout + CALL_TIMEOUT_MARGIN_MS,
    );
  });
  try {
    return await Promise.race([action(client), deadline]);
  } catch (error) {
    throw new Error(describePlayerError(error, socketPath), { cause: error });
  } finally {
    clearTimeout(timer);
    await client.close();
    for (const socket of sockets) socket.destroy();
  }
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function describeTrack(track: Track): string {
  const facts = [track.bpm ? `${track.bpm} BPM` : "", track.key ?? ""].filter(Boolean).join(", ");
  return `${track.title} - ${track.artist}${facts ? ` (${facts})` : ""}`;
}

function describeEntry(entry: QueueEntry, index: number, currentId?: string): string {
  return `${entry.id === currentId ? "▶" : " "} [${index}] ${describeTrack(entry.track)} | id=${entry.id}`;
}

function describeQueue(queue: QueueEntry[], currentId?: string): string {
  if (queue.length === 0) return "Queue is empty.";
  return `Queue (${queue.length}):\n${queue.map((entry, i) => describeEntry(entry, i, currentId)).join("\n")}`;
}

function describeSnapshot(snapshot: PlaybackSnapshot): string {
  const lines = [`Status: ${snapshot.status}`];
  const { current } = snapshot;
  if (current) {
    const index = snapshot.queue.findIndex((entry) => entry.id === current.id);
    lines.push(
      `Current: ${describeTrack(current.track)} | id=${current.id}${index >= 0 ? ` index=${index}` : ""}`,
    );
    lines.push(
      `Position: ${formatClock(snapshot.position)}${snapshot.duration == null ? "" : ` / ${formatClock(snapshot.duration)}`}`,
    );
  }
  lines.push(`Volume: ${snapshot.volume}%`);
  if (snapshot.error) lines.push(`Error: ${snapshot.error.message}`);
  lines.push(describeQueue(snapshot.queue, current?.id));
  return lines.join("\n");
}

function describeDevices(devices: AudioDevice[]): string {
  if (devices.length === 0) return "No audio output devices reported.";
  return `Audio devices (${devices.length}):\n${devices.map((d) => `• ${d.name}${d.description ? ` — ${d.description}` : ""} | id=${d.id}`).join("\n")}`;
}

function requireNumber(
  value: unknown,
  name: string,
  bounds: { min: number; max?: number },
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < bounds.min ||
    (bounds.max !== undefined && value > bounds.max)
  ) {
    throw new Error(
      `${name} must be a number ${bounds.max === undefined ? `>= ${bounds.min}` : `from ${bounds.min} to ${bounds.max}`}`,
    );
  }
  return value;
}

function requireIndex(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer (zero-based queue index)`);
  }
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${name} must be a nonempty string`);
  return value;
}

function describeAdded(added: QueueEntry[], queueSize: number | undefined): string {
  if (added.length === 0) return "No tracks were added (nothing matched).";
  const start = queueSize === undefined ? undefined : queueSize - added.length;
  const lines = added.map((entry, i) =>
    start === undefined
      ? `• ${describeTrack(entry.track)} | id=${entry.id}`
      : describeEntry(entry, start + i),
  );
  return `Added ${added.length} track${added.length === 1 ? "" : "s"} to the queue:\n${lines.join("\n")}`;
}

/** Handles one `player_*` tool call. Arguments are validated before any connection is made. */
export async function handlePlayerTool(
  name: string,
  args: PlayerToolArgs,
  deps: PlayerToolDeps,
  socketPath = playerSocketPath(),
) {
  const snapshotCall = async (method: string, params?: Record<string, unknown>) =>
    text(
      describeSnapshot(
        await withPlayer(socketPath, (client) => client.request<PlaybackSnapshot>(method, params)),
      ),
    );

  switch (name) {
    case "player_status":
      return snapshotCall("status");
    case "player_play": {
      if (args.index === undefined) return snapshotCall("play");
      return snapshotCall("play", { index: requireIndex(args.index, "index") });
    }
    case "player_pause":
      return snapshotCall("pause");
    case "player_resume":
      return snapshotCall("resume");
    case "player_next":
      return snapshotCall("next");
    case "player_previous":
      return snapshotCall("prev");
    case "player_seek":
      return snapshotCall("seek", { seconds: requireNumber(args.seconds, "seconds", { min: 0 }) });
    case "player_volume":
      return snapshotCall("volume", {
        volume: requireNumber(args.volume, "volume", { min: 0, max: 100 }),
      });
    case "player_queue_list": {
      const snapshot = await withPlayer(socketPath, (client) =>
        client.request<PlaybackSnapshot>("status"),
      );
      return text(describeQueue(snapshot.queue, snapshot.current?.id));
    }
    case "player_queue_add": {
      const given = [args.query, args.playlist_id, args.tracks].filter(
        (value) => value !== undefined,
      );
      if (given.length !== 1) throw new Error("Supply exactly one of query, playlist_id or tracks");
      if (args.query !== undefined) {
        const query = requireString(args.query, "query");
        return queueAdd(socketPath, (client) =>
          client.request<QueueEntry[]>("queue.add", { query }),
        );
      }
      if (args.playlist_id !== undefined) {
        const playlistId = args.playlist_id;
        if (
          (typeof playlistId !== "string" || playlistId.trim() === "") &&
          !(typeof playlistId === "number" && Number.isFinite(playlistId))
        ) {
          throw new Error("playlist_id must be a nonempty string or a number");
        }
        return queueAdd(socketPath, (client) =>
          client.request<QueueEntry[]>("queue.add", { playlistId }),
        );
      }
      if (!Array.isArray(args.tracks))
        throw new Error("tracks must be an array of { track_id, friend_id? }");
      // Resolve before connecting so a bad ref never opens a socket.
      const tracks = await deps.resolveTracks(
        args.tracks as Array<Record<string, unknown>>,
        "tracks",
      );
      return queueAdd(socketPath, async (client) => {
        const added: QueueEntry[] = [];
        for (const track of tracks)
          added.push(...(await client.request<QueueEntry[]>("queue.addTrack", { track })));
        return added;
      });
    }
    case "player_queue_remove": {
      if ((args.id === undefined) === (args.index === undefined))
        throw new Error("Supply exactly one of id or index");
      const params =
        args.id !== undefined
          ? { id: requireString(args.id, "id") }
          : { index: requireIndex(args.index, "index") };
      const removed = await withPlayer(socketPath, (client) =>
        client.request<QueueEntry>("queue.remove", params),
      );
      return text(`Removed from the queue: ${describeTrack(removed.track)} | id=${removed.id}`);
    }
    case "player_devices":
      return text(
        describeDevices(
          await withPlayer(socketPath, (client) => client.request<AudioDevice[]>("devices")),
        ),
      );
    case "player_select_device": {
      const id = requireString(args.device_id, "device_id");
      return text(
        `Selected audio device ${id}.\n${describeDevices(await withPlayer(socketPath, (client) => client.request<AudioDevice[]>("devices.select", { id })))}`,
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/** Adds entries, then reads the queue back so the reply shows their final indexes. */
async function queueAdd(
  socketPath: string,
  add: (client: PlayerControlClient) => Promise<QueueEntry[]>,
) {
  const { added, queue } = await withPlayer(socketPath, async (client) => {
    const added = await add(client);
    const snapshot = await client.request<PlaybackSnapshot>("status");
    return { added, queue: snapshot.queue };
  });
  return text(describeAdded(added, queue.length));
}
