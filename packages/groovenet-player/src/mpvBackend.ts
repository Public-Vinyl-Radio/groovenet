import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createConnection, type Socket } from "node:net";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AudioDevice,
  PlaybackBackend,
  PlaybackBackendEvents,
  PlaybackSource,
} from "./types.js";
import { PlayerError } from "./types.js";

export interface MpvBackendOptions {
  executable?: string;
  insecureTls?: boolean;
  /** Let mpv decode and show embedded cover art in its own window. Off by default. */
  artwork?: boolean;
  startupTimeoutMs?: number;
  commandTimeoutMs?: number;
  /** Injectable process and IPC transport for deterministic backend tests. */
  spawnProcess?: (executable: string, args: string[]) => ChildProcess;
  connectSocket?: (path: string) => Socket;
}

interface IpcMessage {
  request_id?: number;
  error?: string;
  data?: unknown;
  event?: string;
  name?: string;
  reason?: string;
  id?: number;
  args?: Array<{ name?: string; data?: unknown }>;
}

/** mpv child process controlled through its line-delimited JSON IPC socket. */
export class MpvBackend extends EventEmitter implements PlaybackBackend {
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private socketPath = join(tmpdir(), `gn-mpv-${process.pid}-${randomUUID().slice(0, 12)}.sock`);
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private startup: Promise<void> | null = null;
  private closing = false;
  private spawnError: PlayerError | null = null;
  private readonly executable: string;
  private readonly startupTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly spawnProcess: NonNullable<MpvBackendOptions["spawnProcess"]>;
  private readonly connectSocket: NonNullable<MpvBackendOptions["connectSocket"]>;
  private duration: number | null = null;

  constructor(options: MpvBackendOptions = {}) {
    super();
    this.executable = options.executable ?? "mpv";
    this.startupTimeoutMs = options.startupTimeoutMs ?? 5000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 5000;
    this.spawnProcess =
      options.spawnProcess ?? ((executable, args) => spawn(executable, args, { stdio: "ignore" }));
    this.connectSocket = options.connectSocket ?? createConnection;
    this.insecureTls = options.insecureTls ?? false;
    this.artwork = options.artwork ?? false;
  }

  private readonly insecureTls: boolean;
  private readonly artwork: boolean;

  // Keep EventEmitter's broad overload for compatibility and add typed event overloads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  on<E extends keyof PlaybackBackendEvents>(event: E, listener: PlaybackBackendEvents[E]): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  off<E extends keyof PlaybackBackendEvents>(event: E, listener: PlaybackBackendEvents[E]): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  async load(source: PlaybackSource): Promise<void> {
    await this.ensureStarted();
    if (source.headers && Object.keys(source.headers).length) {
      const fields = Object.entries(source.headers).map(([name, value]) => `${name}: ${value}`);
      await this.command("set_property", "http-header-fields", fields);
    } else {
      await this.command("set_property", "http-header-fields", []);
    }
    await this.command("loadfile", source.url, "replace");
  }

  async pause(paused: boolean): Promise<void> {
    await this.command("set_property", "pause", paused);
  }

  async seek(seconds: number): Promise<void> {
    await this.command("seek", seconds, "absolute+exact");
  }

  async setVolume(volume: number): Promise<void> {
    await this.command("set_property", "volume", volume);
  }

  async listDevices(): Promise<AudioDevice[]> {
    await this.ensureStarted();
    const result = await this.command("get_property", "audio-device-list");
    if (!Array.isArray(result)) return [];
    return result.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const device = item as { name?: unknown; description?: unknown };
      if (typeof device.name !== "string") return [];
      return [
        {
          id: device.name,
          name: typeof device.description === "string" ? device.description : device.name,
          ...(typeof device.description === "string" ? { description: device.description } : {}),
        },
      ];
    });
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    try {
      await this.ensureStarted();
      await this.command("set_property", "audio-device", deviceId);
    } catch (error) {
      throw new PlayerError(
        "DEVICE_UNAVAILABLE",
        `Could not select audio output “${deviceId}”. Check that the device is connected and visible to mpv.`,
        { cause: error },
      );
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    if (!this.process) return;
    try {
      if (this.socket?.writable) await this.command("quit");
    } catch {
      // The process may already have exited; continue with forced cleanup below.
    }
    const child = this.process;
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await Promise.race([
          new Promise<void>((resolve) => child.once("exit", () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 1000)),
        ]);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
    }
    this.socket?.destroy();
    this.socket = null;
    this.process = null;
    try {
      await unlink(this.socketPath);
    } catch {
      /* socket is already gone */
    }
  }

  private ensureStarted(): Promise<void> {
    if (this.startup) return this.startup;
    this.closing = false;
    this.startup = this.startMpv().catch(async (error: unknown) => {
      await this.cleanupAfterStartupFailure();
      this.startup = null;
      throw error;
    });
    return this.startup;
  }

  private async startMpv(): Promise<void> {
    this.spawnError = null;
    const args = ["--idle=yes", "--no-terminal", `--input-ipc-server=${this.socketPath}`];
    if (this.insecureTls) args.push("--tls-verify=no");
    // Embedded cover art is a video track to mpv, which opens a window for it.
    // --audio-display=no and --force-window=no also cover user mpv.conf settings.
    if (!this.artwork) args.push("--vid=no", "--audio-display=no", "--force-window=no");
    try {
      this.process = this.spawnProcess(this.executable, args);
    } catch (error) {
      throw new PlayerError(
        "MPV_NOT_FOUND",
        "Could not start mpv. Install mpv and ensure it is on PATH.",
        { cause: error },
      );
    }
    const child = this.process;
    child.once("error", (error) => {
      const wrapped = new PlayerError(
        "MPV_NOT_FOUND",
        "Could not start mpv. Install mpv and ensure it is on PATH.",
        { cause: error },
      );
      this.spawnError = wrapped;
      this.rejectPending(wrapped);
      this.reportError(wrapped);
    });
    child.once("exit", (code, signal) => {
      this.socket?.destroy();
      this.socket = null;
      this.rejectPending(
        new PlayerError(
          "MPV_EXITED",
          `mpv exited unexpectedly (${signal ?? code ?? "unknown status"}).`,
        ),
      );
      if (!this.closing) {
        this.startup = null;
        this.reportError(
          new PlayerError(
            "MPV_EXITED",
            `mpv exited unexpectedly (${signal ?? code ?? "unknown status"}).`,
          ),
        );
      }
    });

    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (this.spawnError) throw this.spawnError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new PlayerError(
          "MPV_EXITED",
          "mpv exited while starting. Check the mpv installation and audio output configuration.",
        );
      }
      try {
        await this.connect();
        if (this.spawnError) throw this.spawnError;
        await this.command("observe_property", 1, "time-pos");
        if (this.spawnError) throw this.spawnError;
        await this.command("observe_property", 2, "duration");
        if (this.spawnError) throw this.spawnError;
        return;
      } catch {
        this.socket?.destroy();
        this.socket = null;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    }
    throw new PlayerError("MPV_IPC", "mpv started but its IPC socket did not become ready.");
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.connectSocket(this.socketPath);
      const failed = (error: Error) => {
        socket.destroy();
        reject(error);
      };
      socket.once("error", failed);
      socket.once("connect", () => {
        socket.off("error", failed);
        this.socket = socket;
        socket.on("data", (chunk: Buffer) => this.onData(chunk));
        socket.on("error", (error) =>
          this.rejectPending(
            new PlayerError("MPV_IPC", `mpv IPC connection failed: ${error.message}`, {
              cause: error,
            }),
          ),
        );
        socket.on("close", () =>
          this.rejectPending(new PlayerError("MPV_IPC", "mpv IPC connection closed.")),
        );
        resolve();
      });
    });
  }

  private command(name: string, ...args: unknown[]): Promise<unknown> {
    const socket = this.socket;
    if (!socket?.writable)
      return Promise.reject(new PlayerError("MPV_IPC", "mpv is not connected."));
    const request_id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request_id);
        reject(
          new PlayerError(
            "MPV_IPC",
            `mpv did not answer the “${name}” command within ${this.commandTimeoutMs} ms.`,
          ),
        );
      }, this.commandTimeoutMs);
      this.pending.set(request_id, { resolve, reject, timer });
      socket.write(`${JSON.stringify({ command: [name, ...args], request_id })}\n`, (error) => {
        if (error) {
          const pending = this.pending.get(request_id);
          this.pending.delete(request_id);
          if (pending) clearTimeout(pending.timer);
          reject(
            new PlayerError("MPV_IPC", `Could not send command to mpv: ${error.message}`, {
              cause: error,
            }),
          );
        }
      });
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      let message: IpcMessage;
      try {
        message = JSON.parse(line) as IpcMessage;
      } catch {
        continue;
      }
      if (message.request_id !== undefined) {
        const pending = this.pending.get(message.request_id);
        if (!pending) continue;
        this.pending.delete(message.request_id);
        clearTimeout(pending.timer);
        if (message.error && message.error !== "success")
          pending.reject(this.mapMpvError(message.error));
        else pending.resolve(message.data);
      } else {
        this.onEvent(message);
      }
    }
  }

  private onEvent(message: IpcMessage): void {
    if (message.event === "property-change") {
      const position = message.name === "time-pos" ? message.data : undefined;
      if (message.name === "duration")
        this.duration = typeof message.data === "number" ? message.data : null;
      if (typeof position === "number") {
        this.emit("position", position, this.duration);
      }
    } else if (message.event === "end-file") {
      const reason = message.reason;
      if (reason === "eof") this.emit("ended");
      else if (reason === "error")
        this.reportError(
          new PlayerError(
            "STREAM_FAILED",
            "mpv could not read the audio stream. Check the server URL, API key, and downloaded audio.",
          ),
        );
    }
  }

  private mapMpvError(error: string): PlayerError {
    if (error.includes("audio-device"))
      return new PlayerError(
        "DEVICE_UNAVAILABLE",
        `mpv could not select the audio device: ${error}. Check that it is connected.`,
      );
    return new PlayerError("MPV_IPC", `mpv command failed: ${error}`);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private async cleanupAfterStartupFailure(): Promise<void> {
    this.closing = true;
    this.socket?.destroy();
    this.socket = null;
    const child = this.process;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    this.process = null;
    try {
      await unlink(this.socketPath);
    } catch {
      /* socket was never created or already removed */
    }
  }

  private reportError(error: PlayerError): void {
    // EventEmitter treats an unhandled `error` event as an exception. A backend
    // can be used directly before a client subscribes, so report only to listeners.
    if (this.listenerCount("error") > 0) this.emit("error", error);
  }
}
