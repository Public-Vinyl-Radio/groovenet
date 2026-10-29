import { EventEmitter } from "node:events";
import type { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import {
  PlayerControlClient,
  PlayerProtocolError,
  encodeRpcEvent,
  encodeRpcRequest,
  PLAYER_PROTOCOL_VERSION,
} from "./protocol.js";

class FakeSocket extends EventEmitter {
  writable = true;
  destroyed = false;
  write(data: string, callback?: (error?: Error | null) => void): boolean {
    const request = JSON.parse(data) as { id: number; version: number; method: string };
    callback?.();
    queueMicrotask(() =>
      this.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            jsonrpc: "2.0",
            version: request.version,
            id: request.id,
            ...(request.method === "fail"
              ? { error: { code: "REJECTED", message: "no" } }
              : { result: "ok" }),
          }) + "\n",
        ),
      ),
    );
    return true;
  }
  end(): this {
    this.writable = false;
    this.emit("close");
    return this;
  }
  destroy(): this {
    this.destroyed = true;
    this.emit("close");
    return this;
  }
}

describe("player control protocol", () => {
  it("encodes JSON-RPC 2.0 messages with protocol version and newline framing", () => {
    expect(JSON.parse(encodeRpcRequest(4, "seek", { seconds: 12 }))).toEqual({
      jsonrpc: "2.0",
      version: 1,
      id: 4,
      method: "seek",
      params: { seconds: 12 },
    });
    expect(JSON.parse(encodeRpcEvent("position", { position: 8 }))).toMatchObject({
      jsonrpc: "2.0",
      version: PLAYER_PROTOCOL_VERSION,
      event: "position",
    });
  });

  it("correlates request responses and reports daemon errors", async () => {
    const socket = new FakeSocket();
    const client = new PlayerControlClient("fake.sock", 100, () => {
      queueMicrotask(() => socket.emit("connect"));
      return socket as unknown as Socket;
    });
    await expect(client.request("status")).resolves.toBe("ok");
    await expect(client.request("fail")).rejects.toMatchObject({ code: "REJECTED", message: "no" });
    await client.close();
  });

  it("rejects incompatible daemon protocol versions", async () => {
    const socket = new FakeSocket();
    socket.write = function (data: string): boolean {
      const request = JSON.parse(data) as { id: number };
      queueMicrotask(() =>
        this.emit(
          "data",
          Buffer.from(
            JSON.stringify({ jsonrpc: "2.0", version: 99, id: request.id, result: true }) + "\n",
          ),
        ),
      );
      return true;
    };
    const client = new PlayerControlClient("fake.sock", 100, () => {
      queueMicrotask(() => socket.emit("connect"));
      return socket as unknown as Socket;
    });
    await expect(client.request("status")).rejects.toBeInstanceOf(PlayerProtocolError);
    await client.close();
  });

  it("forwards daemon events without consuming response ids", async () => {
    const socket = new FakeSocket();
    const write = socket.write.bind(socket);
    socket.write = (data: string, callback?: (error?: Error | null) => void) => {
      const result = write(data, callback);
      queueMicrotask(() =>
        socket.emit("data", Buffer.from(encodeRpcEvent("position", { position: 4 }))),
      );
      return result;
    };
    const client = new PlayerControlClient("fake.sock", 100, () => {
      queueMicrotask(() => socket.emit("connect"));
      return socket as unknown as Socket;
    });
    const event = new Promise((resolve) => client.once("event", resolve));
    await expect(client.request("status")).resolves.toBe("ok");
    await expect(event).resolves.toMatchObject({ event: "position", data: { position: 4 } });
    await client.close();
  });

  it("ignores unknown response ids and rejects requests on a non-writable connection", async () => {
    const socket = new FakeSocket();
    const write = socket.write.bind(socket);
    socket.write = (data: string, callback?: (error?: Error | null) => void) => {
      const request = JSON.parse(data) as { id: number; version: number };
      socket.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            jsonrpc: "2.0",
            version: request.version,
            id: request.id + 100,
            result: "stale",
          }) + "\n",
        ),
      );
      return write(data, callback);
    };
    const client = new PlayerControlClient("fake.sock", 100, () => {
      queueMicrotask(() => socket.emit("connect"));
      return socket as unknown as Socket;
    });
    await expect(client.request("status")).resolves.toBe("ok");
    await client.close();

    const closedSocket = new FakeSocket();
    const closedClient = new PlayerControlClient("fake.sock", 100, () => {
      queueMicrotask(() => {
        closedSocket.writable = false;
        closedSocket.emit("connect");
      });
      return closedSocket as unknown as Socket;
    });
    await expect(closedClient.request("status")).rejects.toMatchObject({
      code: "DAEMON_UNAVAILABLE",
    });
  });

  it("reports connection, write, and request timeout failures", async () => {
    const unavailable = new FakeSocket();
    const unavailableClient = new PlayerControlClient("fake.sock", 10, () => {
      queueMicrotask(() => unavailable.emit("error", new Error("missing socket")));
      return unavailable as unknown as Socket;
    });
    await expect(unavailableClient.request("status")).rejects.toMatchObject({
      code: "DAEMON_UNAVAILABLE",
    });

    const failedWrite = new FakeSocket();
    failedWrite.write = (_data: string, callback?: (error?: Error | null) => void) => {
      callback?.(new Error("write failed"));
      return false;
    };
    const writeClient = new PlayerControlClient("fake.sock", 10, () => {
      queueMicrotask(() => failedWrite.emit("connect"));
      return failedWrite as unknown as Socket;
    });
    await expect(writeClient.request("status")).rejects.toMatchObject({ code: "IPC_ERROR" });

    const noReply = new FakeSocket();
    noReply.write = () => true;
    const timeoutClient = new PlayerControlClient("fake.sock", 1, () => {
      queueMicrotask(() => noReply.emit("connect"));
      return noReply as unknown as Socket;
    });
    await expect(timeoutClient.request("status")).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await timeoutClient.close();
  });
});
