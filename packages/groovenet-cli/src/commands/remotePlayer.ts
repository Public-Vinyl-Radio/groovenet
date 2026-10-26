import { EventEmitter } from "node:events";
import { GroovenetClient, loadConfig, type Track } from "@groovenet/client";
import { serverPlayerCommandSchema, type ServerPlayer, type ServerPlayerCommandInput, type ServerPlayerDevice } from "@groovenet/contracts";
import type { PlaybackSnapshot } from "@groovenet/player";

export interface PlayerController extends EventEmitter {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
}

export interface RemoteSnapshot extends PlaybackSnapshot {
  remote: { player: ServerPlayer; connected: boolean };
}

type Edit = ServerPlayerCommandInput extends infer C ? C extends { type: string } ? Omit<C, "expected_revision"> : never : never;

export function makeRemoteApi(): GroovenetClient {
  const config = loadConfig();
  return new GroovenetClient({ baseUrl: config.api_base, apiKey: config.api_key,
    playerApiKey: process.env.PLAYER_API_KEY || config.player_api_key,
    insecureTls: config.insecure_tls, clientName: "cli" });
}

/** Adapts the shared server API to the local TUI's controls; owns no audio engine. */
export class RemotePlayerController extends EventEmitter implements PlayerController {
  private player?: ServerPlayer;
  private connected = false;
  private closed = false;
  private abort?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private busy = false;

  constructor(readonly api: GroovenetClient, readonly playerId: string,
    readonly policy: { allow_unknown?: boolean; takeover?: boolean } = {}) { super(); }

  private snapshot(): RemoteSnapshot {
    const player = this.player!;
    const queue = player.state.queue.map((entry) => ({ id: entry.id, track: { ...entry } as unknown as Track }));
    return { ...player.state, current: queue.find((entry) => entry.id === player.state.current_entry_id) ?? null,
      queue, error: player.state.error as PlaybackSnapshot["error"], remote: { player, connected: this.connected } };
  }

  private publish(): void { this.emit("event", { event: "state", data: this.snapshot() }); }
  private problem(message: string): void { this.emit("event", { event: "error", data: { error: { message } } }); }

  async refresh(): Promise<RemoteSnapshot> {
    const player = await this.api.getServerPlayer(this.playerId);
    if (this.closed) throw new Error("Remote controller is closed.");
    if (!this.player || player.revision >= this.player.revision) this.player = player;
    this.connected = true;
    this.publish();
    return this.snapshot();
  }

  startEvents(): void {
    if (this.closed) return;
    this.abort?.abort();
    clearTimeout(this.timer);
    void this.subscribe();
  }

  private async subscribe(): Promise<void> {
    const generation = ++this.generation;
    const abort = this.abort = new AbortController();
    let worker: string | undefined;
    let sequence = -1;
    try {
      for await (const event of this.api.serverPlayerEvents(this.playerId, abort.signal)) {
        if (this.closed || generation !== this.generation) return;
        if (!worker) {
          if (event.type !== "snapshot" || event.player.id !== this.playerId) continue;
          worker = event.worker_instance;
        }
        if (event.worker_instance !== worker || event.sequence <= sequence) continue;
        sequence = event.sequence;
        if (event.type === "snapshot") {
          if (event.player.id !== this.playerId || (this.player && event.player.revision < this.player.revision)) continue;
          this.player = event.player;
          this.connected = true;
        } else {
          if (!this.player || event.player_id !== this.playerId || event.revision !== this.player.revision || event.current_entry_id !== this.player.state.current_entry_id) continue;
          this.player = { ...this.player, state: { ...this.player.state, position: event.position, duration: event.duration } };
        }
        this.publish();
      }
      if (!this.closed) throw new Error("Remote event connection lost.");
    } catch (error) {
      if (this.closed || generation !== this.generation) return;
      this.connected = false;
      if (this.player) this.publish();
      this.problem(`${error instanceof Error ? error.message : String(error)} Reconnecting for a fresh snapshot; server audio continues.`);
      this.timer = setTimeout(() => { void this.subscribe(); }, 1000);
    }
  }

  private async edit(command: Edit): Promise<RemoteSnapshot> {
    if (!this.connected || !this.player) throw new Error("Remote player is disconnected. Wait for a fresh snapshot; no local fallback.");
    if (this.busy) throw new Error("A remote command is already in progress.");
    this.busy = true;
    try {
      const result = await this.api.commandServerPlayer(this.playerId, { ...command, expected_revision: this.player.revision });
      if (this.closed) throw new Error("Remote controller is closed.");
      if (result.player.revision >= this.player.revision) this.player = result.player;
      this.publish();
      if (result.transfer && (!result.transfer.detached || ("play" in command && command.play && !result.transfer.attached) || result.transfer.error)) {
        throw new Error(`Transfer: detached=${result.transfer.detached}, attached=${result.transfer.attached}. ${result.transfer.error?.code ?? "INCOMPLETE"}: ${result.transfer.error?.message ?? "Transfer incomplete"}`);
      }
      return this.snapshot();
    } catch (error) {
      // Commands are never replayed, including ambiguous transport failures.
      try { await this.refresh(); } catch { this.connected = false; this.publish(); }
      throw error;
    } finally { this.busy = false; }
  }

  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.closed) throw new Error("Remote controller is closed.");
    const value = await this.dispatch(method, params);
    return value as T;
  }

  private async dispatch(method: string, p: Record<string, unknown>): Promise<unknown> {
    if (method === "status") return this.refresh();
    if (!this.player) await this.refresh();
    if (method === "queue.list") return this.snapshot().queue;
    if (method === "devices") {
      const devices = await this.api.listServerPlayerDevices(this.playerId);
      return devices.map((device) => ({ ...device, name: formatRemoteDevice(device) }));
    }
    const policy = { ...this.policy, ...(p.allow_unknown === true ? { allow_unknown: true } : {}), ...(p.takeover === true ? { takeover: true } : {}) };
    if (method === "queue.replace") {
      const { expected_revision, ...replacement } = serverPlayerCommandSchema.parse({ ...p, type: "queue.replace", ...policy, expected_revision: 0 });
      void expected_revision;
      return this.edit(replacement);
    }
    if (method === "queue.addTrack") {
      const track = p.track as Track;
      return this.edit({ type: "queue.add", tracks: [{ track_id: track.track_id, friend_id: track.friend_id }] });
    }
    if (method === "queue.add") {
      if (!p.playlistId && (typeof p.query !== "string" || !p.query.trim())) throw new Error("Provide a search query or --playlist-id.");
      const tracks = p.playlistId
        ? (await this.api.getPlaylistTracks(String(p.playlistId))).track_refs
        : (await this.api.searchTracks({ query: String(p.query), limit: 30 })).tracks;
      return this.edit({ type: "queue.add", tracks: tracks.map((track) => ({ track_id: track.track_id, friend_id: track.friend_id })) });
    }
    if (method === "queue.remove" || method === "queue.move" || method === "play") {
      const entry = p.id !== undefined ? this.player!.state.queue.find((entry) => entry.id === p.id)
        : p.index !== undefined ? this.player!.state.queue[Number(p.index)] : undefined;
      if ((p.id !== undefined || p.index !== undefined) && !entry) throw new Error("Queue entry no longer exists. Refresh and select again.");
      if (method === "play") return this.edit({ type: "play", ...policy, ...(entry ? { entry_id: entry.id } : {}) });
      if (!entry) throw new Error("Select a queue entry.");
      return method === "queue.remove" ? this.edit({ type: "queue.remove", entry_id: entry.id })
        : this.edit({ type: "queue.move", entry_id: entry.id, to: Number(p.to) });
    }
    if (method === "devices.transfer") {
      const devices = await this.api.listServerPlayerDevices(this.playerId);
      const sourceId = devices.find((device) => device.id === p.id)?.assigned_player_id;
      if (!sourceId || sourceId === this.playerId) throw new Error("Output has no other Groovenet owner. Select it normally.");
      const source = await this.api.getServerPlayer(sourceId);
      return this.edit({ type: "output.transfer", ...policy, output_id: String(p.id), from_player_id: sourceId, from_revision: source.revision, play: true });
    }
    if (method === "devices.select") return this.edit({ type: "output.select", ...policy, output_id: String(p.id) });
    if (method === "seek") return this.edit({ type: "seek", seconds: Number(p.seconds) });
    if (method === "volume") return this.edit({ type: "volume", volume: Number(p.volume) });
    if (method === "prev") return this.edit({ type: "previous", ...policy });
    if (method === "next" || method === "resume") return this.edit({ type: method, ...policy });
    if (method === "pause" || method === "stop" || method === "queue.clear") return this.edit({ type: method });
    if (method === "shutdown") return this.edit({ type: "stop" });
    throw new Error(`Unsupported remote command: ${method}`);
  }

  async close(): Promise<void> {
    this.closed = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.abort?.abort();
    this.removeAllListeners();
  }
}

export function formatRemoteDevice(device: ServerPlayerDevice): string {
  return `${device.name} · activity=${device.observed.availability} · assigned=${device.assigned_player_id ?? "none"} · desired=${device.desired_by.join(",") || "none"} · entity=${device.observed.entity_id ?? "unmapped"} · sender=${device.observed.sender_identity}${device.observed.sender_engine_id ? `(${device.observed.sender_engine_id})` : ""} · observed=${device.observed.observed_at ?? "unavailable"}`;
}
