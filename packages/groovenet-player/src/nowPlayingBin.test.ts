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
  vi.doUnmock("./nowPlayingHelper.js");
  vi.resetModules();
});

function setup({
  fail = "",
  exit = 0 as number | null,
  signal = false,
  stored = undefined as string | undefined,
} = {}) {
  process.argv = ["node", "bin", "--remote", "lounge", "--helper", "/helper"];
  const config = {
    now_playing_target: stored,
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
  vi.doMock("@groovenet/client", async (importActual) => ({
    ...(await importActual<typeof import("@groovenet/client")>()),
    GroovenetClient: api,
    clientTransport: () => ({}),
    loadConfig: () => config,
  }));
  vi.doMock("./nowPlayingRemote.js", () => ({
    RemoteNowPlaying: controller,
    startRemoteSocket: socket,
  }));
  const resolveHelper = vi.fn().mockResolvedValue({ path: "/resolved/helper", source: "cache" });
  const installHelper = vi
    .fn()
    .mockResolvedValue({ path: "/installed/helper", source: "download" });
  vi.doMock("./nowPlayingHelper.js", () => ({
    defaultHelperContext: () => ({ ctx: true }),
    resolveHelper,
    installHelper,
  }));
  return {
    config,
    close,
    stop,
    start,
    fetch,
    api,
    controller,
    socket,
    child,
    spawn,
    error,
    off,
    resolveHelper,
    installHelper,
  };
}

it("uses existing config credentials and launches only the helper against the private proxy", async () => {
  const mock = setup({ signal: true });
  vi.stubEnv("PLAYER_API_KEY", "override");
  await import("./nowPlayingBin.js");
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
  await import("./nowPlayingBin.js");
  expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({ playerApiKey: "player" }));
  expect(process.exitCode).toBe(1);
});

it.each(["start", "socket", "spawn"])(
  "cleans up after %s errors without changing playback",
  async (fail) => {
    const mock = setup({ fail });
    await import("./nowPlayingBin.js");
    expect(process.exitCode).toBe(1);
    expect(mock.error).toHaveBeenCalledWith("Groovenet Now Playing:", expect.any(String));
    expect(mock.stop).toHaveBeenCalledOnce();
    if (fail === "spawn") expect(mock.close).toHaveBeenCalledOnce();
    else expect(mock.spawn).not.toHaveBeenCalled();
  },
);

it("reports invalid arguments without loading config or starting a helper", async () => {
  const mock = setup();
  process.argv = ["node", "bin", "--bogus"];
  await import("./nowPlayingBin.js");
  expect(mock.error).toHaveBeenCalledWith(
    "Groovenet Now Playing:",
    expect.stringContaining("Usage:"),
  );
  expect(mock.api).not.toHaveBeenCalled();
  expect(mock.resolveHelper).not.toHaveBeenCalled();
});

it("rejects --helper without a path", async () => {
  const mock = setup();
  process.argv = ["node", "bin", "--helper"];
  await import("./nowPlayingBin.js");
  expect(process.exitCode).toBe(1);
  expect(mock.spawn).not.toHaveBeenCalled();
});

it("resolves the helper in Node when --helper is not given", async () => {
  const mock = setup();
  process.argv = ["node", "bin", "--remote", "lounge"];
  await import("./nowPlayingBin.js");
  expect(mock.resolveHelper).toHaveBeenCalledWith({ ctx: true });
  expect(mock.spawn).toHaveBeenCalledWith(
    "/resolved/helper",
    ["--socket", "/private/temporary.sock"],
    { stdio: "inherit" },
  );
});

it("does not resolve or download a helper when the stored target is invalid", async () => {
  const mock = setup({ stored: "../bad" });
  process.argv = ["node", "bin"];
  await import("./nowPlayingBin.js");
  expect(process.exitCode).toBe(1);
  expect(mock.resolveHelper).not.toHaveBeenCalled();
});

it("reports a failed helper download without starting anything", async () => {
  const mock = setup();
  mock.resolveHelper.mockRejectedValueOnce(new Error("No prebuilt helper exists"));
  process.argv = ["node", "bin", "--remote", "lounge"];
  await import("./nowPlayingBin.js");
  expect(process.exitCode).toBe(1);
  expect(mock.error).toHaveBeenCalledWith("Groovenet Now Playing:", "No prebuilt helper exists");
  expect(mock.start).not.toHaveBeenCalled();
  expect(mock.spawn).not.toHaveBeenCalled();
});

it("--install downloads the helper, prints its path and starts nothing", async () => {
  const mock = setup();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  process.argv = ["node", "bin", "--install"];
  await import("./nowPlayingBin.js");
  expect(mock.installHelper).toHaveBeenCalledWith({ ctx: true });
  expect(log).toHaveBeenCalledWith("/installed/helper");
  expect(mock.spawn).not.toHaveBeenCalled();
  expect(mock.resolveHelper).not.toHaveBeenCalled();
});

it("--install rejects other arguments", async () => {
  const mock = setup();
  process.argv = ["node", "bin", "--install", "--remote", "lounge"];
  await import("./nowPlayingBin.js");
  expect(process.exitCode).toBe(1);
  expect(mock.installHelper).not.toHaveBeenCalled();
});

it("reports non-Error startup failures without leaking configuration", async () => {
  const mock = setup();
  mock.start.mockRejectedValueOnce("unknown");
  await import("./nowPlayingBin.js");
  expect(mock.error).toHaveBeenCalledWith("Groovenet Now Playing:", "Now Playing failed.");
});

it("starts the local helper with no arguments when nothing is configured", async () => {
  const mock = setup();
  process.argv = ["node", "bin", "--helper", "/helper"];
  await import("./nowPlayingBin.js");
  expect(mock.spawn).toHaveBeenCalledWith("/helper", [], { stdio: "inherit" });
  expect(mock.api).not.toHaveBeenCalled();
  expect(mock.socket).not.toHaveBeenCalled();
});

it("passes --socket through to the helper", async () => {
  const mock = setup({ stored: "lounge" });
  process.argv = ["node", "bin", "--socket", "/tmp/p.sock", "--helper", "/helper"];
  await import("./nowPlayingBin.js");
  expect(mock.spawn).toHaveBeenCalledWith("/helper", ["--socket", "/tmp/p.sock"], {
    stdio: "inherit",
  });
  expect(mock.api).not.toHaveBeenCalled();
});

it("follows a remote player stored in config", async () => {
  const mock = setup({ stored: "kitchen" });
  process.argv = ["node", "bin", "--helper", "/helper"];
  await import("./nowPlayingBin.js");
  expect(mock.controller).toHaveBeenCalledWith("kitchen", expect.anything(), expect.anything());
  expect(mock.spawn).toHaveBeenCalledWith("/helper", ["--socket", "/private/temporary.sock"], {
    stdio: "inherit",
  });
});

it("lets --remote override a stored target", async () => {
  const mock = setup({ stored: "kitchen" });
  await import("./nowPlayingBin.js");
  expect(mock.controller).toHaveBeenCalledWith("lounge", expect.anything(), expect.anything());
});

it("fails on an invalid stored target instead of falling back to local", async () => {
  const mock = setup({ stored: "../bad" });
  process.argv = ["node", "bin", "--helper", "/helper"];
  await import("./nowPlayingBin.js");
  expect(process.exitCode).toBe(1);
  expect(mock.error).toHaveBeenCalledWith(
    "Groovenet Now Playing:",
    expect.stringContaining("Invalid now_playing_target"),
  );
  expect(mock.spawn).not.toHaveBeenCalled();
});

it("rejects --remote together with --socket", async () => {
  const mock = setup();
  process.argv = ["node", "bin", "--remote", "a", "--socket", "/s", "--helper", "/helper"];
  await import("./nowPlayingBin.js");
  expect(process.exitCode).toBe(1);
  expect(mock.spawn).not.toHaveBeenCalled();
});
