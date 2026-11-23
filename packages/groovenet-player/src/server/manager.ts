import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  createServerPlayerSchema,
  serverPlayerCommandSchema,
  type CreateServerPlayer,
  type LostOutput,
  type ServerPlayer,
  type ServerPlayerErrorState,
  type ServerPlayerCommand,
  type ServerPlayerCommandResult,
  type ServerPlayerDevice,
  type SpeakerObservation,
} from "@groovenet/contracts";
import { audioSource } from "../resolver.js";
import {
  PlayerError,
  type AudioDevice,
  type OutputFailureReason,
  type PlaybackBackend,
} from "../types.js";
import { advanceProgress, initialProgress, isPlay, type ListenProgress } from "../playThreshold.js";
import { ServerPlayerError, type PlayerStore, type ServerPlay } from "./store.js";

export interface PlayerEngine {
  libraryRoot: string;
  create(outputId?: string): PlaybackBackend;
}
export type SpeakerObserver = (
  outputId: string,
  context?: {
    outputName?: string;
    resolveOutputName?: () => Promise<string | undefined>;
    fresh?: boolean;
  },
) => Promise<SpeakerObservation>;
export const unknownSpeaker = (): SpeakerObservation => ({
  availability: "unknown",
  observed_at: null,
  source: "unconfigured",
  sender_identity: "unknown",
});
interface Runtime {
  backend: PlaybackBackend;
  generation: number;
}
/** Emitted as "player-error" when a player enters, or changes, an error state. */
export interface ServerPlayerErrorEvent {
  at: string;
  player_id: string;
  engine_id: string;
  code: string;
  message: string;
  /** The lost speaker, when the error is an output loss (#1241). */
  output?: LostOutput;
}
/** Emitted as "player-recovery" when a lost output is listed again or retried. */
export interface ServerPlayerRecoveryEvent {
  at: string;
  player_id: string;
  engine_id: string;
  output_id: string;
  action: "back" | "retry" | "retry_failed";
}
/**
 * Lost-output recovery (#1241). The worker only ever *lists* outputs while it
 * watches; it never selects one except through the single retry below.
 *
 * The retry window comes from the 2026-11-20 lounge timeline: OwnTone reported
 * output_lost at 01:47:41Z and the receiver's DAC was back at 01:48:02Z, 21 s
 * later (Shairport's emergency exit, its systemd restart, then 3.6 s for the
 * wake hook to power the DAC). 30 s covers that with margin; a return later
 * than that is a real outage, and the player only says the speaker is back.
 */
export const LOST_OUTPUT_RETRY_WINDOW_MS = 30_000;
/**
 * A returning output must stay listed this long before the retry. Shairport
 * re-advertises as soon as it restarts, before its DAC is powered (3.6 s on
 * the lounge receiver), and a flapping receiver should not be retried mid-flap.
 */
export const LOST_OUTPUT_RETRY_SETTLE_MS = 5_000;
/** Polling while a retry is still possible, then slower until the watch ends. */
export const LOST_OUTPUT_POLL_MS = 1_000;
export const LOST_OUTPUT_SLOW_POLL_MS = 5_000;
/** After this the worker stops polling; a device listing still notices a return. */
export const LOST_OUTPUT_WATCH_MS = 10 * 60_000;
export interface OutputRecoveryOptions {
  retryWindowMs?: number;
  settleMs?: number;
  pollMs?: number;
  slowPollMs?: number;
  watchMs?: number;
}
type LossReason = OutputFailureReason | "engine_timeout";
const LOSS_DETAIL: Record<LossReason, string> = {
  output_lost: "OwnTone reported the output lost during playback",
  disconnected: "OwnTone showed the output disconnected or deselected",
  not_listed: "OwnTone no longer lists the output",
  activation_failed: "OwnTone could not activate the output",
  engine_timeout: "OwnTone stopped answering, usually while it waits on the receiver",
};
/** Losses during playback, which the receiver's return may undo with one retry. */
const playbackLoss = (reason: string) => reason === "output_lost" || reason === "disconnected";
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** The whole story in the message too, so clients that predate `output` show it. */
export function lostOutputMessage(output: LostOutput): string {
  const who = output.name ?? "the speaker";
  if (output.back_at) return `${capitalised(who)} is back — press play to resume.`;
  const again = output.retried ? `Tried once more after ${who} came back; it failed again. ` : "";
  switch (output.reason) {
    case "not_listed":
      return `${again}${capitalised(who)} isn't listed by OwnTone right now. Wait for the receiver to come back, or choose a speaker in Play on → Speaker details.`;
    case "activation_failed":
      return `${again}OwnTone couldn't start ${who}. It may be listed without a working audio device: check the receiver, then press play, or choose another speaker.`;
    case "engine_timeout":
      return `${again}OwnTone stopped answering while reaching ${who}; it is usually waiting on the receiver. Check the receiver, then press play.`;
    default:
      return `${again}${capitalised(who)} went away during playback. The queue has not advanced; press play once it is back.`;
  }
}
interface Loss {
  outputId: string;
  lostAt: string;
  retried: boolean;
  /** Revision saved with a loss during playback; retry only if nothing changed since. */
  retryRevision?: number;
  /** Seen missing, unanswered or refused since the loss: a listing is then a return. */
  gone: boolean;
  listedSince: number | null;
  acting: boolean;
  timer?: NodeJS.Timeout;
}
export interface ServerPlayLogging {
  ownerFriendId: number;
  logPlay: (play: ServerPlay) => Promise<void>;
  now?: () => Date;
}
const errorValue = (error: unknown) =>
  error instanceof PlayerError || error instanceof ServerPlayerError
    ? { code: error.code, message: error.message }
    : { code: "PLAYER_OPERATION_FAILED", message: "Player operation failed" };
const clone = <T>(value: T): T => structuredClone(value);

/** Owns all player lifecycles; no HTTP connection owns a backend. */
export class ServerPlayerManager extends EventEmitter {
  private players = new Map<string, ServerPlayer>();
  private runtimes = new Map<string, Runtime>();
  /** Backends whose close failed; detach retries them before reassigning. */
  private releasing = new Map<string, PlaybackBackend>();
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private stopping = false;
  private checkpointAt = new Map<string, number>();
  private progress = new Map<string, { listened: ListenProgress; startedAt: Date }>();
  private queuedPlays = new Set<string>();
  private retrying = false;
  private losses = new Map<string, Loss>();
  private outputNames = new Map<string, string>();
  /** Players the worker retried for; no further retry until a person sends a command. */
  private autoRetried = new Set<string>();
  private readonly recovery: Required<OutputRecoveryOptions>;

  constructor(
    private readonly store: PlayerStore,
    private readonly engines: Record<string, PlayerEngine>,
    private readonly observe: SpeakerObserver = async () => unknownSpeaker(),
    private readonly playLogging?: ServerPlayLogging,
    recovery: OutputRecoveryOptions = {},
  ) {
    super();
    this.recovery = {
      retryWindowMs: recovery.retryWindowMs ?? LOST_OUTPUT_RETRY_WINDOW_MS,
      settleMs: recovery.settleMs ?? LOST_OUTPUT_RETRY_SETTLE_MS,
      pollMs: recovery.pollMs ?? LOST_OUTPUT_POLL_MS,
      slowPollMs: recovery.slowPollMs ?? LOST_OUTPUT_SLOW_POLL_MS,
      watchMs: recovery.watchMs ?? LOST_OUTPUT_WATCH_MS,
    };
  }

  /** Retry durable deliveries independently of queue changes and playback. */
  async retryPlays(): Promise<void> {
    if (!this.playLogging || this.retrying || this.stopping) return;
    this.retrying = true;
    try {
      for (const play of await this.store.pendingPlays()) {
        try {
          await this.playLogging.logPlay(play);
          await this.store.markPlayLogged(play.entryId);
        } catch (error) {
          this.emit("play-log-error", error);
        }
      }
    } catch (error) {
      this.emit("play-log-error", error);
    } finally {
      this.retrying = false;
    }
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => {});
    return result;
  }

  async initialize(): Promise<void> {
    // Restore checkpoints without replaying audio. Reconcile only durable identities.
    for (const saved of await this.store.list()) {
      const player = clone(saved);
      this.players.set(player.id, player);
      if (player.state.engine_session) {
        const backend = this.engine(player).create(player.state.desired_output ?? undefined);
        this.configureRecovery(player, backend);
        try {
          await backend.close();
        } catch (error) {
          player.state.error = this.playbackError(player, error);
        }
      }
      player.assigned_output = null;
      player.state.status = "stopped";
      player.state.checkpoint = true;
      const restored = await this.store.save(player, saved.revision);
      this.players.set(player.id, restored);
      // A restored loss is still reported and watched, but never retried.
      this.syncLoss(restored);
    }
  }

  engineIds(): string[] {
    return Object.keys(this.engines).sort();
  }
  list(): ServerPlayer[] {
    return [...this.players.values()].map(clone);
  }
  get(id: string): ServerPlayer {
    const player = this.players.get(id);
    if (!player) throw new ServerPlayerError("PLAYER_NOT_FOUND", "Player does not exist", 404);
    return clone(player);
  }

  create(input: CreateServerPlayer): Promise<ServerPlayer> {
    return this.serial(async () => {
      this.available();
      const parsed = createServerPlayerSchema.parse(input);
      if (!this.engines[parsed.engine_id])
        throw new ServerPlayerError(
          "ENGINE_NOT_CONFIGURED",
          "Engine is not configured on this server",
          400,
        );
      const player = await this.store.create(parsed, {
        queue: [],
        current_entry_id: null,
        status: "stopped",
        position: 0,
        duration: null,
        volume: 50,
        desired_output: null,
        checkpoint: false,
        error: null,
      });
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
      this.rememberNames(outputs);
      this.noteOutputs(id, outputs);
      const nameCounts = new Map<string, number>();
      for (const output of outputs)
        nameCounts.set(output.name, (nameCounts.get(output.name) ?? 0) + 1);
      return await Promise.all(
        outputs.map(async (output) => ({
          ...output,
          assigned_player_id: this.list().find((p) => p.assigned_output === output.id)?.id ?? null,
          desired_by: this.list()
            .filter((p) => p.state.desired_output === output.id)
            .map((p) => p.id),
          observed: await this.observe(output.id, {
            outputName: nameCounts.get(output.name) === 1 ? output.name : undefined,
          }),
        })),
      );
    } finally {
      if (!runtime) await backend.close();
    }
  }

  command(id: string, input: ServerPlayerCommand): Promise<ServerPlayerCommandResult> {
    return this.serial(async () => {
      this.available();
      const command = serverPlayerCommandSchema.parse(input);
      let player = this.get(id);
      // A flapping receiver gets one automatic retry, not one per loss.
      this.autoRetried.delete(id);
      if (command.expected_revision !== undefined) this.revision(player, command.expected_revision);
      if (command.type === "output.transfer") return this.transfer(player, command);
      try {
        switch (command.type) {
          case "rename":
            player.name = command.name;
            break;
          case "availability.set":
            player.availability_policy = command.availability_policy;
            break;
          case "session.join":
          case "queue.add": {
            const at =
              command.type === "queue.add"
                ? (command.at ?? player.state.queue.length)
                : player.state.queue.length;
            if (
              at > player.state.queue.length ||
              player.state.queue.length + command.tracks.length > 10000
            )
              throw new ServerPlayerError("INVALID_QUEUE", "Queue insertion is out of range", 400);
            const added = [];
            for (const ref of command.tracks) {
              const track = await this.store.resolve(ref);
              if (!track)
                throw new ServerPlayerError(
                  "TRACK_NOT_FOUND",
                  "Queued track does not exist or is ambiguous",
                  404,
                );
              added.push({ ...ref, id: randomUUID(), title: track.title, artist: track.artist });
            }
            player.state.queue.splice(at, 0, ...added);
            if (
              command.type === "session.join" &&
              (player.state.current_entry_id === null ||
                player.state.status === "stopped" ||
                player.state.status === "ended")
            ) {
              await this.play(player, added[0]!.id, command, false);
              return { player: this.get(id) };
            }
            break;
          }
          case "queue.remove": {
            const index = player.state.queue.findIndex((entry) => entry.id === command.entry_id);
            if (index < 0)
              throw new ServerPlayerError("ENTRY_NOT_FOUND", "Queue entry does not exist", 404);
            if (command.entry_id === player.state.current_entry_id) await this.stop(player);
            player.state.queue.splice(index, 1);
            break;
          }
          case "queue.move": {
            const index = player.state.queue.findIndex((entry) => entry.id === command.entry_id);
            if (index < 0)
              throw new ServerPlayerError("ENTRY_NOT_FOUND", "Queue entry does not exist", 404);
            if (command.to >= player.state.queue.length)
              throw new ServerPlayerError("INVALID_QUEUE", "Queue move is out of range", 400);
            player.state.queue.splice(command.to, 0, player.state.queue.splice(index, 1)[0]!);
            break;
          }
          case "queue.replace":
            return { player: await this.replaceQueue(player, command) };
          case "queue.clear":
            await this.stop(player);
            player.state.queue = [];
            break;
          case "output.select":
            if (this.runtimes.has(id)) await this.stop(player, true);
            player.state.desired_output = command.output_id;
            // Remembering a desired output does not reserve or connect it.
            break;
          case "engine.stop":
            await this.play(
              player,
              player.state.current_entry_id ?? player.state.queue[0]?.id,
              command,
              true,
              true,
            );
            return { player: this.get(id) };
          case "play": {
            const entryId =
              command.entry_id ?? player.state.current_entry_id ?? player.state.queue[0]?.id;
            await this.play(player, entryId, command);
            return { player: this.get(id) };
          }
          case "resume":
            if (this.runtimes.has(id)) {
              const backend = this.runtimes.get(id)!.backend;
              if ((await backend.outputConnection?.()) !== "connected")
                await this.requireAvailable(player, player.state.desired_output!, command);
              await backend.pause(false);
              player.state.status = "playing";
              player.state.checkpoint = false;
            } else {
              await this.play(player, player.state.current_entry_id ?? undefined, command);
              return { player: this.get(id) };
            }
            break;
          case "pause":
            await this.active(id).backend.pause(true);
            player.state.status = "paused";
            break;
          case "stop":
            await this.stop(player);
            break;
          case "next":
          case "previous": {
            const index = player.state.queue.findIndex(
              (entry) => entry.id === player.state.current_entry_id,
            );
            const next = command.type === "next" ? index + 1 : Math.max(0, index - 1);
            if (next >= player.state.queue.length) {
              await this.stop(player);
              player.state.status = "ended";
            } else {
              await this.play(player, player.state.queue[next]?.id, command, false);
              return { player: this.get(id) };
            }
            break;
          }
          case "seek":
            if (!player.state.current_entry_id)
              throw new ServerPlayerError("NO_CURRENT_TRACK", "No current track", 400);
            if (this.runtimes.has(id)) await this.active(id).backend.seek(command.seconds);
            player.state.position = command.seconds;
            player.state.checkpoint = !this.runtimes.has(id);
            break;
          case "volume":
            if (this.runtimes.has(id)) await this.active(id).backend.setVolume(command.volume);
            player.state.volume = command.volume;
            break;
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
          player.state.error = this.playbackError(player, error);
          await this.save(player);
        }
        if (error instanceof PlayerError && error.code === "DEVICE_BUSY")
          throw new PlayerError("DEVICE_BUSY", this.playbackError(player, error).message);
        throw error;
      }
    });
  }

  private async replaceQueue(
    player: ServerPlayer,
    command: Extract<ServerPlayerCommand, { type: "queue.replace" }>,
  ): Promise<ServerPlayer> {
    // Resolve and validate the entire replacement before touching playback or
    // saving anything. A bad final entry cannot leave a half-cleared queue.
    const previousEntries = new Map(player.state.queue.map((entry) => [entry.id, entry]));
    const queue = [];
    for (const ref of command.entries) {
      const previous = ref.id ? previousEntries.get(ref.id) : undefined;
      if (previous && (previous.track_id !== ref.track_id || previous.friend_id !== ref.friend_id))
        throw new ServerPlayerError(
          "INVALID_QUEUE",
          "An existing entry ID cannot identify a different track",
          400,
        );
      const track = await this.store.resolve(ref).catch(() => {
        throw new ServerPlayerError(
          "TRACK_RESOLUTION_FAILED",
          "Unable to resolve replacement tracks",
          503,
        );
      });
      if (!track)
        throw new ServerPlayerError(
          "TRACK_NOT_FOUND",
          "Queued track does not exist or is ambiguous",
          404,
        );
      queue.push({ ...ref, id: ref.id ?? randomUUID(), title: track.title, artist: track.artist });
    }
    const retained = queue.some((entry) => entry.id === player.state.current_entry_id);
    const current =
      command.current_entry_id === undefined
        ? retained
          ? player.state.current_entry_id
          : command.play
            ? (queue[0]?.id ?? null)
            : null
        : command.current_entry_id;
    if (current !== null && !queue.some((entry) => entry.id === current))
      throw new ServerPlayerError(
        "ENTRY_NOT_FOUND",
        "Current entry must belong to the replacement queue",
        404,
      );
    if (command.play && current === null)
      throw new ServerPlayerError(
        "ENTRY_NOT_FOUND",
        "Select a replacement entry before playing",
        400,
      );
    const unchanged = current !== null && current === player.state.current_entry_id;
    const position = command.position ?? (unchanged ? player.state.position : 0);
    if (unchanged && this.runtimes.has(player.id)) {
      const backend = this.active(player.id).backend;
      if (command.play && player.state.status !== "playing") {
        if ((await backend.outputConnection?.()) !== "connected")
          await this.requireAvailable(player, player.state.desired_output!, command);
        await backend.pause(false);
        player.state.status = "playing";
        player.state.checkpoint = false;
        player.state.error = null;
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

  private async play(
    player: ServerPlayer,
    entryId: string | undefined,
    policy: { allow_unknown: boolean; takeover: boolean },
    resumeCheckpoint = true,
    engineTakeover = false,
  ): Promise<void> {
    const entry = player.state.queue.find((entry) => entry.id === entryId);
    if (!entry)
      throw new ServerPlayerError(
        "ENTRY_NOT_FOUND",
        "Queue is empty or the entry does not exist",
        404,
      );
    const output = player.state.desired_output;
    if (!output)
      throw new ServerPlayerError("OUTPUT_REQUIRED", "Select a desired output before playing", 400);
    const owner = this.list().find((p) => p.assigned_output === output && p.id !== player.id);
    if (owner)
      throw new ServerPlayerError(
        "OUTPUT_ASSIGNED",
        "Speaker belongs to another player; use explicit transfer",
      );
    const loss = this.losses.get(player.id);
    if (loss?.outputId === output) {
      // After a loss, one listing answers "is it there?" before any engine
      // write: a missing speaker fails in one request, not after a chain of
      // timeouts, and a listed one is reselected and claimed below.
      const outputs = await this.listOutputs(player);
      if (!outputs.some((candidate) => candidate.id === output)) {
        loss.gone = true;
        throw new PlayerError("DEVICE_UNAVAILABLE", "OwnTone output is unavailable", {
          reason: "not_listed",
        });
      }
    }
    const needsReconnect =
      (player.state.status === "paused" || player.state.status === "error") &&
      (await this.runtimes.get(player.id)?.backend.outputConnection?.()) !== "connected";
    if (player.assigned_output !== output || needsReconnect)
      await this.requireAvailable(player, output, policy);
    const track = await this.store.resolve(entry);
    const engine = this.engine(player);
    const source = track
      ? audioSource(track, { apiBase: "http://unused/api", audioLibraryRoot: engine.libraryRoot })
      : null;
    if (!source)
      throw new ServerPlayerError("NO_AUDIO", "Current track has no indexed audio source", 422);
    const position =
      resumeCheckpoint && player.state.current_entry_id === entry.id ? player.state.position : 0;
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
    this.configureRecovery(player, backend);
    const runtime = { backend, generation: ++this.generation };
    this.runtimes.set(player.id, runtime);
    backend.on("position", (position, duration) =>
      this.enqueueEvent(player.id, runtime, async (current) => {
        if (!Number.isFinite(position) || position < 0) return;
        current.state.position = position;
        current.state.duration =
          duration !== null && Number.isFinite(duration) && duration >= 0 ? duration : null;
        current.state.checkpoint = false;
        const entryId = current.state.current_entry_id;
        if (
          this.playLogging &&
          entryId &&
          track?.friend_id === this.playLogging.ownerFriendId &&
          track.release_id &&
          !this.queuedPlays.has(entryId)
        ) {
          const listening = this.progress.get(entryId) ?? {
            listened: initialProgress,
            startedAt: this.playLogging.now?.() ?? new Date(),
          };
          listening.listened = advanceProgress(
            listening.listened,
            position,
            current.state.status === "playing",
          );
          this.progress.set(entryId, listening);
          if (isPlay(listening.listened.listened, current.state.duration)) {
            const play: ServerPlay = {
              entryId,
              playerId: current.id,
              trackId: entry.track_id,
              friendId: entry.friend_id,
              releaseId: track.release_id,
              startedAt: listening.startedAt,
              outputName: await this.outputName(backend, current.assigned_output),
            };
            try {
              await this.store.queuePlay(play);
              this.queuedPlays.add(entryId);
              void this.retryPlays();
            } catch (error) {
              this.emit("play-log-error", error);
            }
          }
        }
        this.players.set(current.id, current);
        this.emit("position", {
          player_id: current.id,
          revision: current.revision,
          current_entry_id: current.state.current_entry_id,
          position: current.state.position,
          duration: current.state.duration,
          observed_at: new Date().toISOString(),
        });
        if (Date.now() - (this.checkpointAt.get(current.id) ?? 0) >= 5000) {
          await this.store.checkpoint(current);
          this.checkpointAt.set(current.id, Date.now());
        }
      }),
    );
    backend.on("ended", () =>
      this.enqueueEvent(player.id, runtime, async (current) => {
        const index = current.state.queue.findIndex(
          (entry) => entry.id === current.state.current_entry_id,
        );
        const next = current.state.queue[index + 1];
        if (next) {
          current.state.current_entry_id = next.id;
          current.state.position = 0;
          current.state.duration = null;
          current.state.status = "loading";
          const advanced = await this.save(current);
          await this.play(advanced, next.id, { allow_unknown: true, takeover: false }, false);
        } else {
          await this.stop(current);
          current.state.status = "ended";
          await this.save(current);
        }
      }),
    );
    backend.on("error", (error) =>
      this.enqueueEvent(player.id, runtime, async (current) => {
        // Only audio that was actually going may come back on its own.
        const wasPlaying = current.state.status === "playing";
        current.state.status = "error";
        current.state.error = this.playbackError(current, error);
        try {
          await this.detach(current);
        } catch {
          /* retain the uncertain claim */
        }
        const saved = await this.save(current);
        const loss = this.losses.get(saved.id);
        const output = saved.state.error?.output;
        if (wasPlaying && loss && output && playbackLoss(output.reason) && !loss.retried)
          loss.retryRevision = saved.revision;
      }),
    );
    try {
      if (engineTakeover) {
        if (!backend.takeOver)
          throw new ServerPlayerError(
            "ENGINE_INCOMPATIBLE",
            "Engine does not support takeover",
            400,
          );
        await backend.takeOver();
      }
      await backend.load(source);
      if (position > 0) await backend.seek(position);
      await backend.setVolume(player.state.volume);
      player.state.status = "playing";
      await this.save(player);
    } catch (error) {
      player = this.get(player.id);
      player.state.status = "error";
      player.state.error = this.playbackError(player, error);
      try {
        await this.detach(player);
      } catch {
        /* don't transfer an uncertain claim */
      }
      await this.save(player);
      throw error;
    }
  }

  private playbackError(player: ServerPlayer, error: unknown): ServerPlayerErrorState {
    const value = errorValue(error);
    if (value.code === "DEVICE_BUSY")
      return {
        code: value.code,
        message: `${player.name} / ${player.engine_id} is busy. Something else is playing or paused there. Choose “Stop engine and take over”.`,
      };
    const output = this.recordLoss(player, error);
    return output ? { ...value, message: lostOutputMessage(output), output } : value;
  }

  /**
   * Names the speaker an output failure took away, keeping the first loss time
   * across later failures of the same output (output_lost, then a timeout, then
   * "unavailable" is one outage). Null when the error is not about the output.
   */
  private recordLoss(player: ServerPlayer, error: unknown): LostOutput | null {
    const id = player.assigned_output ?? player.state.desired_output;
    if (!id || !(error instanceof PlayerError)) return null;
    const previous = this.losses.get(player.id);
    const known = previous?.outputId === id ? previous : undefined;
    const reason: LossReason | undefined =
      error.reason ?? (error.code === "ENGINE_TIMEOUT" && known ? "engine_timeout" : undefined);
    if (!reason) return null;
    if (known?.timer) clearTimeout(known.timer);
    const loss: Loss = known ?? {
      outputId: id,
      lostAt: new Date().toISOString(),
      retried: false,
      gone: false,
      listedSince: null,
      acting: false,
    };
    loss.timer = undefined;
    loss.listedSince = null;
    if (!playbackLoss(reason)) loss.gone = true;
    this.losses.set(player.id, loss);
    return {
      id,
      name: this.outputNames.get(id) ?? null,
      lost_at: loss.lostAt,
      reason,
      detail: LOSS_DETAIL[reason],
      back_at: null,
      ...(loss.retried ? { retried: true } : {}),
    };
  }

  /** The persisted error decides whether a loss is watched; memory follows it. */
  private syncLoss(player: ServerPlayer): void {
    const output = player.state.error?.output;
    let loss = this.losses.get(player.id);
    if (output && !output.back_at && !this.stopping) {
      if (!loss || loss.outputId !== output.id) {
        if (loss?.timer) clearTimeout(loss.timer);
        // Restored after a worker restart: report it, never retry it.
        loss = {
          outputId: output.id,
          lostAt: output.lost_at,
          retried: output.retried ?? false,
          gone: !playbackLoss(output.reason),
          listedSince: null,
          acting: false,
        };
        this.losses.set(player.id, loss);
      }
      this.watch(player.id);
      return;
    }
    if (loss?.timer) clearTimeout(loss.timer);
    if (loss) loss.timer = undefined;
    // A play in progress keeps the loss so its failure is the same outage.
    if (!output && player.state.status !== "loading" && player.state.status !== "error")
      this.losses.delete(player.id);
  }

  private watch(id: string): void {
    const loss = this.losses.get(id);
    if (!loss || loss.timer || this.stopping) return;
    const elapsed = Date.now() - Date.parse(loss.lostAt);
    if (!(elapsed <= this.recovery.watchMs)) return;
    const delay =
      elapsed < this.recovery.retryWindowMs ? this.recovery.pollMs : this.recovery.slowPollMs;
    loss.timer = setTimeout(() => {
      loss.timer = undefined;
      void this.pollLoss(id, loss);
    }, delay);
    loss.timer.unref?.();
  }

  private async pollLoss(id: string, loss: Loss): Promise<void> {
    const output = this.players.get(id)?.state.error?.output;
    if (this.stopping || this.losses.get(id) !== loss || output?.id !== loss.outputId) return;
    try {
      this.noteOutputs(id, await this.listOutputs(this.players.get(id)!));
    } catch {
      // An engine that cannot answer is, in practice, stuck on the receiver.
      loss.gone = true;
      loss.listedSince = null;
    }
    if (this.losses.get(id) === loss && !loss.acting) this.watch(id);
  }

  private async listOutputs(player: ServerPlayer): Promise<AudioDevice[]> {
    const runtime = this.runtimes.get(player.id);
    const backend = runtime?.backend ?? this.engine(player).create();
    try {
      const outputs = await backend.listDevices();
      this.rememberNames(outputs);
      return outputs;
    } finally {
      if (!runtime) await backend.close();
    }
  }

  private rememberNames(outputs: AudioDevice[]): void {
    for (const output of outputs) if (output.name) this.outputNames.set(output.id, output.name);
  }

  /** Every listing while a loss is open feeds this; it decides back, retry or wait. */
  private noteOutputs(id: string, outputs: AudioDevice[]): void {
    const loss = this.losses.get(id);
    const player = this.players.get(id);
    const output = player?.state.error?.output;
    if (!loss || loss.acting || !output || output.id !== loss.outputId || output.back_at) return;
    const listed = outputs.find((candidate) => candidate.id === loss.outputId);
    if (!listed) {
      loss.gone = true;
      loss.listedSince = null;
      return;
    }
    // Never seen gone: a listing proves nothing, so the loss message stands,
    // though it can now name the speaker.
    if (!loss.gone) {
      if (!output.name && listed.name) this.act(loss, () => this.nameLoss(id, loss, listed.name));
      return;
    }
    const now = Date.now();
    loss.listedSince ??= now;
    const retry =
      loss.retryRevision !== undefined &&
      !loss.retried &&
      !this.autoRetried.has(id) &&
      player!.revision === loss.retryRevision &&
      now - Date.parse(loss.lostAt) <= this.recovery.retryWindowMs;
    if (retry && now - loss.listedSince < this.recovery.settleMs) return;
    this.act(loss, () =>
      retry ? this.retryLoss(id, loss, listed.name) : this.markBack(id, loss, listed.name),
    );
  }

  private act(loss: Loss, action: () => Promise<void>): void {
    loss.acting = true;
    void this.serial(action)
      .catch(() => {
        /* reported in the player's state; never a worker fault */
      })
      .finally(() => {
        loss.acting = false;
      });
  }

  private async nameLoss(id: string, loss: Loss, name: string): Promise<void> {
    const player = this.current(id, loss);
    if (!player || player.state.error!.output!.name) return;
    const error = player.state.error!;
    const output: LostOutput = { ...error.output!, name };
    player.state.error = { ...error, message: lostOutputMessage(output), output };
    const named = player.revision;
    const saved = await this.save(player);
    // Naming is the worker's own edit; it must not cancel a pending retry.
    if (loss.retryRevision === named) loss.retryRevision = saved.revision;
  }

  private current(id: string, loss: Loss): ServerPlayer | null {
    const player = this.players.get(id) ? this.get(id) : null;
    const output = player?.state.error?.output;
    return this.stopping ||
      this.losses.get(id) !== loss ||
      !output ||
      output.id !== loss.outputId ||
      output.back_at
      ? null
      : player;
  }

  private async markBack(id: string, loss: Loss, name: string): Promise<void> {
    const player = this.current(id, loss);
    if (!player) return;
    const error = player.state.error!;
    const output: LostOutput = {
      ...error.output!,
      name: name || error.output!.name,
      back_at: new Date().toISOString(),
    };
    player.state.error = { ...error, message: lostOutputMessage(output), output };
    await this.save(player);
    this.recovered(player, loss, "back");
  }

  /** At most once per loss, and only if nothing has touched the player since. */
  private async retryLoss(id: string, loss: Loss, name: string): Promise<void> {
    const player = this.current(id, loss);
    if (!player || loss.retried || player.revision !== loss.retryRevision) {
      await this.markBack(id, loss, name);
      return;
    }
    loss.retried = true;
    this.autoRetried.add(id);
    this.recovered(player, loss, "retry");
    try {
      // The same policy as queue advance: never takes over another sender.
      await this.play(player, player.state.current_entry_id ?? undefined, {
        allow_unknown: true,
        takeover: false,
      });
    } catch (error) {
      this.recovered(player, loss, "retry_failed");
      if (error instanceof ServerPlayerError) {
        // Refused before any engine effect (occupied, assigned): just say it's back.
        await this.markBack(id, loss, name);
        return;
      }
      // play() saves before any engine effect and records its own failures; a
      // failure before that (its one listing) leaves the revision unchanged.
      const failed = this.get(id);
      if (failed.revision === player.revision) {
        failed.state.status = "error";
        failed.state.error = this.playbackError(failed, error);
        await this.save(failed);
      }
    }
  }

  private recovered(player: ServerPlayer, loss: Loss, action: ServerPlayerRecoveryEvent["action"]) {
    this.emit("player-recovery", {
      at: new Date().toISOString(),
      player_id: player.id,
      engine_id: player.engine_id,
      output_id: loss.outputId,
      action,
    } satisfies ServerPlayerRecoveryEvent);
  }

  private configureRecovery(player: ServerPlayer, backend: PlaybackBackend): void {
    backend.configureSessionRecovery?.(
      player.state.engine_session ?? null,
      async (session) => {
        // Called in the backend command lane before play, not as a queued event:
        // persistence must complete before the engine can start audio.
        const current = this.get(player.id);
        current.state.engine_session = session;
        await this.store.checkpoint(current);
        this.players.set(current.id, current);
        player.state.engine_session = session;
      },
      player.engine_id,
    );
  }

  private enqueueEvent(
    id: string,
    runtime: Runtime,
    action: (player: ServerPlayer) => Promise<void>,
  ): void {
    void this.serial(async () => {
      if (this.stopping || this.runtimes.get(id)?.generation !== runtime.generation) return;
      try {
        await action(this.get(id));
      } catch (error) {
        const current = this.get(id);
        current.state.status = "error";
        current.state.error = this.playbackError(current, error);
        try {
          await this.detach(current);
        } catch {
          /* preserve uncertain claim */
        }
        await this.save(current);
      }
    }).catch((error: unknown) => {
      this.emit("fault", error);
    });
  }

  private async detach(player: ServerPlayer): Promise<void> {
    const runtime = this.runtimes.get(player.id);
    const pending = this.releasing.get(player.id);
    if (runtime) {
      // Invalidate callbacks before awaiting close, including duplicate EOFs.
      this.runtimes.delete(player.id);
      try {
        await runtime.backend.close();
      } catch (error) {
        // Keep the backend and its session identity so a later detach can
        // retry the release; the speaker stays claimed until one succeeds.
        this.releasing.set(player.id, runtime.backend);
        throw error;
      }
      player.state.engine_session = this.get(player.id).state.engine_session;
    } else if (pending) {
      try {
        await pending.close();
      } catch {
        throw new ServerPlayerError(
          "RELEASE_UNCERTAIN",
          "Previous engine release failed; retry once the engine responds again",
          503,
        );
      }
      this.releasing.delete(player.id);
      player.state.engine_session = this.get(player.id).state.engine_session;
    } else if (player.assigned_output !== null) {
      throw new ServerPlayerError(
        "RELEASE_UNCERTAIN",
        "Previous engine release is uncertain; stop that engine and restart the worker before reassigning",
        503,
      );
    }
    player.assigned_output = null;
  }

  private async stop(player: ServerPlayer, preserveCurrent = false): Promise<void> {
    await this.detach(player);
    player.state.status = preserveCurrent && player.state.current_entry_id ? "paused" : "stopped";
    player.state.checkpoint = preserveCurrent && player.state.current_entry_id !== null;
    if (!preserveCurrent) {
      player.state.current_entry_id = null;
      player.state.position = 0;
      player.state.duration = null;
    }
  }

  private async transfer(
    target: ServerPlayer,
    command: Extract<ServerPlayerCommand, { type: "output.transfer" }>,
  ): Promise<ServerPlayerCommandResult> {
    if (target.id === command.from_player_id)
      throw new ServerPlayerError(
        "INVALID_TRANSFER",
        "Transfer requires two different players",
        400,
      );
    let source = this.get(command.from_player_id);
    this.revision(source, command.from_revision);
    if (source.assigned_output !== command.output_id)
      throw new ServerPlayerError("OUTPUT_NOT_ASSIGNED", "Source player does not own this speaker");
    let detached = false;
    try {
      await this.stop(source, true);
      source = await this.save(source);
      detached = true;
      if (this.runtimes.has(target.id)) {
        await this.stop(target, true);
        target = await this.save(target);
      }
      target.state.desired_output = command.output_id;
      target = await this.save(target);
      if (command.play)
        await this.play(
          target,
          target.state.current_entry_id ?? target.state.queue[0]?.id,
          command,
        );
      return {
        player: this.get(target.id),
        transfer: {
          from_player: this.get(source.id),
          detached,
          attached: command.play,
          error: null,
        },
      };
    } catch (error) {
      if (!detached) {
        source.state.status = "error";
        source.state.error = errorValue(error);
        try {
          await this.save(source);
        } catch {
          /* keep the transfer result truthful */
        }
      }
      // The source may already be detached. Report each phase; do not reconnect
      // it to pretend the operation was atomic or compete with an external app.
      return {
        player: this.get(target.id),
        transfer: {
          from_player: this.get(source.id),
          detached,
          attached: false,
          error: errorValue(error),
        },
      };
    }
  }

  async shutdown(): Promise<void> {
    this.stopping = true;
    for (const loss of this.losses.values()) clearTimeout(loss.timer);
    await this.serial(async () => {
      for (const player of this.list()) {
        try {
          await this.stop(player, true);
          await this.save(player);
        } catch (error) {
          this.emit("fault", error);
        }
      }
    });
  }

  /** Metadata is best effort; discovery must never prevent a play being queued. */
  private async outputName(
    backend: PlaybackBackend,
    output: string | null,
  ): Promise<string | null> {
    try {
      const devices = await backend.listDevices();
      const name = devices.find((device) => device.id === output)?.name.trim();
      return name &&
        name.length <= 255 &&
        devices.filter((device) => device.name.trim() === name).length === 1
        ? name
        : null;
    } catch {
      return null;
    }
  }

  private async requireAvailable(
    player: ServerPlayer,
    output: string,
    policy: { allow_unknown: boolean; takeover: boolean },
  ): Promise<void> {
    // Assignment is a Groovenet claim, independent of HA's observation.
    if (this.list().some((other) => other.id !== player.id && other.assigned_output === output))
      throw new ServerPlayerError(
        "OUTPUT_ASSIGNED",
        "Speaker belongs to another player; use explicit transfer",
      );
    const observed = await this.observe(output, {
      fresh: true,
      resolveOutputName: async () => {
        const runtime = this.runtimes.get(player.id);
        const backend = runtime?.backend ?? this.engine(player).create();
        try {
          const devices = await backend.listDevices();
          const name = devices.find((device) => device.id === output)?.name;
          return name && devices.filter((device) => device.name === name).length === 1
            ? name
            : undefined;
        } finally {
          if (!runtime) await backend.close();
        }
      },
    });
    const ownSender =
      observed.sender_identity === "groovenet" && observed.sender_engine_id === player.engine_id;
    if (
      observed.availability === "occupied" &&
      !ownSender &&
      !policy.takeover &&
      player.availability_policy !== "always"
    )
      throw new ServerPlayerError(
        "SPEAKER_OCCUPIED",
        "Observed speaker activity requires explicit takeover",
      );
    if (
      observed.availability === "unknown" &&
      !policy.allow_unknown &&
      player.availability_policy === "ask"
    )
      throw new ServerPlayerError(
        "AVAILABILITY_UNKNOWN",
        "Speaker availability is unknown; explicitly acknowledge it before connecting",
      );
  }

  private engine(player: ServerPlayer): PlayerEngine {
    const engine = this.engines[player.engine_id];
    if (!engine)
      throw new ServerPlayerError("ENGINE_NOT_CONFIGURED", "Player engine is not configured", 503);
    return engine;
  }
  private active(id: string): Runtime {
    const runtime = this.runtimes.get(id);
    if (!runtime)
      throw new ServerPlayerError(
        "PLAYER_INACTIVE",
        "Player has no active engine session; explicitly play to start one",
      );
    return runtime;
  }
  private revision(player: ServerPlayer, expected: number): void {
    if (player.revision !== expected)
      throw new ServerPlayerError(
        "REVISION_CONFLICT",
        "Player changed; refresh its state before retrying",
      );
  }
  private available(): void {
    if (this.stopping)
      throw new ServerPlayerError("WORKER_STOPPING", "Player worker is stopping", 503);
  }
  private async save(player: ServerPlayer): Promise<ServerPlayer> {
    const previous = this.players.get(player.id)?.state;
    const saved = await this.store.save(player, player.revision);
    this.players.set(player.id, saved);
    const error = saved.state.error;
    if (
      saved.state.status === "error" &&
      error &&
      (previous?.status !== "error" || previous.error?.code !== error.code)
    )
      this.emit("player-error", {
        at: new Date().toISOString(),
        player_id: saved.id,
        engine_id: saved.engine_id,
        code: error.code,
        message: error.message,
        ...(error.output ? { output: error.output } : {}),
      } satisfies ServerPlayerErrorEvent);
    this.syncLoss(saved);
    this.publish(saved);
    return clone(saved);
  }
  private publish(player: ServerPlayer): void {
    this.emit("snapshot", clone(player));
  }
}
