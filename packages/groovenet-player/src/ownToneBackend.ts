import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { posix } from "node:path";
import type { AudioDevice, PlaybackBackend, PlaybackSource } from "./types.js";
import { PlayerError } from "./types.js";

export interface OwnToneBackendOptions {
  /** Dedicated OwnTone 29.3 engine, including /api. No shared engine queues. */
  apiUrl: string;
  password?: string;
  outputId?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** Injectable HTTP transport; requests still carry an abort deadline. */
  fetch?: typeof globalThis.fetch;
}

interface Status {
  state: "play" | "pause" | "stop";
  item_id: number;
  item_progress_ms: number;
  item_length_ms: number;
  groovenet_terminal: Terminal;
}
interface Terminal {
  version: 1;
  instance: string;
  sequence: number;
  item_id: number;
  reason: "none" | "eof" | "input_error" | "failed" | "output_lost" | "interrupted";
}
interface Output {
  id: string;
  name: string;
  type: string;
  selected: boolean;
  connected?: boolean;
  requires_auth?: boolean;
  needs_auth_key?: boolean;
  busy?: boolean;
  prevent_playback?: boolean;
}
interface QueueItem { id: number; file_id: number; }
interface EngineQueue { version: number; items: QueueItem[]; }
interface Session { itemId: number; queueVersion: number; instance: string; sequence: number; }
interface FailedSession extends Session { terminalSequence: number; terminalReason: Terminal["reason"]; }

/**
 * Single-output adapter for a dedicated OwnTone engine with terminal-v1.patch.
 * Unpatched engines are refused; a stopped state alone never means EOF.
 */
export class OwnToneBackend extends EventEmitter implements PlaybackBackend {
  private readonly apiUrl: URL;
  private readonly transport: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly authorization?: string;
  private outputId?: string;
  private session: Session | null = null;
  private finishedSession: Session | null = null;
  private failedSession: FailedSession | null = null;
  private selected = false;
  private uncertain = false;
  private closed = false;
  private timer?: NodeJS.Timeout;
  private closing?: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(options: OwnToneBackendOptions) {
    super();
    try {
      this.apiUrl = new URL(options.apiUrl.endsWith("/") ? options.apiUrl : `${options.apiUrl}/`);
    } catch {
      throw new PlayerError("INVALID_ARGUMENT", "OwnTone API URL must be an absolute HTTP(S) URL");
    }
    if (!["http:", "https:"].includes(this.apiUrl.protocol) || this.apiUrl.username || this.apiUrl.password || this.apiUrl.search || this.apiUrl.hash) {
      throw new PlayerError("INVALID_ARGUMENT", "OwnTone API URL must use HTTP(S), without credentials, query or fragment");
    }
    this.transport = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    if (![this.timeoutMs, this.pollIntervalMs].every((value) => Number.isFinite(value) && value > 0)) {
      throw new PlayerError("INVALID_ARGUMENT", "OwnTone timeouts and polling interval must be positive");
    }
    this.authorization = options.password === undefined ? undefined : `Basic ${Buffer.from(`admin:${options.password}`).toString("base64")}`;
    this.outputId = options.outputId;
  }

  // All commands and polls share a serial lane: no delayed response from an old
  // load can emit an event for the next track, or race cleanup.
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => {
      if (this.closed) throw new PlayerError("ENGINE_UNAVAILABLE", "OwnTone backend is closed");
      return operation();
    });
    this.tail = result.catch(() => {});
    return result;
  }

  load(source: PlaybackSource): Promise<void> {
    return this.serial(async () => {
      // Only indexed files have verified finite-track semantics. In particular,
      // never strip Authorization from an app HTTP URL and enqueue it as a stream.
      let path: string;
      try { path = fileURLToPath(source.url); }
      catch { throw new PlayerError("STREAM_FAILED", "OwnTone requires a file URL in its indexed shared library; authenticated HTTP sources are not supported"); }
      if (source.headers && Object.keys(source.headers).length) {
        throw new PlayerError("STREAM_FAILED", "OwnTone indexed sources cannot include HTTP headers");
      }
      const params = new URLSearchParams({ directory: posix.dirname(path) });
      const search = await this.request<{ tracks: { items: { id: number; path: string; data_kind: string; length_ms: number }[] } }>(`library/files?${params}`);
      const tracks = search?.tracks?.items;
      if (!Array.isArray(tracks) || tracks.some((track) => !track || typeof track.path !== "string")) throw this.invalidResponse();
      const matches = tracks.filter((track) => track.path === path && track.data_kind === "file" && Number.isSafeInteger(track.id) && track.id > 0 && track.length_ms > 0);
      if (matches.length !== 1) throw new PlayerError("NO_AUDIO", "Audio file is missing, ambiguous, or not yet indexed in OwnTone");
      const status = await this.status();
      if (status.state !== "stop" && (!this.session || !this.owns(status, await this.queue()))) {
        throw new PlayerError("DEVICE_BUSY", "OwnTone has an unowned active or paused session; explicitly stop that engine before loading Groovenet audio");
      }
      if (!this.outputId) throw new PlayerError("DEVICE_UNAVAILABLE", "Select one OwnTone output before playback");
      // Device selection is an explicit load-time action, never a reconnect action.
      await this.select(this.outputId);
      this.session = null;
      this.finishedSession = null;
      this.failedSession = null;
      this.cancelPoll();
      await this.request("player/stop", "PUT");
      await this.request("player/repeat?state=off", "PUT");
      await this.request("player/consume?state=false", "PUT");
      await this.request("player/shuffle?state=false", "PUT");
      const queue = await this.request<EngineQueue>(`queue/items/add?${new URLSearchParams({ uris: `library:track:${matches[0]!.id}`, clear: "true" })}`, "POST");
      this.validateQueue(queue);
      if (queue.items.length !== 1) throw new PlayerError("STREAM_FAILED", "OwnTone did not queue exactly one audio file");
      this.session = { itemId: queue.items[0]!.id, queueVersion: queue.version, instance: status.groovenet_terminal.instance, sequence: status.groovenet_terminal.sequence };
      try {
        await this.request("player/play", "PUT");
      } catch (error) {
        // A lost reply can mean playback started. Keep the item identity for
        // explicit close/reconciliation, without retrying the play command.
        this.uncertain = true;
        this.schedulePoll();
        throw error;
      }
      this.uncertain = false;
      this.schedulePoll();
    });
  }

  pause(paused: boolean): Promise<void> {
    return this.serial(async () => {
      await this.assertOwned();
      await this.request(`player/${paused ? "pause" : "play"}`, "PUT");
    });
  }

  seek(seconds: number): Promise<void> {
    return this.serial(async () => {
      if (!Number.isFinite(seconds) || seconds < 0) throw new PlayerError("INVALID_ARGUMENT", "Seek position must be non-negative seconds");
      await this.assertOwned();
      await this.request(`player/seek?position_ms=${Math.round(seconds * 1000)}`, "PUT");
    });
  }

  setVolume(volume: number): Promise<void> {
    return this.serial(async () => {
      if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new PlayerError("INVALID_ARGUMENT", "Volume must be between 0 and 100");
      if (!this.outputId || !this.selected) throw new PlayerError("DEVICE_UNAVAILABLE", "Select an OwnTone output before setting volume");
      if (this.session) await this.assertOwned();
      if (!(await this.output(this.outputId)).selected) throw new PlayerError("DEVICE_UNAVAILABLE", "OwnTone output was deselected");
      await this.request(`outputs/${encodeURIComponent(this.outputId)}`, "PUT", { volume });
    });
  }

  listDevices(): Promise<AudioDevice[]> {
    return this.serial(async () => (await this.outputs()).map(({ id, name, type }) => ({ id, name, description: type })));
  }

  outputConnection(): Promise<"connected" | "disconnected" | "unknown"> {
    return this.serial(async () => {
      if (!this.outputId) return "unknown";
      const output = (await this.outputs()).find((candidate) => candidate.id === this.outputId);
      if (!output?.selected) return "disconnected";
      if (output.connected === undefined) return "unknown";
      return output.connected ? "connected" : "disconnected";
    });
  }

  setOutputDevice(id: string): Promise<void> {
    return this.serial(async () => {
      const status = await this.status();
      if (status.state !== "stop") await this.assertOwned();
      await this.select(id);
      this.outputId = id;
    });
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = this.serial(async () => {
      this.cancelPoll();
      try {
        if (this.session || this.finishedSession || this.failedSession || this.selected) {
          const status = await this.status();
          const queue = await this.queue();
          const finished = this.finishedSession;
          const completed = finished && status.state === "stop" && status.groovenet_terminal.instance === finished.instance && status.groovenet_terminal.item_id === finished.itemId && status.groovenet_terminal.reason === "eof" && (queue.items.length === 0 || (queue.version === finished.queueVersion && queue.items.length === 1 && queue.items[0]!.id === finished.itemId));
          const stoppedOwned = this.session && status.state === "stop" && status.groovenet_terminal.instance === this.session.instance && queue.version === this.session.queueVersion && queue.items.length === 1 && queue.items[0]!.id === this.session.itemId;
          const outputs = await this.outputs();
          const foreignOutput = outputs.some((output) => output.selected && output.id !== this.outputId);
          const failed = status.state !== "play" && this.matchesFailedSession(status, queue);
          if (!foreignOutput && (this.owns(status, queue) || completed || stoppedOwned || failed || (!this.session && !finished && this.selected && status.state === "stop" && queue.items.length === 0))) {
            await this.request("player/stop", "PUT");
            await this.request("queue/clear", "PUT");
            await this.request("outputs/set", "PUT", { outputs: [] });
          }
        }
      } finally {
        this.session = null;
        this.failedSession = null;
        this.selected = false;
        this.closed = true;
      }
    });
    return this.closing;
  }

  private async request<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      const response = await this.transport(new URL(path, this.apiUrl), {
        method, signal, redirect: "error",
        headers: { ...(this.authorization ? { Authorization: this.authorization } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? "ENGINE_AUTH" : response.status === 409 ? "DEVICE_BUSY" : "ENGINE_API";
        // Do not include engine body, URL, password or source path in errors.
        throw new PlayerError(code, `OwnTone API returned HTTP ${response.status}`);
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof PlayerError) throw error;
      throw new PlayerError(signal.aborted ? "ENGINE_TIMEOUT" : "ENGINE_UNAVAILABLE", signal.aborted ? "OwnTone API request timed out" : "OwnTone API is unreachable or returned invalid JSON");
    }
  }

  private invalidResponse(): PlayerError { return new PlayerError("ENGINE_API", "OwnTone returned an invalid API response"); }

  private async status(): Promise<Status> {
    const status = await this.request<Status>("player");
    if (!status || !["play", "pause", "stop"].includes(status.state) || !Number.isSafeInteger(status.item_id) || !Number.isFinite(status.item_progress_ms) || !Number.isFinite(status.item_length_ms)) throw this.invalidResponse();
    const terminal = status.groovenet_terminal;
    if (!terminal || terminal.version !== 1 || !/^[a-f0-9]{32}$/.test(terminal.instance) || !Number.isSafeInteger(terminal.sequence) || terminal.sequence < 0 || !Number.isSafeInteger(terminal.item_id) || !["none", "eof", "input_error", "failed", "output_lost", "interrupted"].includes(terminal.reason)) {
      throw new PlayerError("ENGINE_INCOMPATIBLE", "OwnTone requires the Groovenet terminal-v1 extension for reliable completion events");
    }
    return status;
  }

  private validateQueue(queue: EngineQueue): void {
    if (!queue || !Number.isSafeInteger(queue.version) || !Array.isArray(queue.items) || queue.items.some((item) => !item || !Number.isSafeInteger(item.id))) throw this.invalidResponse();
  }

  private async queue(): Promise<EngineQueue> {
    const queue = await this.request<EngineQueue>("queue");
    this.validateQueue(queue);
    return queue;
  }

  private async outputs(): Promise<Output[]> {
    const result = await this.request<{ outputs: Output[] }>("outputs");
    if (!Array.isArray(result?.outputs) || result.outputs.some((output) => !output || typeof output.id !== "string" || typeof output.name !== "string" || typeof output.selected !== "boolean" || typeof output.type !== "string")) throw this.invalidResponse();
    return result.outputs;
  }

  private async output(id: string): Promise<Output> {
    const output = (await this.outputs()).find((output) => output.id === id);
    if (!output) throw new PlayerError("DEVICE_UNAVAILABLE", "OwnTone output is unavailable");
    if (output.busy || output.prevent_playback) throw new PlayerError("DEVICE_BUSY", "OwnTone output is busy");
    if (output.requires_auth || output.needs_auth_key) throw new PlayerError("DEVICE_AUTH", "Authorize this output in OwnTone before using it");
    return output;
  }

  private async select(id: string): Promise<void> {
    if (!id) throw new PlayerError("INVALID_ARGUMENT", "OwnTone output ID must not be empty");
    await this.output(id);
    this.selected = false;
    await this.request("outputs/set", "PUT", { outputs: [id] });
    const outputs = await this.outputs();
    if (outputs.filter((output) => output.selected).length !== 1 || !outputs.some((output) => output.id === id && output.selected)) {
      throw new PlayerError("DEVICE_UNAVAILABLE", "OwnTone could not select the requested single output");
    }
    this.selected = true;
  }

  private owns(status: Status, queue: EngineQueue): boolean {
    return this.session !== null && status.groovenet_terminal.instance === this.session.instance && !this.terminalForSession(status) && status.state !== "stop" && status.item_id === this.session.itemId && queue.version === this.session.queueVersion && queue.items.length === 1 && queue.items[0]!.id === this.session.itemId;
  }

  private terminalForSession(status: Status): boolean {
    return this.session !== null && status.groovenet_terminal.instance === this.session.instance && status.groovenet_terminal.sequence > this.session.sequence && status.groovenet_terminal.item_id === this.session.itemId;
  }

  /** Retain cleanup identity only for a terminal failure of our unchanged item.
   * Polls never reconnect or replay. close() rechecks this identity before writes.
   */
  private rememberFailure(status: Status, queue: EngineQueue): void {
    if (this.session && this.terminalForSession(status) && ["output_lost", "input_error", "failed"].includes(status.groovenet_terminal.reason)) {
      this.failedSession = { ...this.session, terminalSequence: status.groovenet_terminal.sequence, terminalReason: status.groovenet_terminal.reason };
      if (!this.matchesFailedSession(status, queue)) this.failedSession = null;
    }
  }

  private matchesFailedSession(status: Status, queue: EngineQueue): boolean {
    const failed = this.failedSession;
    return failed !== null && status.groovenet_terminal.instance === failed.instance
      && status.item_id === failed.itemId && status.groovenet_terminal.item_id === failed.itemId
      && status.groovenet_terminal.sequence === failed.terminalSequence && status.groovenet_terminal.reason === failed.terminalReason
      && queue.version === failed.queueVersion && queue.items.length === 1 && queue.items[0]!.id === failed.itemId;
  }

  private async assertOwned(): Promise<Status> {
    const status = await this.status();
    const queue = await this.queue();
    if (!this.owns(status, queue)) {
      this.rememberFailure(status, queue);
      this.session = null;
      throw new PlayerError("PLAYBACK_INTERRUPTED", "OwnTone playback stopped or was replaced; explicitly play again to start a session");
    }
    return status;
  }

  private schedulePoll(): void {
    this.timer = setTimeout(() => {
      void this.serial(async () => {
        if (!this.session) return;
        try {
          const status = await this.status();
          const queue = await this.queue();
          if (!this.uncertain && this.terminalForSession(status) && status.groovenet_terminal.reason === "eof" && status.state === "stop" && (queue.items.length === 0 || (queue.version === this.session!.queueVersion && queue.items.length === 1 && queue.items[0]!.id === this.session!.itemId))) {
            this.finishedSession = this.session;
            this.session = null;
            this.emit("ended");
            return;
          }
          if (!this.owns(status, queue)) {
            this.rememberFailure(status, queue);
            const reason = status.groovenet_terminal.instance !== this.session!.instance ? "engine restarted" : this.terminalForSession(status) ? status.groovenet_terminal.reason : status.state === "stop" ? "stopped" : queue.version !== this.session!.queueVersion ? "queue changed" : "item replaced";
            throw new PlayerError("PLAYBACK_INTERRUPTED", `OwnTone playback interrupted (${reason}); the queue has not advanced. Check the engine/receiver, then explicitly play again when ready.`);
          }
          const outputs = await this.outputs();
          const output = outputs.find((output) => output.id === this.outputId);
          if (outputs.filter((output) => output.selected).length !== 1 || !output?.selected) throw new PlayerError("DEVICE_UNAVAILABLE", "OwnTone output was disconnected or deselected");
          this.uncertain = false;
          this.emit("position", Math.max(0, status.item_progress_ms) / 1000, status.item_length_ms > 0 ? status.item_length_ms / 1000 : null);
          this.schedulePoll();
        } catch (error) {
          if (error instanceof PlayerError && (error.code === "ENGINE_UNAVAILABLE" || error.code === "ENGINE_TIMEOUT")) {
            // Reconcile using reads only. Never infer EOF across a connection gap.
            if (!this.uncertain) this.emit("error", error);
            this.uncertain = true;
            this.schedulePoll();
          } else {
            this.session = null;
            this.selected = false;
            this.emit("error", error);
          }
        }
      }).catch(() => { /* close() can win the serial lane */ });
    }, this.pollIntervalMs);
    this.timer.unref();
  }

  private cancelPoll(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
