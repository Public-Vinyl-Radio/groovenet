import { createConnection, createServer, type Server, type Socket } from "node:net";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PlayerCore } from "./player.js";
import type { Track } from "@groovenet/client";
import { encodeRpcEvent, encodeRpcResponse, PLAYER_PROTOCOL_VERSION, type PlayerRpcRequest } from "./protocol.js";

export interface PlayerDaemonPaths {
  socketPath: string;
  pidPath: string;
}

export interface PlayerDaemonOptions {
  player: PlayerCore;
  paths: PlayerDaemonPaths;
  createServer?: typeof createServer;
  connectSocket?: (path: string) => Socket;
  isProcessAlive?: (pid: number) => boolean;
}

/** Owns the control socket and pidfile for a headless PlayerCore process. */
export class PlayerDaemon {
  private server: Server | null = null;
  private readonly clients = new Set<Socket>();
  private readonly createServer: typeof createServer;
  private readonly connectSocket: (path: string) => Socket;
  private readonly isProcessAlive: (pid: number) => boolean;
  private stopped = false;
  private lastSnapshot: unknown;
  private readonly broadcastChange = (snapshot: unknown) => {
    const current = snapshot as { position?: number; duration?: number | null; queue?: unknown; current?: unknown };
    const previous = this.lastSnapshot as typeof current | undefined;
    this.broadcast("state", snapshot);
    if (current.position !== previous?.position || current.duration !== previous?.duration) this.broadcast("position", { position: current.position, duration: current.duration });
    if (JSON.stringify(current.queue) !== JSON.stringify(previous?.queue)) this.broadcast("queue-change", current.queue);
    this.lastSnapshot = snapshot;
  };
  private readonly broadcastTrackStart = (entry: unknown) => this.broadcast("track-change", entry);
  private readonly broadcastTrackEnd = (entry: unknown) => this.broadcast("track-ended", entry);
  private readonly broadcastTrackSkip = (entry: unknown, error: unknown) => {
    const playerError = error as { code?: unknown; message?: unknown };
    this.broadcast("error", { entry, error: { code: playerError.code, message: playerError.message } });
  };

  constructor(private readonly options: PlayerDaemonOptions) {
    this.createServer = options.createServer ?? createServer;
    this.connectSocket = options.connectSocket ?? createConnection;
    this.isProcessAlive = options.isProcessAlive ?? ((pid) => {
      try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
    });
  }

  async start(): Promise<void> {
    await mkdir(dirname(this.options.paths.socketPath), { recursive: true, mode: 0o700 });
    await this.recoverStaleFiles();
    const server = this.createServer((socket) => this.accept(socket));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { server.off("listening", onListening); reject(error); };
      const onListening = () => { server.off("error", onError); resolve(); };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.options.paths.socketPath);
    });
    await writeFile(this.options.paths.pidPath, `${process.pid}\n`, { mode: 0o600 });
    this.options.player.on("change", this.broadcastChange);
    this.options.player.on("track-started", this.broadcastTrackStart);
    this.options.player.on("track-ended", this.broadcastTrackEnd);
    this.options.player.on("track-skipped", this.broadcastTrackSkip);
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.options.player.off("change", this.broadcastChange);
    this.options.player.off("track-started", this.broadcastTrackStart);
    this.options.player.off("track-ended", this.broadcastTrackEnd);
    this.options.player.off("track-skipped", this.broadcastTrackSkip);
    for (const socket of this.clients) socket.destroy();
    this.clients.clear();
    if (this.server?.listening) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    }
    this.server = null;
    try {
      await this.options.player.close();
    } finally {
      await Promise.all([
        unlink(this.options.paths.socketPath).catch(() => undefined),
        unlink(this.options.paths.pidPath).catch(() => undefined),
      ]);
    }
  }

  private async recoverStaleFiles(): Promise<void> {
    let pid: number | null = null;
    try {
      const parsed = Number.parseInt(await readFile(this.options.paths.pidPath, "utf8"), 10);
      if (Number.isInteger(parsed) && parsed > 0) pid = parsed;
    } catch { /* no pidfile */ }
    // The socket is authoritative. A missing, malformed, or stale pidfile must
    // never cause us to unlink a live daemon's socket.
    if (await this.socketIsActive()) {
      const owner = pid !== null && this.isProcessAlive(pid) ? ` (pid ${pid})` : "";
      throw new Error(`Player daemon already appears to be running${owner}.`);
    }
    await Promise.all([
      unlink(this.options.paths.pidPath).catch(() => undefined),
      unlink(this.options.paths.socketPath).catch(() => undefined),
    ]);
  }

  private async socketIsActive(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const socket = this.connectSocket(this.options.paths.socketPath);
      const finish = (active: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(active);
      };
      const timer = setTimeout(() => finish(false), 250);
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });
  }

  private accept(socket: Socket): void {
    this.clients.add(socket);
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        void this.handleLine(socket, line);
      }
    });
    socket.on("close", () => this.clients.delete(socket));
  }

  private async handleLine(socket: Socket, line: string): Promise<void> {
    let value: unknown;
    try { value = JSON.parse(line) as unknown; } catch {
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id: 0, error: { code: "INVALID_REQUEST", message: "Request must be a JSON object." } }));
      return;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id: 0, error: { code: "INVALID_REQUEST", message: "Request must be a JSON object." } }));
      return;
    }
    const request = value as Partial<PlayerRpcRequest>;
    const id = Number.isInteger(request.id) ? request.id as number : 0;
    if (request.jsonrpc !== "2.0") {
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id, error: { code: "INVALID_REQUEST", message: "Expected JSON-RPC version 2.0." } }));
      return;
    }
    if (request.version !== PLAYER_PROTOCOL_VERSION) {
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id, error: { code: "VERSION_MISMATCH", message: `Unsupported player protocol version ${request.version}; this daemon supports version ${PLAYER_PROTOCOL_VERSION}.` } }));
      return;
    }
    if (!Number.isInteger(request.id) || typeof request.method !== "string" || !request.method) {
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id, error: { code: "INVALID_REQUEST", message: "Request requires an integer id and a non-empty method." } }));
      return;
    }
    const params = request.params === undefined ? {} : request.params;
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id, error: { code: "INVALID_REQUEST", message: "Request params must be a JSON object." } }));
      return;
    }
    try {
      const result = await this.dispatch(request.method, params);
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id, result }));
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "PLAYER_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      socket.write(encodeRpcResponse({ version: PLAYER_PROTOCOL_VERSION, id, error: { code, message } }));
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    const player = this.options.player;
    switch (method) {
      case "status": return player.snapshot;
      case "play":
        if (params.index !== undefined && (typeof params.index !== "number" || !Number.isInteger(params.index) || params.index < 0)) {
          throw new Error("Playback index must be a non-negative integer.");
        }
        if (player.snapshot.status === "paused" && params.index === undefined) await player.resume();
        else await player.play(typeof params.index === "number" ? params.index : undefined);
        return player.snapshot;
      case "pause": await player.pause(); return player.snapshot;
      case "stop": await player.stop(); return player.snapshot;
      case "resume": await player.resume(); return player.snapshot;
      case "next": await player.next(); return player.snapshot;
      case "prev": await player.previous(); return player.snapshot;
      case "seek": await player.seek(this.numberParam(params, "seconds")); return player.snapshot;
      case "volume": await player.setVolume(this.numberParam(params, "volume")); return player.snapshot;
      case "queue.list": return player.snapshot.queue;
      case "queue.remove": {
        const key = params.id ?? params.index;
        if (typeof key !== "string" && typeof key !== "number") throw new Error("Queue remove requires an id or index.");
        const removed = player.remove(key);
        if (!removed) throw new Error(`No queue entry found for ${key}.`);
        return removed;
      }
      case "queue.move": {
        // Same params as the server player's edit: the entry id and its new index.
        const index = player.snapshot.queue.findIndex((entry) => entry.id === params.id);
        if (index < 0) throw new Error(`No queue entry found for ${String(params.id)}.`);
        if (typeof params.to !== "number" || !Number.isInteger(params.to)) throw new Error("Queue move requires an integer `to`.");
        player.move(index, params.to);
        return player.snapshot;
      }
      case "devices": return player.listDevices();
      case "devices.select": {
        if (typeof params.id !== "string" || !params.id) throw new Error("Device selection requires an id.");
        await player.setOutputDevice(params.id);
        return player.listDevices();
      }
      case "queue.add": {
        if (typeof params.playlistId === "string" || typeof params.playlistId === "number") return player.enqueuePlaylist(params.playlistId);
        if (typeof params.query !== "string" || !params.query.trim()) throw new Error("Queue add requires a search query or playlist id.");
        return player.enqueueSearch(params.query);
      }
      case "queue.addTrack": {
        if (typeof params.track !== "object" || params.track === null || Array.isArray(params.track)) throw new Error("Queue add requires a track object.");
        return player.add([params.track as Track]);
      }
      case "shutdown": {
        setImmediate(() => { void this.stop(); });
        return { stopping: true };
      }
      default: throw new Error(`Unknown player command “${method}”.`);
    }
  }

  private numberParam(params: Record<string, unknown>, key: string): number {
    if (typeof params[key] !== "number" || !Number.isFinite(params[key])) throw new Error(`${key} must be a number.`);
    return params[key] as number;
  }

  private broadcast(event: string, data: unknown): void {
    const line = encodeRpcEvent(event, data);
    for (const client of this.clients) if (client.writable) client.write(line);
  }
}
