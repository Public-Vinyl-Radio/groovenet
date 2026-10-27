import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { createServerPlayerSchema, serverPlayerCommandSchema, type CreateServerPlayer, type ServerPlayer, type ServerPlayerCommand, type ServerPlayerCommandResult, type ServerPlayerDevice, type SpeakerObservation } from "@groovenet/contracts";
import { audioSource } from "../resolver.js";
import { PlayerError, type PlaybackBackend } from "../types.js";
import { advanceProgress, initialProgress, isPlay, type ListenProgress } from "../playThreshold.js";
import { ServerPlayerError, type PlayerStore, type ServerPlay } from "./store.js";

export interface PlayerEngine {
  libraryRoot: string;
  create(outputId?: string): PlaybackBackend;
}
export type SpeakerObserver = (outputId: string, context?: { outputName?: string; resolveOutputName?: () => Promise<string | undefined>; fresh?: boolean }) => Promise<SpeakerObservation>;
export const unknownSpeaker = (): SpeakerObservation => ({ availability: "unknown", observed_at: null, source: "unconfigured", sender_identity: "unknown" });
interface Runtime { backend: PlaybackBackend; generation: number; }
export interface ServerPlayLogging {
  ownerFriendId: number;
  logPlay: (play: ServerPlay) => Promise<void>;
  now?: () => Date;
}
const errorValue = (error: unknown) => error instanceof PlayerError || error instanceof ServerPlayerError ? { code: error.code, message: error.message } : { code: "PLAYER_OPERATION_FAILED", message: "Player operation failed" };
const clone = <T>(value: T): T => structuredClone(value);

/** Owns all player lifecycles; no HTTP connection owns a backend. */
export class ServerPlayerManager extends EventEmitter {
  private players = new Map<string, ServerPlayer>();
  private runtimes = new Map<string, Runtime>();
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private stopping = false;
  private checkpointAt = new Map<string, number>();
  private progress = new Map<string, { listened: ListenProgress; startedAt: Date }>();
  private queuedPlays = new Set<string>();
  private retrying = false;

  constructor(private readonly store: PlayerStore, private readonly engines: Record<string, PlayerEngine>, private readonly observe: SpeakerObserver = async () => unknownSpeaker(), private readonly playLogging?: ServerPlayLogging) { super(); }

  /** Retry durable deliveries independently of queue changes and playback. */
  async retryPlays(): Promise<void> {
    if (!this.playLogging || this.retrying || this.stopping) return;
    this.retrying = true;
    try {
      for (const play of await this.store.pendingPlays()) {
        try {
          await this.playLogging.logPlay(play);
          await this.store.markPlayLogged(play.entryId);
        } catch (error) { this.emit("play-log-error", error); }
      }
    } catch (error) { this.emit("play-log-error", error); }
    finally { this.retrying = false; }
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }

  async initialize(): Promise<void> {
    // No engine object or network connection is created during restoration.
    for (const saved of await this.store.list()) {
      const player = clone(saved);
      player.assigned_output = null;
      player.state.status = "stopped";
      player.state.checkpoint = true;
      this.players.set(player.id, await this.store.save(player, saved.revision));
    }
  }

  engineIds(): string[] { return Object.keys(this.engines).sort(); }
  list(): ServerPlayer[] { return [...this.players.values()].map(clone); }
  get(id: string): ServerPlayer {
    const player = this.players.get(id);
    if (!player) throw new ServerPlayerError("PLAYER_NOT_FOUND", "Player does not exist", 404);
    return clone(player);
  }

  create(input: CreateServerPlayer): Promise<ServerPlayer> {
    return this.serial(async () => {
      this.available();
      const parsed = createServerPlayerSchema.parse(input);
      if (!this.engines[parsed.engine_id]) throw new ServerPlayerError("ENGINE_NOT_CONFIGURED", "Engine is not configured on this server", 400);
      const player = await this.store.create(parsed, { queue: [], current_entry_id: null, status: "stopped", position: 0, duration: null, volume: 50, desired_output: null, checkpoint: false, error: null });
      this.players.set(player.id, player);
      this.publish(player);
      return clone(player);
    });
  }

  async devices(id: string): Promise<ServerPlayerDevice[]> {
    const player = this.get(id);
    const runtime = this.runtimes.get(id);
    const backend = runtime?.backend ?? this.engine(player).create();
    try {
      const outputs = await backend.listDevices();
      const nameCounts = new Map<string, number>();
      for (const output of outputs) nameCounts.set(output.name, (nameCounts.get(output.name) ?? 0) + 1);
      return await Promise.all(outputs.map(async (output) => ({ ...output,
        assigned_player_id: this.list().find((p) => p.assigned_output === output.id)?.id ?? null,
        desired_by: this.list().filter((p) => p.state.desired_output === output.id).map((p) => p.id),
        observed: await this.observe(output.id, { outputName: nameCounts.get(output.name) === 1 ? output.name : undefined }),
      })));
    } finally { if (!runtime) await backend.close(); }
  }

  command(id: string, input: ServerPlayerCommand): Promise<ServerPlayerCommandResult> {
    return this.serial(async () => {
      this.available();
      const command = serverPlayerCommandSchema.parse(input);
      let player = this.get(id);
      if (command.expected_revision !== undefined) this.revision(player, command.expected_revision);
      if (command.type === "output.transfer") return this.transfer(player, command);
      try {
        switch (command.type) {
          case "rename": player.name = command.name; break;
          case "availability.set": player.availability_policy = command.availability_policy; break;
          case "session.join":
          case "queue.add": {
            const at = command.type === "queue.add" ? command.at ?? player.state.queue.length : player.state.queue.length;
            if (at > player.state.queue.length || player.state.queue.length + command.tracks.length > 10000) throw new ServerPlayerError("INVALID_QUEUE", "Queue insertion is out of range", 400);
            const added = [];
            for (const ref of command.tracks) {
              const track = await this.store.resolve(ref);
              if (!track) throw new ServerPlayerError("TRACK_NOT_FOUND", "Queued track does not exist or is ambiguous", 404);
              added.push({ ...ref, id: randomUUID(), title: track.title, artist: track.artist });
            }
            player.state.queue.splice(at, 0, ...added);
            if (command.type === "session.join" && (player.state.current_entry_id === null || player.state.status === "stopped" || player.state.status === "ended")) {
              await this.play(player, added[0]!.id, command, false);
              return { player: this.get(id) };
            }
            break;
          }
          case "queue.remove": {
            const index = player.state.queue.findIndex((entry) => entry.id === command.entry_id);
            if (index < 0) throw new ServerPlayerError("ENTRY_NOT_FOUND", "Queue entry does not exist", 404);
            if (command.entry_id === player.state.current_entry_id) await this.stop(player);
            player.state.queue.splice(index, 1);
            break;
          }
          case "queue.move": {
            const index = player.state.queue.findIndex((entry) => entry.id === command.entry_id);
            if (index < 0) throw new ServerPlayerError("ENTRY_NOT_FOUND", "Queue entry does not exist", 404);
            if (command.to >= player.state.queue.length) throw new ServerPlayerError("INVALID_QUEUE", "Queue move is out of range", 400);
            player.state.queue.splice(command.to, 0, player.state.queue.splice(index, 1)[0]!);
            break;
          }
          case "queue.replace": return { player: await this.replaceQueue(player, command) };
          case "queue.clear": await this.stop(player); player.state.queue = []; break;
          case "output.select":
            if (this.runtimes.has(id)) await this.stop(player, true);
            player.state.desired_output = command.output_id;
            // Remembering a desired output does not reserve or connect it.
            break;
          case "play": {
            const entryId = command.entry_id ?? player.state.current_entry_id ?? player.state.queue[0]?.id;
            await this.play(player, entryId, command); return { player: this.get(id) };
          }
          case "resume":
            if (this.runtimes.has(id)) {
              const backend = this.runtimes.get(id)!.backend;
              if (await backend.outputConnection?.() !== "connected") await this.requireAvailable(player, player.state.desired_output!, command);
              await backend.pause(false);
              player.state.status = "playing"; player.state.checkpoint = false;
            } else { await this.play(player, player.state.current_entry_id ?? undefined, command); return { player: this.get(id) }; }
            break;
          case "pause":
            await this.active(id).backend.pause(true); player.state.status = "paused"; break;
          case "stop": await this.stop(player); break;
          case "next": case "previous": {
            const index = player.state.queue.findIndex((entry) => entry.id === player.state.current_entry_id);
            const next = command.type === "next" ? index + 1 : Math.max(0, index - 1);
            if (next >= player.state.queue.length) { await this.stop(player); player.state.status = "ended"; }
            else { await this.play(player, player.state.queue[next]?.id, command, false); return { player: this.get(id) }; }
            break;
          }
          case "seek":
            if (!player.state.current_entry_id) throw new ServerPlayerError("NO_CURRENT_TRACK", "No current track", 400);
            if (this.runtimes.has(id)) await this.active(id).backend.seek(command.seconds);
            player.state.position = command.seconds; player.state.checkpoint = !this.runtimes.has(id); break;
          case "volume":
            if (this.runtimes.has(id)) await this.active(id).backend.setVolume(command.volume);
            player.state.volume = command.volume; break;
        }
        // Queue/settings edits do not recover failed playback. Keep its cause
        // visible until a transport command successfully leaves the error state.
        if (player.state.status !== "error") player.state.error = null;
        player = await this.save(player);
        return { player: clone(player) };
      } catch (error) {
        // Validation failures do not mutate authoritative state. Engine operations
        // persist an actionable error; they never advance or silently retry.
        if (!(error instanceof ServerPlayerError)) {
          player = this.get(id);
          player.state.status = "error";
          player.state.error = errorValue(error);
          await this.save(player);
        }
        throw error;
      }
    });
  }

  private async replaceQueue(player: ServerPlayer, command: Extract<ServerPlayerCommand, { type: "queue.replace" }>): Promise<ServerPlayer> {
    // Resolve and validate the entire replacement before touching playback or
    // saving anything. A bad final entry cannot leave a half-cleared queue.
    const previousEntries = new Map(player.state.queue.map(entry => [entry.id, entry]));
    const queue = [];
    for (const ref of command.entries) {
      const previous = ref.id ? previousEntries.get(ref.id) : undefined;
      if (previous && (previous.track_id !== ref.track_id || previous.friend_id !== ref.friend_id)) throw new ServerPlayerError("INVALID_QUEUE", "An existing entry ID cannot identify a different track", 400);
      const track = await this.store.resolve(ref).catch(() => {
        throw new ServerPlayerError("TRACK_RESOLUTION_FAILED", "Unable to resolve replacement tracks", 503);
      });
      if (!track) throw new ServerPlayerError("TRACK_NOT_FOUND", "Queued track does not exist or is ambiguous", 404);
      queue.push({ ...ref, id: ref.id ?? randomUUID(), title: track.title, artist: track.artist });
    }
    const retained = queue.some(entry => entry.id === player.state.current_entry_id);
    const current = command.current_entry_id === undefined
      ? (retained ? player.state.current_entry_id : command.play ? queue[0]?.id ?? null : null)
      : command.current_entry_id;
    if (current !== null && !queue.some(entry => entry.id === current)) throw new ServerPlayerError("ENTRY_NOT_FOUND", "Current entry must belong to the replacement queue", 404);
    if (command.play && current === null) throw new ServerPlayerError("ENTRY_NOT_FOUND", "Select a replacement entry before playing", 400);
    const unchanged = current !== null && current === player.state.current_entry_id;
    const position = command.position ?? (unchanged ? player.state.position : 0);
    if (unchanged && this.runtimes.has(player.id)) {
      const backend = this.active(player.id).backend;
      if (command.play && player.state.status !== "playing") {
        if (await backend.outputConnection?.() !== "connected") await this.requireAvailable(player, player.state.desired_output!, command);
        await backend.pause(false);
        player.state.status = "playing";
        player.state.checkpoint = false; player.state.error = null;
      }
      if (position !== player.state.position) await backend.seek(position);
      player.state.queue = queue;
      player.state.position = position;
      return this.save(player);
    }
    if (command.play) {
      // play validates output policy and audio before detaching the old backend.
      player.state.queue = queue;
      player.state.current_entry_id = current;
      player.state.position = position;
      await this.play(player, current!, command);
      return this.get(player.id);
    }
    if (!unchanged) await this.stop(player);
    player.state.queue = queue;
    player.state.current_entry_id = current;
    player.state.position = current === null ? 0 : position;
    player.state.checkpoint = current !== null && !this.runtimes.has(player.id);
    if (player.state.status !== "error") player.state.error = null;
    return this.save(player);
  }

  private async play(player: ServerPlayer, entryId: string | undefined, policy: { allow_unknown: boolean; takeover: boolean }, resumeCheckpoint = true): Promise<void> {
    const entry = player.state.queue.find((entry) => entry.id === entryId);
    if (!entry) throw new ServerPlayerError("ENTRY_NOT_FOUND", "Queue is empty or the entry does not exist", 404);
    const output = player.state.desired_output;
    if (!output) throw new ServerPlayerError("OUTPUT_REQUIRED", "Select a desired output before playing", 400);
    const owner = this.list().find((p) => p.assigned_output === output && p.id !== player.id);
    if (owner) throw new ServerPlayerError("OUTPUT_ASSIGNED", "Speaker belongs to another player; use explicit transfer");
    const needsReconnect = (player.state.status === "paused" || player.state.status === "error") && await this.runtimes.get(player.id)?.backend.outputConnection?.() !== "connected";
    if (player.assigned_output !== output || needsReconnect) await this.requireAvailable(player, output, policy);
    const track = await this.store.resolve(entry);
    const engine = this.engine(player);
    const source = track ? audioSource(track, { apiBase: "http://unused/api", audioLibraryRoot: engine.libraryRoot }) : null;
    if (!source) throw new ServerPlayerError("NO_AUDIO", "Current track has no indexed audio source", 422);
    const position = resumeCheckpoint && player.state.current_entry_id === entry.id ? player.state.position : 0;
    await this.detach(player);
    player.assigned_output = output;
    player.state.current_entry_id = entry.id;
    player.state.position = position;
    player.state.duration = null;
    player.state.status = "loading";
    player.state.checkpoint = false;
    player.state.error = null;
    // Persist the selected entry before engine effects. A crash never replays a
    // completed entry or automatically starts this pending load on restoration.
    player = await this.save(player);
    this.available();
    const backend = engine.create(output);
    const runtime = { backend, generation: ++this.generation };
    this.runtimes.set(player.id, runtime);
    backend.on("position", (position, duration) => this.enqueueEvent(player.id, runtime, async (current) => {
      if (!Number.isFinite(position) || position < 0) return;
      current.state.position = position;
      current.state.duration = duration !== null && Number.isFinite(duration) && duration >= 0 ? duration : null;
      current.state.checkpoint = false;
      const entryId = current.state.current_entry_id;
      if (this.playLogging && entryId && track?.friend_id === this.playLogging.ownerFriendId && track.release_id && !this.queuedPlays.has(entryId)) {
        const listening = this.progress.get(entryId) ?? { listened: initialProgress, startedAt: this.playLogging.now?.() ?? new Date() };
        listening.listened = advanceProgress(listening.listened, position, current.state.status === "playing");
        this.progress.set(entryId, listening);
        if (isPlay(listening.listened.listened, current.state.duration)) {
          const play: ServerPlay = { entryId, playerId: current.id, trackId: entry.track_id, friendId: entry.friend_id, releaseId: track.release_id, startedAt: listening.startedAt };
          try {
            await this.store.queuePlay(play);
            this.queuedPlays.add(entryId);
            void this.retryPlays();
          } catch (error) { this.emit("play-log-error", error); }
        }
      }
      this.players.set(current.id, current);
      this.emit("position", { player_id: current.id, revision: current.revision, current_entry_id: current.state.current_entry_id, position: current.state.position, duration: current.state.duration, observed_at: new Date().toISOString() });
      if (Date.now() - (this.checkpointAt.get(current.id) ?? 0) >= 5000) {
        await this.store.checkpoint(current);
        this.checkpointAt.set(current.id, Date.now());
      }
    }));
    backend.on("ended", () => this.enqueueEvent(player.id, runtime, async (current) => {
      const index = current.state.queue.findIndex((entry) => entry.id === current.state.current_entry_id);
      const next = current.state.queue[index + 1];
      if (next) {
        current.state.current_entry_id = next.id;
        current.state.position = 0;
        current.state.duration = null;
        current.state.status = "loading";
        const advanced = await this.save(current);
        await this.play(advanced, next.id, { allow_unknown: true, takeover: false }, false);
      } else { await this.stop(current); current.state.status = "ended"; await this.save(current); }
    }));
    backend.on("error", (error) => this.enqueueEvent(player.id, runtime, async (current) => {
      current.state.status = "error";
      current.state.error = errorValue(error);
      try { await this.detach(current); } catch { /* retain the uncertain claim */ }
      await this.save(current);
    }));
    try {
      await backend.load(source);
      if (position > 0) await backend.seek(position);
      await backend.setVolume(player.state.volume);
      player.state.status = "playing";
      await this.save(player);
    } catch (error) {
      player = this.get(player.id);
      player.state.status = "error";
      player.state.error = errorValue(error);
      try { await this.detach(player); } catch { /* don't transfer an uncertain claim */ }
      await this.save(player);
      throw error;
    }
  }

  private enqueueEvent(id: string, runtime: Runtime, action: (player: ServerPlayer) => Promise<void>): void {
    void this.serial(async () => {
      if (this.stopping || this.runtimes.get(id)?.generation !== runtime.generation) return;
      try { await action(this.get(id)); }
      catch (error) {
        const current = this.get(id);
        current.state.status = "error";
        current.state.error = errorValue(error);
        try { await this.detach(current); } catch { /* preserve uncertain claim */ }
        await this.save(current);
      }
    }).catch((error: unknown) => { this.emit("fault", error); });
  }

  private async detach(player: ServerPlayer): Promise<void> {
    const runtime = this.runtimes.get(player.id);
    if (runtime) {
      // Invalidate callbacks before awaiting close, including duplicate EOFs.
      this.runtimes.delete(player.id);
      await runtime.backend.close();
    } else if (player.assigned_output !== null) {
      throw new ServerPlayerError("RELEASE_UNCERTAIN", "Previous engine release is uncertain; stop that engine and restart the worker before reassigning", 503);
    }
    player.assigned_output = null;
  }

  private async stop(player: ServerPlayer, preserveCurrent = false): Promise<void> {
    await this.detach(player);
    player.state.status = preserveCurrent && player.state.current_entry_id ? "paused" : "stopped";
    player.state.checkpoint = preserveCurrent && player.state.current_entry_id !== null;
    if (!preserveCurrent) { player.state.current_entry_id = null; player.state.position = 0; player.state.duration = null; }
  }

  private async transfer(target: ServerPlayer, command: Extract<ServerPlayerCommand, { type: "output.transfer" }>): Promise<ServerPlayerCommandResult> {
    if (target.id === command.from_player_id) throw new ServerPlayerError("INVALID_TRANSFER", "Transfer requires two different players", 400);
    let source = this.get(command.from_player_id);
    this.revision(source, command.from_revision);
    if (source.assigned_output !== command.output_id) throw new ServerPlayerError("OUTPUT_NOT_ASSIGNED", "Source player does not own this speaker");
    let detached = false;
    try {
      await this.stop(source, true);
      source = await this.save(source);
      detached = true;
      if (this.runtimes.has(target.id)) { await this.stop(target, true); target = await this.save(target); }
      target.state.desired_output = command.output_id;
      target = await this.save(target);
      if (command.play) await this.play(target, target.state.current_entry_id ?? target.state.queue[0]?.id, command);
      return { player: this.get(target.id), transfer: { from_player: this.get(source.id), detached, attached: command.play, error: null } };
    } catch (error) {
      if (!detached) {
        source.state.status = "error";
        source.state.error = errorValue(error);
        try { await this.save(source); } catch { /* keep the transfer result truthful */ }
      }
      // The source may already be detached. Report each phase; do not reconnect
      // it to pretend the operation was atomic or compete with an external app.
      return { player: this.get(target.id), transfer: { from_player: this.get(source.id), detached, attached: false, error: errorValue(error) } };
    }
  }

  async shutdown(): Promise<void> {
    this.stopping = true;
    await this.serial(async () => {
      for (const player of this.list()) {
        try { await this.stop(player, true); await this.save(player); }
        catch (error) { this.emit("fault", error); }
      }
    });
  }

  private async requireAvailable(player: ServerPlayer, output: string, policy: { allow_unknown: boolean; takeover: boolean }): Promise<void> {
    // Assignment is a Groovenet claim, independent of HA's observation.
    if (this.list().some(other => other.id !== player.id && other.assigned_output === output)) throw new ServerPlayerError("OUTPUT_ASSIGNED", "Speaker belongs to another player; use explicit transfer");
    const observed = await this.observe(output, { fresh: true, resolveOutputName: async () => {
      const runtime = this.runtimes.get(player.id);
      const backend = runtime?.backend ?? this.engine(player).create();
      try {
        const devices = await backend.listDevices();
        const name = devices.find(device => device.id === output)?.name;
        return name && devices.filter(device => device.name === name).length === 1 ? name : undefined;
      }
      finally { if (!runtime) await backend.close(); }
    } });
    const ownSender = observed.sender_identity === "groovenet" && observed.sender_engine_id === player.engine_id;
    if (observed.availability === "occupied" && !ownSender && !policy.takeover && player.availability_policy !== "always") throw new ServerPlayerError("SPEAKER_OCCUPIED", "Observed speaker activity requires explicit takeover");
    if (observed.availability === "unknown" && !policy.allow_unknown && player.availability_policy === "ask") throw new ServerPlayerError("AVAILABILITY_UNKNOWN", "Speaker availability is unknown; explicitly acknowledge it before connecting");
  }

  private engine(player: ServerPlayer): PlayerEngine {
    const engine = this.engines[player.engine_id];
    if (!engine) throw new ServerPlayerError("ENGINE_NOT_CONFIGURED", "Player engine is not configured", 503);
    return engine;
  }
  private active(id: string): Runtime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new ServerPlayerError("PLAYER_INACTIVE", "Player has no active engine session; explicitly play to start one");
    return runtime;
  }
  private revision(player: ServerPlayer, expected: number): void {
    if (player.revision !== expected) throw new ServerPlayerError("REVISION_CONFLICT", "Player changed; refresh its state before retrying");
  }
  private available(): void { if (this.stopping) throw new ServerPlayerError("WORKER_STOPPING", "Player worker is stopping", 503); }
  private async save(player: ServerPlayer): Promise<ServerPlayer> {
    const saved = await this.store.save(player, player.revision);
    this.players.set(player.id, saved);
    this.publish(saved);
    return clone(saved);
  }
  private publish(player: ServerPlayer): void { this.emit("snapshot", clone(player)); }
}
