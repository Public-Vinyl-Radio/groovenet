import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { Socket } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MpvBackend, type MpvBackendOptions } from "./mpvBackend.js";

class FakeSocket extends EventEmitter {
  writable = true;
  failWrites = false;

  constructor(
    private readonly respond: (
      request: { request_id: number; command: unknown[] },
      socket: FakeSocket,
    ) => void,
  ) {
    super();
  }

  write(input: string, callback?: (error?: Error | null) => void): boolean {
    if (this.failWrites) {
      callback?.(new Error("socket write failed"));
      return false;
    }
    for (const line of input.trim().split("\n")) {
      if (line) this.respond(JSON.parse(line) as { request_id: number; command: unknown[] }, this);
    }
    callback?.();
    return true;
  }

  destroy(): this {
    this.writable = false;
    this.emit("close");
    return this;
  }
}

function makeFakeProcess() {
  const child = Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
      child.signalCode = signal;
      setImmediate(() => child.emit("exit", null, signal));
      return true;
    }),
  });
  return child as unknown as ChildProcess & typeof child;
}

function makeBackend(
  options: {
    badDevice?: boolean | "device";
    commandFailure?: boolean;
    exitOnStart?: boolean;
    errorOnQuit?: boolean;
    emitSpawnError?: boolean;
    ignoreTerm?: boolean;
    failStream?: boolean;
    finishStream?: boolean;
    deviceData?: unknown;
    disconnectOnCommand?: boolean;
    noResponse?: boolean;
    noise?: boolean;
    unavailableSocket?: boolean;
    writeError?: boolean;
    spawnFailure?: boolean;
    startupTimeoutMs?: number;
    commandTimeoutMs?: number;
    insecureTls?: boolean;
    artwork?: boolean;
  } = {},
) {
  const child = makeFakeProcess();
  const requests: Array<{ command: unknown[] }> = [];
  const sockets: FakeSocket[] = [];
  const spawnArgs: string[][] = [];
  if (options.ignoreTerm) {
    child.kill.mockImplementation((signal: NodeJS.Signals = "SIGTERM") => {
      if (signal === "SIGKILL") {
        child.signalCode = signal;
        setImmediate(() => child.emit("exit", null, signal));
      }
      return true;
    });
  }
  const backend = new MpvBackend({
    startupTimeoutMs: options.startupTimeoutMs,
    commandTimeoutMs: options.commandTimeoutMs,
    insecureTls: options.insecureTls,
    artwork: options.artwork,
    spawnProcess: (_executable, args) => {
      if (options.spawnFailure) throw new Error("spawn ENOENT");
      spawnArgs.push(args);
      if (options.exitOnStart) {
        child.exitCode = 1;
        setImmediate(() => child.emit("exit", 1, null));
      }
      if (options.emitSpawnError)
        setImmediate(() => child.emit("error", new Error("spawn ENOENT")));
      return child;
    },
    // Keep arguments available for checking TLS settings passed to mpv.
    executable: "fake-mpv",
    connectSocket: () => {
      const socket = new FakeSocket((request, activeSocket) => {
        requests.push({ command: request.command });
        const [command, ...args] = request.command;
        const response: Record<string, unknown> = {
          request_id: request.request_id,
          error: "success",
        };
        if (command === "get_property" && args[0] === "audio-device-list") {
          response.data = Object.hasOwn(options, "deviceData")
            ? options.deviceData
            : [{ name: "default", description: "Built-in output" }];
        }
        if (command === "set_property" && args[0] === "audio-device" && options.badDevice) {
          response.error =
            options.badDevice === "device" ? "audio-device unavailable" : "property unavailable";
        }
        if (command === "seek" && options.commandFailure) response.error = "invalid parameter";
        if (command === "quit" && options.errorOnQuit) response.error = "command failed";
        if (options.noise)
          activeSocket.emit(
            "data",
            Buffer.from(`not-json\n${JSON.stringify({ request_id: 99999, error: "success" })}\n`),
          );
        if (
          !options.noResponse &&
          !(options.disconnectOnCommand && command === "observe_property")
        ) {
          activeSocket.emit("data", Buffer.from(`${JSON.stringify(response)}\n`));
        }
        if (options.disconnectOnCommand && command === "observe_property") {
          setImmediate(() => activeSocket.emit("error", new Error("simulated IPC disconnect")));
        }
        if (command === "loadfile" && options.failStream) {
          activeSocket.emit(
            "data",
            Buffer.from(`${JSON.stringify({ event: "end-file", reason: "error" })}\n`),
          );
        } else if (command === "loadfile" && options.finishStream) {
          activeSocket.emit(
            "data",
            Buffer.from(`${JSON.stringify({ event: "end-file", reason: "eof" })}\n`),
          );
        } else if (command === "loadfile") {
          activeSocket.emit(
            "data",
            Buffer.from(
              [
                JSON.stringify({ event: "property-change", name: "duration", data: 90 }),
                JSON.stringify({ event: "property-change", name: "time-pos", data: 12 }),
              ].join("\n") + "\n",
            ),
          );
        } else if (command === "quit") {
          setImmediate(() => {
            child.exitCode = 0;
            child.emit("exit", 0, null);
            activeSocket.destroy();
          });
        }
      });
      socket.failWrites = Boolean(options.writeError);
      sockets.push(socket);
      if (options.unavailableSocket) {
        setImmediate(() => socket.emit("error", new Error("IPC unavailable")));
      } else {
        setImmediate(() => socket.emit("connect"));
      }
      return socket as unknown as Socket;
    },
  } satisfies MpvBackendOptions);
  return { backend, child, requests, sockets, spawnArgs };
}

describe("MpvBackend", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends auth headers and playback commands, reports position, lists devices and closes mpv", async () => {
    const { backend, child, requests, spawnArgs } = makeBackend({ insecureTls: true });
    const position = vi.fn();
    const ended = vi.fn();
    backend.on("position", position);
    backend.on("ended", ended);
    backend.off("ended", ended);

    await backend.load({
      url: "https://server.test/audio",
      headers: { Authorization: "Bearer key" },
    });
    expect(await backend.listDevices()).toEqual([
      { id: "default", name: "Built-in output", description: "Built-in output" },
    ]);
    await backend.setOutputDevice("default");
    await backend.pause(true);
    await backend.seek(16);
    await backend.setVolume(50);

    expect(position).toHaveBeenCalledWith(12, 90);
    expect(ended).not.toHaveBeenCalled();
    expect(requests).toContainEqual({
      command: ["set_property", "http-header-fields", ["Authorization: Bearer key"]],
    });
    expect(requests).toContainEqual({
      command: ["loadfile", "https://server.test/audio", "replace"],
    });
    expect(child.kill).not.toHaveBeenCalled();
    expect(spawnArgs[0]).toContain("--tls-verify=no");
    expect(spawnArgs[0]).toEqual(
      expect.arrayContaining(["--vid=no", "--audio-display=no", "--force-window=no"]),
    );
    await backend.close();
    expect(child.exitCode).toBe(0);
  });

  it.each([
    [undefined, true],
    [false, true],
    [true, false],
  ])("artwork=%s hides the cover-art window: %s", async (artwork, hidden) => {
    const { backend, spawnArgs } = makeBackend({ artwork });
    await backend.load({ url: "https://server.test/audio", headers: {} });
    expect(spawnArgs[0]?.includes("--vid=no")).toBe(hidden);
    expect(spawnArgs[0]).not.toContain("--tls-verify=no");
    await backend.close();
  });

  it("wraps output selection errors as actionable device errors", async () => {
    const { backend } = makeBackend({ badDevice: "device" });
    await expect(backend.setOutputDevice("gone")).rejects.toMatchObject({
      code: "DEVICE_UNAVAILABLE",
    });
    await backend.close();
  });

  it("wraps non-device mpv command failures as IPC errors", async () => {
    const { backend } = makeBackend({ commandFailure: true });
    await backend.listDevices();
    await expect(backend.seek(10)).rejects.toMatchObject({ code: "MPV_IPC" });
    await backend.close();
  });

  it("reports stream failures from mpv's end-file event", async () => {
    const { backend } = makeBackend({ failStream: true });
    const error = vi.fn();
    backend.on("error", error);
    await backend.load({ url: "https://server.test/audio" });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: "STREAM_FAILED" }));
    await backend.close();
  });

  it("returns a typed error when mpv cannot be spawned", async () => {
    const { backend } = makeBackend({ spawnFailure: true });
    await expect(backend.load({ url: "https://server.test/audio" })).rejects.toMatchObject({
      code: "MPV_NOT_FOUND",
    });
  });

  it("handles child startup errors and early exits", async () => {
    const missing = makeBackend({ emitSpawnError: true });
    await expect(missing.backend.load({ url: "https://server.test/audio" })).rejects.toMatchObject({
      code: "MPV_NOT_FOUND",
    });
    const exited = makeBackend({ exitOnStart: true });
    await expect(exited.backend.load({ url: "https://server.test/audio" })).rejects.toMatchObject({
      code: "MPV_EXITED",
    });
  });

  it("handles end-of-track and malformed device-list entries", async () => {
    const { backend } = makeBackend({
      finishStream: true,
      noise: true,
      deviceData: [null, {}, { name: 2 }, { name: "only-id" }],
    });
    const ended = vi.fn();
    backend.on("ended", ended);
    await backend.load({ url: "https://server.test/audio" });
    expect(await backend.listDevices()).toEqual([{ id: "only-id", name: "only-id" }]);
    expect(ended).toHaveBeenCalledOnce();
    await backend.close();
    const emptyDevices = makeBackend({ deviceData: null });
    expect(await emptyDevices.backend.listDevices()).toEqual([]);
    await emptyDevices.backend.close();
  });

  it("reports unexpected process exits and clears pending IPC commands", async () => {
    const { backend, child } = makeBackend();
    const error = vi.fn();
    backend.on("error", error);
    await backend.listDevices();
    child.exitCode = 2;
    child.emit("exit", 2, null);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: "MPV_EXITED" }));
    await backend.close();
  });

  it("ignores nonnumeric observations and normal end-file reasons", async () => {
    const { backend, child, sockets } = makeBackend();
    const position = vi.fn();
    const error = vi.fn();
    backend.on("position", position);
    backend.on("error", error);
    await backend.listDevices();
    sockets[0]!.emit(
      "data",
      Buffer.from(
        [
          JSON.stringify({ event: "property-change", name: "duration", data: "unknown" }),
          JSON.stringify({ event: "property-change", name: "time-pos", data: "unknown" }),
          JSON.stringify({ event: "end-file", reason: "stop" }),
        ].join("\n") + "\n",
      ),
    );
    expect(position).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    child.signalCode = "SIGTERM";
    child.emit("exit", null, "SIGTERM");
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("SIGTERM") }),
    );
    await backend.close();
  });

  it("rejects commands after the IPC socket has closed", async () => {
    const { backend, sockets } = makeBackend();
    await backend.listDevices();
    sockets[0]!.destroy();
    await expect(backend.seek(1)).rejects.toMatchObject({
      code: "MPV_IPC",
      message: "mpv is not connected.",
    });
    await backend.close();
  });

  it("reports failed IPC writes and times out commands that receive no response", async () => {
    const writeFailure = makeBackend({ writeError: true, startupTimeoutMs: 50 });
    await expect(
      writeFailure.backend.load({ url: "https://server.test/audio" }),
    ).rejects.toMatchObject({ code: "MPV_IPC" });
    const timeout = makeBackend({ noResponse: true, startupTimeoutMs: 50, commandTimeoutMs: 10 });
    await expect(timeout.backend.load({ url: "https://server.test/audio" })).rejects.toMatchObject({
      code: "MPV_IPC",
    });
  });

  it("rejects pending commands when the IPC socket disconnects", async () => {
    const { backend } = makeBackend({ disconnectOnCommand: true, startupTimeoutMs: 60 });
    await expect(backend.load({ url: "https://server.test/audio" })).rejects.toMatchObject({
      code: "MPV_IPC",
    });
  });

  it("covers close when there is no process and escalates a stuck process", async () => {
    await new MpvBackend().close();
    const { backend, child, sockets } = makeBackend({ ignoreTerm: true, errorOnQuit: true });
    await backend.listDevices();
    sockets[0]!.destroy();
    await backend.close();
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  }, 4000);

  it("kills the owned process after an IPC startup failure", async () => {
    const { backend, child } = makeBackend({ unavailableSocket: true, startupTimeoutMs: 60 });
    await expect(backend.load({ url: "https://server.test/audio" })).rejects.toMatchObject({
      code: "MPV_IPC",
    });
    expect(child.kill).toHaveBeenCalled();
    await backend.close();
  });
});
