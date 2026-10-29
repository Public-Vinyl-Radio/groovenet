// A server player session: one observer of a named server player. Framework
// agnostic and free of Node imports, so the web app (EventSource through its
// proxy) and the CLI (the client's SSE stream) share it by injecting a transport.

import type {
  PlayerTrackRef,
  ServerPlayer,
  ServerPlayerCommandInput,
  ServerPlayerCommandResult,
  ServerPlayerDevice,
  serverPlayerStreamEventSchema,
} from "@groovenet/contracts";

type WithoutRevision<T> = T extends unknown ? Omit<T, "expected_revision"> : never;
export type PlayerEdit = WithoutRevision<ServerPlayerCommandInput>;
export type ConnectingEdit = Extract<
  PlayerEdit,
  {
    type:
      | "session.join"
      | "play"
      | "resume"
      | "next"
      | "previous"
      | "output.select"
      | "output.transfer"
      | "queue.replace";
  }
>;
function connects(command: PlayerEdit): command is ConnectingEdit {
  return (
    (command.type === "queue.replace" && command.play === true) ||
    [
      "session.join",
      "play",
      "resume",
      "next",
      "previous",
      "output.select",
      "output.transfer",
    ].includes(command.type)
  );
}

/** A snapshot or position event off a player's stream, already validated. */
export type ServerPlayerStreamEvent = ReturnType<typeof serverPlayerStreamEventSchema.parse>;

/**
 * How a session reaches the server. `subscribe` opens one stream with no replay
 * and returns its unsubscribe; `onDisconnect` fires when it ends or fails.
 */
export interface ServerPlayerTransport {
  get(id: string): Promise<ServerPlayer>;
  devices(id: string): Promise<ServerPlayerDevice[]>;
  command(id: string, command: ServerPlayerCommandInput): Promise<ServerPlayerCommandResult>;
  subscribe(
    id: string,
    onEvent: (event: ServerPlayerStreamEvent) => void,
    onDisconnect: (reason?: unknown) => void,
  ): () => void;
}

export type SessionView = {
  player: ServerPlayer | null;
  devices: ServerPlayerDevice[];
  connected: boolean;
  busy: boolean;
  problem: string | null;
  acknowledgement: {
    command: ConnectingEdit;
    code: string;
    revision: number;
    expectedRevision?: number;
  } | null;
};
export type ServerPlayerSessionOptions = {
  /** Wait before reconnecting for a fresh snapshot. */
  reconnectMs?: number;
  /** Called after a join commits, including after speaker acknowledgement. */
  onJoined?: () => void;
  /** The problem shown while reconnecting; receives whatever ended the stream. */
  disconnectMessage?: (reason?: unknown) => string;
  /** Called each time the stream is lost, after the view shows the problem. */
  onDisconnect?: (reason?: unknown) => void;
  /** Fetch the outputs with every snapshot and command. Callers that never show them turn this off. */
  devices?: boolean;
};

/** Nothing is playing or loading: joining starts a session with the joiner's queue. */
export const isIdle = (player: ServerPlayer) =>
  player.state.current_entry_id === null ||
  player.state.status === "stopped" ||
  player.state.status === "ended";
/** A session is under way (the picker's LIVE tag). */
export const isLive = (player: ServerPlayer) =>
  ["playing", "paused", "loading"].includes(player.state.status);

/** What joining a server takes from a device's queue: the current track onward, never what already played. */
export function upcomingTracks<T>({
  playlist,
  currentTrackIndex,
  finishedTrack,
}: {
  playlist: T[];
  currentTrackIndex: number | null;
  finishedTrack: unknown;
}): T[] {
  if (currentTrackIndex !== null) return playlist.slice(currentTrackIndex);
  return finishedTrack ? [] : playlist;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Player request failed";
const code = (error: unknown) => (error as { data?: { code?: string } })?.data?.code;
const lost = () => "Connection lost. Reconnecting for fresh state; server audio continues.";

/** Owns remote observations only. Closing it never sends an audio command. */
export class ServerPlayerSession {
  private view: SessionView = {
    player: null,
    devices: [],
    connected: false,
    busy: false,
    problem: null,
    acknowledgement: null,
  };
  private listeners = new Set<() => void>();
  private generation = 0;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private worker?: string;
  private sequence = -1;
  private reconnecting = false;
  private waiters: Array<(ready: boolean) => void> = [];
  private pendingVolume?: number;
  private readonly reconnectMs: number;
  private readonly disconnectMessage: (reason?: unknown) => string;
  private readonly onDisconnect?: (reason?: unknown) => void;
  private readonly withDevices: boolean;
  constructor(
    readonly id: string,
    private api: ServerPlayerTransport,
    private readonly options: ServerPlayerSessionOptions = {},
  ) {
    this.reconnectMs = options.reconnectMs ?? 1500;
    this.disconnectMessage = options.disconnectMessage ?? lost;
    this.onDisconnect = options.onDisconnect;
    this.withDevices = options.devices ?? true;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<SessionView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
    if (this.view.connected && this.view.player && this.waiters.length) this.settle(true);
  }
  private settle(ready: boolean) {
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((done) => done(ready));
  }
  /** Resolves once a fresh snapshot arrives, or false if the session closes first. */
  ready(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.view.connected && this.view.player) return Promise.resolve(true);
    return new Promise((done) => this.waiters.push(done));
  }

  /** Opens the stream, marking the session disconnected until its first snapshot. Returns the closer. */
  start = () => {
    this.update({ connected: false, busy: false });
    return this.observe();
  };
  /** Opens the stream and leaves the current view as it is until a snapshot replaces it. */
  observe = () => {
    this.closed = false;
    this.connect();
    return () => this.close();
  };
  close() {
    this.closed = true;
    ++this.generation;
    this.unsubscribe?.();
    clearTimeout(this.timer);
    this.settle(false);
  }
  /** Back to this device: the server keeps its queue and audio, and no command is sent. */
  playHere() {
    this.close();
  }
  private connect() {
    const generation = ++this.generation;
    this.unsubscribe?.();
    let first = true;
    const current = () => !this.closed && generation === this.generation;
    const disconnected = (reason?: unknown) => {
      if (!current()) return;
      ++this.generation;
      this.reconnecting = true;
      this.unsubscribe?.();
      this.update({
        connected: false,
        busy: false,
        acknowledgement: null,
        problem: this.disconnectMessage(reason),
      });
      this.timer = setTimeout(() => this.connect(), this.reconnectMs);
      this.onDisconnect?.(reason);
    };
    this.unsubscribe = this.api.subscribe(
      this.id,
      (event) => {
        if (!current()) return;
        if (first) {
          if (event.type !== "snapshot" || event.player.id !== this.id) return;
          if (this.worker !== event.worker_instance) this.update({ player: null });
          this.worker = event.worker_instance;
          this.sequence = -1;
          first = false;
        }
        if (event.worker_instance !== this.worker || event.sequence <= this.sequence) return;
        this.sequence = event.sequence;
        const player = this.view.player;
        if (event.type === "snapshot") {
          if (event.player.id !== this.id || (player && event.player.revision < player.revision))
            return;
          this.update({
            player: event.player,
            connected: true,
            ...(this.reconnecting ? { problem: null } : {}),
          });
          this.reconnecting = false;
          void this.refreshDevices(generation);
        } else {
          if (
            !player ||
            event.player_id !== this.id ||
            event.revision !== player.revision ||
            event.current_entry_id !== player.state.current_entry_id
          )
            return;
          this.update({
            player: {
              ...player,
              state: { ...player.state, position: event.position, duration: event.duration },
            },
          });
        }
      },
      disconnected,
    );
  }
  private async refreshDevices(generation: number) {
    if (!this.withDevices) return;
    try {
      const devices = await this.api.devices(this.id);
      if (!this.closed && generation === this.generation) this.update({ devices });
    } catch (error) {
      if (!this.closed && generation === this.generation)
        this.update({ problem: `Outputs unavailable: ${message(error)}` });
    }
  }
  refresh = async () => {
    const generation = this.generation;
    try {
      const player = await this.api.get(this.id);
      if (
        !this.closed &&
        generation === this.generation &&
        (!this.view.player || player.revision >= this.view.player.revision)
      )
        this.update({ player });
      await this.refreshDevices(generation);
    } catch (error) {
      if (!this.closed && generation === this.generation)
        this.update({ problem: `Refresh failed: ${message(error)}` });
    }
  };
  /**
   * One fetch of the player that counts as proof of connection, for callers
   * without a stream. Throws on failure; a stale response never replaces a newer one.
   */
  async load(): Promise<ServerPlayer> {
    const player = await this.api.get(this.id);
    if (this.closed) throw new Error("Server player session is closed.");
    if (!this.view.player || player.revision >= this.view.player.revision)
      this.update({ player, connected: true });
    else this.update({ connected: true });
    return this.view.player!;
  }
  // The rejection that raised the confirm goes with it.
  dismissAcknowledgement = () => this.update({ acknowledgement: null, problem: null });
  dismissProblem = () => this.update({ problem: null });
  /** Appends and starts an idle server in one serialized command. */
  async join(tracks: PlayerTrackRef[]): Promise<boolean> {
    if (!tracks.length || !(await this.ready())) return false;
    return (await this.command({ type: "session.join", tracks })) !== null;
  }
  /** Latest-wins volume: a change made while a command is in flight is sent when it finishes. */
  setVolume = (volume: number) => {
    this.pendingVolume = volume;
    void this.flushVolume();
  };
  private async flushVolume() {
    if (this.pendingVolume === undefined || this.view.busy || !this.view.connected || this.closed)
      return;
    const volume = this.pendingVolume;
    this.pendingVolume = undefined;
    if (volume !== this.view.player?.state.volume) await this.command({ type: "volume", volume });
  }
  acknowledge = async () => {
    const acknowledgement = this.view.acknowledgement;
    if (!acknowledgement) return;
    if (this.view.player?.revision !== acknowledgement.revision) {
      this.update({
        acknowledgement: null,
        problem:
          "Player changed while awaiting acknowledgement. Review its output and repeat the action.",
      });
      return;
    }
    await this.command(
      {
        ...acknowledgement.command,
        ...(acknowledgement.code === "AVAILABILITY_UNKNOWN"
          ? { allow_unknown: true }
          : { takeover: true }),
      },
      acknowledgement.expectedRevision,
    );
  };
  /** Sends the command and applies its result when it is not older than what is held. Null when the session moved on first. */
  private async exchange(
    command: PlayerEdit,
    expectedRevision?: number,
  ): Promise<ServerPlayerCommandResult | null> {
    const generation = this.generation;
    const result = await this.api.command(
      this.id,
      expectedRevision === undefined
        ? command
        : ({ ...command, expected_revision: expectedRevision } as ServerPlayerCommandInput),
    );
    if (this.closed || generation !== this.generation) return null;
    if (result.player.revision >= this.view.player!.revision)
      this.update({ player: result.player });
    if (command.type === "session.join") this.options.onJoined?.();
    return result;
  }
  /**
   * Sends one command and reports trouble as a `problem` on the view; never
   * throws and never replays. Null when nothing came of it.
   */
  async command(command: PlayerEdit, expectedRevision?: number): Promise<ServerPlayer | null> {
    if (!this.view.connected || !this.view.player || this.closed) {
      this.update({ problem: "Wait for a fresh server snapshot before trying the action again." });
      return null;
    }
    if (this.view.busy) {
      this.update({ problem: "A command is in progress. Try again when it finishes." });
      return null;
    }
    const generation = this.generation;
    const revision = this.view.player.revision;
    this.update({ busy: true, problem: null, acknowledgement: null });
    try {
      const result = await this.exchange(command, expectedRevision);
      if (!result) return null;
      if (
        result.transfer?.error ||
        (result.transfer?.detached &&
          command.type === "output.transfer" &&
          command.play &&
          !result.transfer.attached)
      ) {
        this.update({
          problem: `Transfer partially completed: source detached=${result.transfer!.detached}, destination attached=${result.transfer!.attached}. ${result.transfer!.error?.message ?? "Playback did not attach."} Review both players before another action.`,
        });
      }
      void this.refreshDevices(generation);
      return result.player;
    } catch (error) {
      if (this.closed || generation !== this.generation) return null;
      const errorCode = code(error);
      if (
        (errorCode === "AVAILABILITY_UNKNOWN" || errorCode === "SPEAKER_OCCUPIED") &&
        connects(command)
      )
        this.update({
          acknowledgement: {
            command,
            code: errorCode,
            revision,
            ...(expectedRevision === undefined && command.type !== "session.join"
              ? {}
              : { expectedRevision: expectedRevision ?? revision }),
          },
        });
      this.update({ problem: message(error) });
      await this.refresh();
      return null;
    } finally {
      if (!this.closed && generation === this.generation) {
        this.update({ busy: false });
        void this.flushVolume();
      }
    }
  }
  /**
   * Like `command`, for callers that report failures themselves: it throws what
   * went wrong (after a fresh `load`, marking the session disconnected if that
   * fails too) and resolves with the whole result, transfer outcome included.
   * The caller owns the connected and busy checks.
   */
  async execute(command: PlayerEdit, expectedRevision: number): Promise<ServerPlayerCommandResult> {
    const generation = this.generation;
    this.update({ busy: true });
    try {
      const result = await this.exchange(command, expectedRevision);
      if (!result) throw new Error("Server player session is closed.");
      return result;
    } catch (error) {
      // Commands are never replayed, including ambiguous transport failures.
      try {
        await this.load();
      } catch {
        this.update({ connected: false });
      }
      throw error;
    } finally {
      if (generation === this.generation) this.update({ busy: false });
    }
  }
}
