import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ServerPlayerSession,
  TrackLookup,
  type ServerPlayerTransport,
  type Track,
} from "@groovenet/client";
import { playerIdSchema } from "@groovenet/contracts";
import { encodeRpcEvent, encodeRpcResponse } from "./protocol.js";
import type { PlaybackSnapshot } from "./types.js";

/** Remote observation only: never owns audio, changes outputs, or acknowledges takeover. */
export class RemoteNowPlaying extends EventEmitter {
  readonly session: ServerPlayerSession;
  private readonly lookup: TrackLookup;
  private metadataKey = "";
  private closed = false;

  constructor(
    id: string,
    transport: ServerPlayerTransport,
    fetchTracks: (refs: Array<{ track_id: string; friend_id: number }>) => Promise<Track[]>,
  ) {
    super();
    playerIdSchema.parse(id);
    this.lookup = new TrackLookup(fetchTracks);
    this.session = new ServerPlayerSession(id, transport, {
      devices: false,
      onDisconnect: () => {
        this.close();
        this.emit("disconnect");
      },
    });
    this.session.subscribe(() => {
      const { player, connected } = this.session.getSnapshot();
      if (this.closed || !player || !connected) return;
      this.emit("state", this.snapshot());
      const current = player.state.queue.find(
        (entry) => entry.id === player.state.current_entry_id,
      );
      const key = current ? `${current.friend_id}:${current.track_id}` : "";
      if (key === this.metadataKey) return;
      this.metadataKey = key;
      if (current) {
        void this.lookup.load([current]).then(
          () => {
            // Publish the latest state, never a captured track/position from before the fetch.
            if (!this.closed && this.session.getSnapshot().connected)
              this.emit("state", this.snapshot());
          },
          () => {}, // Collection metadata is optional; retain the server title/artist.
        );
      }
    });
  }

  async start(timeoutMs = 10_000): Promise<void> {
    try {
      await this.session.load(); // Surface authentication/unknown-player errors immediately.
      this.session.start();
      let timer: ReturnType<typeof setTimeout>;
      try {
        const ready = await Promise.race([
          this.session.ready(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Timed out waiting for remote player events.")),
              timeoutMs,
            );
          }),
        ]);
        if (!ready) throw new Error("Remote player disconnected before its first snapshot.");
      } finally {
        clearTimeout(timer!);
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }

  snapshot(): PlaybackSnapshot {
    const { player, connected } = this.session.getSnapshot();
    if (this.closed || !connected || !player)
      throw new Error(
        "Remote player is disconnected. Restart the companion; server playback continues.",
      );
    const queue = player.state.queue.map(({ id, ...entry }) => ({
      id,
      track: { album: "", ...this.lookup.get(entry), ...entry },
    }));
    return {
      status: player.state.checkpoint ? "stopped" : player.state.status,
      current: queue.find((entry) => entry.id === player.state.current_entry_id) ?? null,
      queue,
      position: player.state.position,
      duration: player.state.duration,
      volume: player.state.volume,
      error: player.state.error as PlaybackSnapshot["error"],
    };
  }

  async request(method: string): Promise<PlaybackSnapshot> {
    this.snapshot(); // Refuse stale/disconnected commands. No local fallback.
    if (method === "status") return this.snapshot();
    const type = method === "prev" ? "previous" : method;
    if (
      type !== "play" &&
      type !== "pause" &&
      type !== "resume" &&
      type !== "next" &&
      type !== "previous"
    )
      throw new Error(`Unsupported Now Playing command: ${method}`);
    const { player, busy } = this.session.getSnapshot();
    if (busy)
      throw new Error("A remote command is already in progress. Try again when it completes.");
    await this.session.execute({ type }, player!.revision);
    return this.snapshot();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.session.close();
  }
}

/** Presents the existing versioned daemon protocol on a private, temporary socket. */
export async function startRemoteSocket(controller: RemoteNowPlaying): Promise<{
  socketPath: string;
  close: () => Promise<void>;
}> {
  const directory = await mkdtemp(join(tmpdir(), "gn-np-"));
  const socketPath = join(directory, "player.sock");
  const clients = new Set<Socket>();
  const send = (socket: Socket, message: string) => {
    if (!socket.destroyed && socket.writableLength <= 1024 * 1024) socket.write(message);
    else socket.destroy();
  };
  const state = (snapshot: PlaybackSnapshot) => {
    for (const socket of clients) send(socket, encodeRpcEvent("state", snapshot));
  };
  const disconnected = () => {
    for (const socket of clients) socket.destroy();
  };
  const server = createServer((socket) => {
    clients.add(socket);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => clients.delete(socket));
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 65536) {
        socket.destroy();
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        void (async () => {
          let id = 0;
          try {
            const request = JSON.parse(line);
            if (
              request.jsonrpc !== "2.0" ||
              !Number.isInteger(request.id) ||
              typeof request.method !== "string"
            )
              throw new Error("Invalid JSON-RPC request.");
            id = request.id;
            if (request.version !== 1)
              throw new Error(
                "Unsupported player protocol version; upgrade Groovenet packages together.",
              );
            const result = await controller.request(request.method);
            send(socket, encodeRpcResponse({ version: 1, id, result }));
          } catch (error) {
            send(
              socket,
              encodeRpcResponse({
                version: 1,
                id,
                error: {
                  code: "REMOTE_PLAYER_ERROR",
                  message: error instanceof Error ? error.message : "Remote player request failed.",
                },
              }),
            );
          }
        })();
      }
    });
  });
  controller.on("state", state);
  controller.on("disconnect", disconnected);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
  } catch (error) {
    controller.off("state", state);
    controller.off("disconnect", disconnected);
    controller.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    socketPath,
    async close() {
      controller.off("state", state);
      controller.off("disconnect", disconnected);
      controller.close();
      disconnected();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    },
  };
}
