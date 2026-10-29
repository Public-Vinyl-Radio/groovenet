import { EventEmitter } from "node:events";
import { createConnection, type Socket } from "node:net";

export const PLAYER_PROTOCOL_VERSION = 1;

export interface PlayerRpcRequest {
  jsonrpc: "2.0";
  version: number;
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface PlayerRpcError {
  code: string;
  message: string;
}

export interface PlayerRpcResponse {
  jsonrpc: "2.0";
  version: number;
  id: number;
  result?: unknown;
  error?: PlayerRpcError;
}

export interface PlayerRpcEvent {
  jsonrpc: "2.0";
  version: number;
  event: string;
  data: unknown;
}

export class PlayerProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PlayerProtocolError";
  }
}

export type PlayerSocketConnector = (path: string) => Socket;

export function encodeRpcRequest(
  id: number,
  method: string,
  params?: Record<string, unknown>,
): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    version: PLAYER_PROTOCOL_VERSION,
    id,
    method,
    ...(params ? { params } : {}),
  } satisfies PlayerRpcRequest)}\n`;
}

export function encodeRpcResponse(response: Omit<PlayerRpcResponse, "jsonrpc">): string {
  return `${JSON.stringify({ ...response, jsonrpc: "2.0" })}\n`;
}

export function encodeRpcEvent(event: string, data: unknown): string {
  return `${JSON.stringify({ jsonrpc: "2.0", version: PLAYER_PROTOCOL_VERSION, event, data } satisfies PlayerRpcEvent)}\n`;
}

export class PlayerControlClient extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = "";
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(
    private readonly socketPath: string,
    private readonly timeoutMs = 5000,
    private readonly connectSocket: PlayerSocketConnector = createConnection,
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.socket?.writable) return;
    const socket = this.connectSocket(this.socketPath);
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => {
        socket.destroy();
        reject(
          new PlayerProtocolError(
            "DAEMON_UNAVAILABLE",
            `Player daemon is unavailable. Start it with “groovenet player start --detach”. (${error.message})`,
          ),
        );
      };
      socket.once("error", failed);
      socket.once("connect", () => {
        socket.off("error", failed);
        this.socket = socket;
        socket.on("data", (chunk: Buffer) => this.onData(chunk));
        socket.on("error", (error) =>
          this.rejectPending(new PlayerProtocolError("IPC_ERROR", error.message)),
        );
        socket.on("close", () => {
          this.socket = null;
          this.rejectPending(
            new PlayerProtocolError("DAEMON_DISCONNECTED", "Player daemon disconnected."),
          );
          this.emit("disconnect");
        });
        resolve();
      });
    });
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    await this.connect();
    const socket = this.socket;
    if (!socket?.writable)
      throw new PlayerProtocolError("DAEMON_UNAVAILABLE", "Player daemon is not connected.");
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new PlayerProtocolError(
            "REQUEST_TIMEOUT",
            `Player daemon did not respond to “${method}”.`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve: (result) => resolve(result as T), reject, timer });
      socket.write(encodeRpcRequest(id, method, params), (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        this.pending.delete(id);
        if (pending) clearTimeout(pending.timer);
        reject(
          new PlayerProtocolError(
            "IPC_ERROR",
            `Could not send “${method}” to the player daemon: ${error.message}`,
          ),
        );
      });
    });
  }

  async close(): Promise<void> {
    this.socket?.end();
    this.socket = null;
    this.rejectPending(
      new PlayerProtocolError("CLIENT_CLOSED", "Player control connection closed."),
    );
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      let message: PlayerRpcResponse | PlayerRpcEvent;
      try {
        message = JSON.parse(line) as PlayerRpcResponse | PlayerRpcEvent;
      } catch {
        continue;
      }
      if (message.version !== PLAYER_PROTOCOL_VERSION) {
        this.rejectPending(
          new PlayerProtocolError(
            "VERSION_MISMATCH",
            `Player protocol mismatch (daemon version ${message.version}, client version ${PLAYER_PROTOCOL_VERSION}). Upgrade the Groovenet packages together.`,
          ),
        );
        continue;
      }
      if ("id" in message) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error)
          pending.reject(new PlayerProtocolError(message.error.code, message.error.message));
        else pending.resolve(message.result);
      } else {
        this.emit("event", message);
      }
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
