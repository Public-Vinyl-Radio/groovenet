import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";

const originalArgv = process.argv;
const originalExit = process.exitCode;
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExit;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.doUnmock("node:child_process");
  vi.doUnmock("@groovenet/client");
  vi.doUnmock("./nowPlayingRemote.js");
  vi.resetModules();
});

function setup({ fail = "", exit = 0 as number | null, signal = false } = {}) {
  process.argv = ["node", "bin", "--remote", "lounge", "--helper", "/helper"];
  const config = {
    api_base: "https://example/api",
    api_key: "collection",
    player_api_key: "player",
    insecure_tls: true,
  };
  const close = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn();
  const start = vi.fn().mockImplementation(async () => {
    if (fail === "start") throw new Error("authentication failed");
  });
  const fetch = vi.fn().mockResolvedValue([]);
  const api = vi.fn(function () {
    return { batchGetTracks: fetch };
  });
  const controller = vi.fn(function (_id, _transport, metadata) {
    void metadata([]);
    return { start, close: stop };
  });
  const socket = vi.fn().mockImplementation(async () => {
    if (fail === "socket") throw new Error("socket failed");
    return { socketPath: "/private/temporary.sock", close };
  });
  const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
  const on = vi.spyOn(process, "on").mockReturnValue(process);
  const off = vi.spyOn(process, "off").mockReturnValue(process);
  const spawn = vi.fn(() => {
    queueMicrotask(() => {
      if (signal) on.mock.calls.find(([event]) => event === "SIGINT")![1]();
      if (fail === "spawn") child.emit("error", new Error("helper missing"));
      else child.emit("exit", exit);
    });
    return child;
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.doMock("node:child_process", () => ({ spawn }));
  vi.doMock("@groovenet/client", () => ({
    GroovenetClient: api,
    clientTransport: () => ({}),
    loadConfig: () => config,
  }));
  vi.doMock("./nowPlayingRemote.js", () => ({
    RemoteNowPlaying: controller,
    startRemoteSocket: socket,
  }));
  return { config, close, stop, start, fetch, api, controller, socket, child, spawn, error, off };
}

it("uses existing config credentials and launches only the helper against the private proxy", async () => {
  const mock = setup({ signal: true });
  vi.stubEnv("PLAYER_API_KEY", "override");
  await import("./nowPlayingRemoteBin.js");
  expect(mock.api).toHaveBeenCalledWith({
    baseUrl: "https://example/api",
    apiKey: "collection",
    playerApiKey: "override",
    insecureTls: true,
    clientName: "cli",
  });
  expect(mock.spawn).toHaveBeenCalledWith("/helper", ["--socket", "/private/temporary.sock"], {
    stdio: "inherit",
  });
  expect(mock.child.kill).toHaveBeenCalledWith("SIGTERM");
  expect(mock.close).toHaveBeenCalledOnce();
  expect(mock.stop).toHaveBeenCalledOnce();
  expect(mock.off).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
});

it("uses configured player key and propagates a native signal exit", async () => {
  const mock = setup({ exit: null });
  vi.stubEnv("PLAYER_API_KEY", "");
  await import("./nowPlayingRemoteBin.js");
  expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({ playerApiKey: "player" }));
  expect(process.exitCode).toBe(1);
});

it.each(["start", "socket", "spawn"])(
  "cleans up after %s errors without changing playback",
  async (fail) => {
    const mock = setup({ fail });
    await import("./nowPlayingRemoteBin.js");
    expect(process.exitCode).toBe(1);
    expect(mock.error).toHaveBeenCalledWith("Groovenet Now Playing:", expect.any(String));
    expect(mock.stop).toHaveBeenCalledOnce();
    if (fail === "spawn") expect(mock.close).toHaveBeenCalledOnce();
    else expect(mock.spawn).not.toHaveBeenCalled();
  },
);

it("reports invalid arguments without loading config or starting a helper", async () => {
  const mock = setup();
  process.argv = ["node", "bin"];
  await import("./nowPlayingRemoteBin.js");
  expect(mock.error).toHaveBeenCalledWith(
    "Groovenet Now Playing:",
    expect.stringContaining("Usage:"),
  );
  expect(mock.api).not.toHaveBeenCalled();
});

it("reports non-Error startup failures without leaking configuration", async () => {
  const mock = setup();
  mock.start.mockRejectedValueOnce("unknown");
  await import("./nowPlayingRemoteBin.js");
  expect(mock.error).toHaveBeenCalledWith("Groovenet Now Playing:", "Remote integration failed.");
});
