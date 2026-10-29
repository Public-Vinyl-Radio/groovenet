import { EventEmitter } from "node:events";
import { vi } from "vitest";
import type { GroovenetClient, Track } from "@groovenet/client";
import type {
  ServerPlayer,
  ServerPlayerCommandInput,
  ServerPlayerDevice,
} from "@groovenet/contracts";
import type { PlaybackSnapshot } from "@groovenet/player";
import { PlayerTargets } from "../src/commands/playerTuiTargets.js";
import { RemotePlayerController, type PlayerController } from "../src/commands/remotePlayer.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
export const ref = { track_id: "same", friend_id: 2 };
export function server(
  id = "lounge",
  status: ServerPlayer["state"]["status"] = "playing",
): ServerPlayer {
  const entry = {
    ...ref,
    id: "00000000-0000-4000-8000-000000000001",
    title: "Blue Train",
    artist: "John Coltrane",
  };
  return {
    id,
    name: id.toUpperCase(),
    engine_id: "primary",
    revision: 3,
    assigned_output: "speaker",
    availability_policy: "ask",
    state: {
      status,
      queue: [entry],
      current_entry_id: status === "stopped" ? null : entry.id,
      position: 12,
      duration: 180,
      volume: 50,
      desired_output: "speaker",
      checkpoint: false,
      error: null,
    },
  };
}
export function fixture(status: PlaybackSnapshot["status"] = "playing", empty = false) {
  const queue = empty
    ? []
    : [1, 2, 2, 3].map((friend_id, i) => ({
        id: `local-${i}`,
        track: { ...ref, friend_id, title: `Local ${i}`, artist: "Artist" } as Track,
      }));
  let snapshot: PlaybackSnapshot = {
    status,
    queue,
    current: status === "stopped" || status === "ended" ? null : (queue[1] ?? null),
    position: 12,
    duration: 180,
    volume: 50,
    error: null,
  };
  const control = Object.assign(new EventEmitter(), {
    request: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "pause" || method === "stop")
        snapshot = {
          ...snapshot,
          status: method === "pause" ? "paused" : "stopped",
          ...(method === "stop" ? { current: null } : {}),
        };
      if (method === "queue.remove")
        snapshot = { ...snapshot, queue: snapshot.queue.filter((e) => e.id !== params?.id) };
      return snapshot;
    }),
    close: vi.fn(async () => {}),
  });
  const states = new Map(["lounge", "study"].map((id) => [id, server(id)]));
  const observers = new Map<string, { event: (value: unknown) => void; disconnect: () => void }>();
  const api = {
    getServerPlayer: vi.fn(async (id: string) => states.get(id)!),
    commandServerPlayer: vi.fn(async (id: string, command: ServerPlayerCommandInput) => {
      const state = states.get(id)!;
      if (command.expected_revision !== undefined && command.expected_revision !== state.revision)
        throw Object.assign(new Error("REVISION_CONFLICT"), {
          data: { code: "REVISION_CONFLICT" },
        });
      const player = { ...state, revision: state.revision + 1 };
      if (command.type === "session.join")
        player.state = {
          ...state.state,
          queue: [
            ...state.state.queue,
            ...command.tracks.map((track, i) => ({
              ...track,
              id: `joined-${i}`,
              title: "Joined",
              artist: "Artist",
            })),
          ],
          status: "playing",
        };
      states.set(id, player);
      return { player };
    }),
    listServerPlayers: vi.fn(async () => [...states.values()]),
    listServerPlayerDevices: vi.fn(async (): Promise<ServerPlayerDevice[]> => []),
    serverPlayerEvents: vi.fn(async function* (id: string, signal: AbortSignal) {
      yield { type: "snapshot", player: states.get(id), worker_instance: "worker", sequence: 1 };
      while (!signal.aborted) {
        const result = await new Promise<unknown>((resolve) => {
          observers.set(id, { event: resolve, disconnect: () => resolve(null) });
          signal.addEventListener("abort", () => resolve(null), { once: true });
        });
        if (!result) return;
        yield result;
      }
    }),
  };
  const remotes: RemotePlayerController[] = [];
  const createRemote = (id: string) => {
    const remote = new RemotePlayerController(api as unknown as GroovenetClient, id);
    remotes.push(remote);
    return remote;
  };
  const local = { control: control as PlayerController, snapshot, id: "" };
  const targets = new PlayerTargets(
    local,
    api as unknown as GroovenetClient,
    async () => ({ ...local, snapshot }),
    createRemote,
  );
  const preview = async (id = "lounge") => {
    await targets.previewTarget(id);
    await tick();
  };
  return {
    targets,
    control,
    api,
    preview,
    states,
    remotes,
    observers,
    local,
    snapshot: () => snapshot,
    update: (next: PlaybackSnapshot) => {
      snapshot = next;
    },
  };
}
