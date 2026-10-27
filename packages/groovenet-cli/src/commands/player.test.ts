import { Command } from "commander";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import { OwnToneBackend, MpvBackend, PlayLogger, PlayerControlClient } from "@groovenet/player";
import { PlayerDaemon } from "@groovenet/player";
import { runPlayerTui } from "./playerTui.js";
import { addPlayerCommands, createPlayerDaemon } from "./player.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ unref: vi.fn(), once: vi.fn() })) }));
vi.mock("@groovenet/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@groovenet/client")>()),
  loadConfig: vi.fn(() => ({ api_base: "http://localhost:3000/api", default_friend_id: 1 })),
}));
vi.mock("@groovenet/player", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@groovenet/player")>();
  return {
    ...actual,
    OwnToneBackend: vi.fn(function (options: ConstructorParameters<typeof actual.OwnToneBackend>[0]) { return new actual.OwnToneBackend(options); }),
    MpvBackend: vi.fn(function (options: ConstructorParameters<typeof actual.MpvBackend>[0]) { return new actual.MpvBackend(options); }),
    PlayLogger: vi.fn(function (options: ConstructorParameters<typeof actual.PlayLogger>[0]) { return new actual.PlayLogger(options); }),
  };
});
vi.mock("./playerTui.js", () => ({ runPlayerTui: vi.fn() }));

function makeProgram() {
  const program = new Command();
  program.exitOverride();
  addPlayerCommands(program);
  return program;
}

describe("player keys", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.mocked(loadConfig).mockReturnValue({ api_base: "http://localhost:3000/api", default_friend_id: 1 }); });

  it("prints the keymap table from config alone, with overrides marked and problems listed", async () => {
    vi.mocked(loadConfig).mockReturnValue({ api_base: "x", default_friend_id: 1, player_keymap: { "transport.next": ["ctrl+n"], "nope.nope": ["x"] } });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = vi.spyOn(PlayerControlClient.prototype, "request");
    await makeProgram().parseAsync(["node", "test", "player", "keys"]);
    const output = log.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("*transport.next");
    expect(output).toContain('Unknown action "nope.nope"');
    expect(request).not.toHaveBeenCalled();
    expect(runPlayerTui).not.toHaveBeenCalled();
  });

  it("prints JSON", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "keys", "--json"]);
    const json = JSON.parse(String(write.mock.calls[0]![0]));
    expect(json.problems).toEqual([]);
    expect(json.actions.find((action: { id: string }) => action.id === "transport.toggle").keys).toEqual(["space"]);
  });
});

describe("player CLI commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it("prints status as JSON and closes the control connection", async () => {
    const close = vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
    const request = vi.spyOn(PlayerControlClient.prototype, "request").mockResolvedValue({ status: "playing" });
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "status", "--json"]);
    expect(request).toHaveBeenCalledWith("status");
    expect(write).toHaveBeenCalledWith('{\n  "status": "playing"\n}\n');
    expect(close).toHaveBeenCalledOnce();
  });

  it("renders sparse queue, device, and status results with safe defaults", async () => {
    const request = vi.spyOn(PlayerControlClient.prototype, "request")
      .mockResolvedValueOnce([
        { id: "entry-1", track: { title: "Unknown artist" } },
        { track: {} },
        { id: "device-1", name: "Built in" },
        {},
      ])
      .mockResolvedValueOnce({ status: "stopped", position: 4, duration: null })
      .mockResolvedValueOnce({ result: "ignored" });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await makeProgram().parseAsync(["node", "test", "player", "queue", "list"]);
    await makeProgram().parseAsync(["node", "test", "player", "status"]);
    await makeProgram().parseAsync(["node", "test", "player", "status", "--json"]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith("1. Unknown artist — Unknown artist [entry-1]");
    expect(log).toHaveBeenCalledWith("2. Unknown track — Unknown artist []");
    expect(log).toHaveBeenCalledWith("3. Built in [device-1]");
    expect(log).toHaveBeenCalledWith("4. Unknown device []");
    expect(log).toHaveBeenCalledWith("Status: stopped");
    expect(log).toHaveBeenCalledWith("Position: 4s");
  });

  it("uses playlist queue options and renders queue entries", async () => {
    const request = vi.spyOn(PlayerControlClient.prototype, "request").mockResolvedValue([
      { id: "entry-1", track: { title: "Blue Train", artist: "John Coltrane" } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await makeProgram().parseAsync(["node", "test", "player", "queue", "add", "--playlist-id", "18"]);
    expect(request).toHaveBeenCalledWith("queue.add", { playlistId: "18" });
    expect(log).toHaveBeenCalledWith("1. Blue Train — John Coltrane [entry-1]");
  });

  it("toggles pause to resume when playback is already paused", async () => {
    const request = vi.spyOn(PlayerControlClient.prototype, "request")
      .mockResolvedValueOnce({ status: "paused" })
      .mockResolvedValueOnce({ status: "playing" });
    await makeProgram().parseAsync(["node", "test", "player", "pause", "--json"]);
    expect(request.mock.calls).toEqual([["status"], ["resume"]]);
  });

  it("returns a non-zero exit code when the daemon is unavailable", async () => {
    const request = vi.spyOn(PlayerControlClient.prototype, "request").mockRejectedValue(new Error("daemon down"));
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "next"]);
    expect(request).toHaveBeenCalledWith("next");
    expect(error).toHaveBeenCalledWith(expect.stringContaining("daemon down"));
    expect(process.exitCode).toBe(1);
  });

  it("routes the remaining control commands and renders human output", async () => {
    const request = vi.spyOn(PlayerControlClient.prototype, "request")
      .mockResolvedValue({ status: "playing", current: { track: { title: "Blue Train", artist: "John Coltrane" } }, position: 12.4, duration: 180, volume: 70 })
      .mockResolvedValueOnce({ status: "playing", current: { track: { title: "Blue Train", artist: "John Coltrane" } }, position: 12.4, duration: 180, volume: 70 })
      .mockResolvedValueOnce({ status: "playing" })
      .mockResolvedValueOnce({ status: "playing" })
      .mockResolvedValueOnce({ status: "playing" })
      .mockResolvedValueOnce({ status: "playing" })
      .mockResolvedValueOnce({ status: "playing" })
      .mockResolvedValueOnce({ status: "playing" })
      .mockResolvedValueOnce([{ id: "entry-1", track: { title: "Blue Train", artist: "John Coltrane" } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "airplay", name: "Living room", description: "AirPlay" }])
      .mockResolvedValueOnce([{ id: "airplay", name: "Living room", description: "AirPlay" }])
      .mockResolvedValueOnce({ stopping: true })
      .mockResolvedValueOnce({ stopping: true });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const success = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    for (const args of [
      ["play"], ["play", "2"], ["seek", "12.5"], ["volume", "72"], ["prev"],
      ["queue", "remove", "entry-1"], ["queue", "remove", "12"], ["queue", "list"], ["queue", "list"], ["devices"], ["devices", "list"], ["devices", "select", "airplay", "--json"], ["stop"], ["stop", "--json"],
    ]) await makeProgram().parseAsync(["node", "test", "player", ...args]);

    expect(request.mock.calls.map(([method, params]) => [method, params])).toEqual([
      ["play", undefined], ["play", { index: 2 }], ["seek", { seconds: 12.5 }], ["volume", { volume: 72 }], ["prev", undefined],
      ["queue.remove", { id: "entry-1" }], ["queue.remove", { index: 12 }], ["queue.list", undefined], ["queue.list", undefined], ["devices", undefined], ["devices", undefined], ["devices.select", { id: "airplay" }], ["shutdown", undefined], ["shutdown", undefined],
    ]);
    expect(log).toHaveBeenCalledWith("Status: playing — Blue Train / John Coltrane");
    expect(log).toHaveBeenCalledWith("Position: 12s / 180s");
    expect(log).toHaveBeenCalledWith("Volume: 70%");
    expect(log).toHaveBeenCalledWith("No entries.");
    expect(log).toHaveBeenCalledWith("1. Living room — AirPlay [airplay]");
    expect(success).toHaveBeenCalledWith(expect.stringContaining("Player daemon stopped."));
  });

  it("pauses when the current status is not paused and reports non-Error failures", async () => {
    vi.spyOn(PlayerControlClient.prototype, "request")
      .mockResolvedValueOnce({ status: "playing" })
      .mockRejectedValueOnce("wire failure");
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "pause"]);
    await makeProgram().parseAsync(["node", "test", "player", "next"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("wire failure"));
    expect(process.exitCode).toBe(1);
  });

  it("starts a detached daemon and prints the JSON result", async () => {
    const request = vi.spyOn(PlayerControlClient.prototype, "request").mockResolvedValue({ status: "stopped" });
    vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "start", "--detach", "--json"]);
    expect(request).toHaveBeenCalledWith("status");
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"started": true'));
  });

  it("retries briefly when the detached daemon has not opened its socket yet", async () => {
    vi.spyOn(PlayerControlClient.prototype, "request")
      .mockRejectedValueOnce(new Error("starting"))
      .mockResolvedValue({ status: "stopped" });
    vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
    const success = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "start", "--detach"]);
    expect(success).toHaveBeenCalledWith(expect.stringContaining("Player daemon started."));
  });

  it("fails quickly when spawning the detached daemon fails", async () => {
    const child = { unref: vi.fn(), once: (_event: string, listener: (error: Error) => void) => { listener(new Error("spawn failed")); return child; } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValueOnce(child);
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "start", "--detach"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Could not start the player daemon: spawn failed"));
  });

  it("fails when a detached daemon never becomes available", async () => {
    vi.spyOn(PlayerControlClient.prototype, "request").mockRejectedValue(new Error("not ready"));
    vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValueOnce(6000);
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "start", "--detach"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Player daemon did not start: undefined"));
  });

  it("reports daemon startup failures from foreground and internal starts", async () => {
    const start = vi.spyOn(PlayerDaemon.prototype, "start").mockRejectedValue(new Error("already running"));
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "start"]);
    expect(start).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("already running"));
    process.exitCode = 0;
    await makeProgram().parseAsync(["node", "test", "player", "_daemon"]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("stops a foreground daemon when it receives SIGINT", async () => {
    const start = vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    const stop = vi.spyOn(PlayerDaemon.prototype, "stop").mockResolvedValue();
    const success = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    setImmediate(() => process.emit("SIGINT"));
    await makeProgram().parseAsync(["node", "test", "player", "start"]);
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledWith(expect.stringContaining("Player daemon running."));
  });

  it("keeps the internal daemon alive until a termination signal", async () => {
    const start = vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    const stop = vi.spyOn(PlayerDaemon.prototype, "stop").mockResolvedValue();
    await makeProgram().parseAsync(["node", "test", "player", "_daemon"]);
    expect(start).toHaveBeenCalledOnce();
    process.emit("SIGTERM");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("reports foreground shutdown failures and sets a non-zero exit code", async () => {
    vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    const stop = vi.spyOn(PlayerDaemon.prototype, "stop").mockRejectedValue(new Error("foreground close failed"));
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setImmediate(() => process.emit("SIGINT"));
    await makeProgram().parseAsync(["node", "test", "player", "start"]);
    expect(stop).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("foreground close failed"));
    expect(process.exitCode).toBe(1);
  });

  it("formats non-Error foreground shutdown failures", async () => {
    vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    vi.spyOn(PlayerDaemon.prototype, "stop").mockRejectedValue("foreground close failed");
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    setImmediate(() => process.emit("SIGTERM"));
    await makeProgram().parseAsync(["node", "test", "player", "start"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("foreground close failed"));
    expect(process.exitCode).toBe(1);
  });

  it("reports detached shutdown failures that are not Error objects", async () => {
    vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    const stop = vi.spyOn(PlayerDaemon.prototype, "stop").mockRejectedValue("detached close failed");
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "_daemon"]);
    process.emit("SIGTERM");
    await new Promise((resolve) => setImmediate(resolve));
    expect(stop).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("detached close failed"));
    expect(process.exitCode).toBe(1);
  });

  it("formats Error objects from detached shutdown failures", async () => {
    vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    vi.spyOn(PlayerDaemon.prototype, "stop").mockRejectedValue(new Error("detached close failed"));
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "_daemon"]);
    process.emit("SIGTERM");
    await new Promise((resolve) => setImmediate(resolve));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("detached close failed"));
    expect(process.exitCode).toBe(1);
  });

  it("explains that the interactive player requires a TTY", async () => {
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await makeProgram().parseAsync(["node", "test", "player", "--search", "jazz"]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("interactive player requires a TTY"));
      expect(process.exitCode).toBe(1);
    } finally {
      if (stdinDescriptor) Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
      else Reflect.deleteProperty(process.stdin, "isTTY");
      if (stdoutDescriptor) Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }
  });

  it("starts the interactive TUI in a TTY and reports startup failures", async () => {
    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const runTui = vi.mocked(runPlayerTui);
    try {
      runTui.mockResolvedValueOnce();
      await makeProgram().parseAsync(["node", "test", "player", "--search", "jazz"]);
      expect(runTui).toHaveBeenCalledWith({ search: "jazz" });

      runTui.mockRejectedValueOnce("terminal failed");
      await makeProgram().parseAsync(["node", "test", "player", "--playlist", "18"]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("terminal failed"));
      expect(process.exitCode).toBe(1);
    } finally {
      runTui.mockReset();
      if (stdinDescriptor) Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
      else Reflect.deleteProperty(process.stdin, "isTTY");
      if (stdoutDescriptor) Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
      else Reflect.deleteProperty(process.stdout, "isTTY");
    }
  });

  describe("play logging", () => {
    const configWith = (player_log_plays?: boolean) =>
      vi.mocked(loadConfig).mockReturnValue({ api_base: "http://localhost:3000/api", default_friend_id: 7, player_log_plays });
    const track = { track_id: "t1", friend_id: 7, release_id: "r1" };

    async function logPlay(): Promise<(play: { track: typeof track; startedAt: Date; listened: number }) => Promise<void>> {
      return vi.mocked(PlayLogger).mock.lastCall![0].logPlay as never;
    }

    it("stays off unless the config or the argument enables it", () => {
      vi.mocked(PlayLogger).mockClear();
      configWith();
      createPlayerDaemon();
      configWith(false);
      createPlayerDaemon();
      configWith(true);
      createPlayerDaemon({ logPlays: false });
      expect(PlayLogger).not.toHaveBeenCalled();
      createPlayerDaemon();
      expect(PlayLogger).toHaveBeenCalledOnce();
      configWith(false);
      createPlayerDaemon({ logPlays: true });
      expect(PlayLogger).toHaveBeenCalledTimes(2);
    });

    it("posts a digital spin for the played track", async () => {
      configWith(true);
      const createSpin = vi.spyOn(GroovenetClient.prototype, "createSpin").mockResolvedValue({} as never);
      createPlayerDaemon();
      await (await logPlay())({ track, startedAt: new Date("2026-10-23T12:00:00Z"), listened: 100 });
      expect(createSpin).toHaveBeenCalledWith({
        friend_id: 7,
        release_id: "r1",
        medium: "digital",
        played_at: "2026-10-23T12:00:00.000Z",
        context_type: "player",
        track_refs: [{ track_id: "t1", friend_id: 7 }],
      });
    });

    it("treats an already logged play as done and surfaces other errors", async () => {
      configWith(true);
      const createSpin = vi.spyOn(GroovenetClient.prototype, "createSpin");
      createPlayerDaemon();
      const log = await logPlay();
      const play = { track, startedAt: new Date(), listened: 100 };
      createSpin.mockRejectedValueOnce(new Error("API Error: Digital play already logged"));
      await expect(log(play)).resolves.toBeUndefined();
      createSpin.mockRejectedValueOnce(new Error("API Error: boom"));
      await expect(log(play)).rejects.toThrow("boom");
      createSpin.mockRejectedValueOnce("not an error");
      await expect(log(play)).rejects.toBe("not an error");
    });

    it("applies --log-plays to the foreground daemon, the detached daemon and the interactive player", async () => {
      configWith(false);
      vi.mocked(PlayLogger).mockClear();
      vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
      vi.spyOn(PlayerDaemon.prototype, "stop").mockResolvedValue();
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      setImmediate(() => process.emit("SIGINT"));
      await makeProgram().parseAsync(["node", "test", "player", "start", "--log-plays"]);
      expect(PlayLogger).toHaveBeenCalledOnce();

      await makeProgram().parseAsync(["node", "test", "player", "_daemon", "--log-plays"]);
      expect(PlayLogger).toHaveBeenCalledTimes(2);
      process.emit("SIGTERM");

      vi.spyOn(PlayerControlClient.prototype, "request").mockResolvedValue({ status: "stopped" });
      vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
      await makeProgram().parseAsync(["node", "test", "player", "start", "--detach", "--log-plays"]);
      expect(vi.mocked(spawn).mock.lastCall?.[1]).toEqual([process.argv[1], "player", "_daemon", "--log-plays"]);
      await makeProgram().parseAsync(["node", "test", "player", "start", "--detach", "--artwork", "--log-plays"]);
      expect(vi.mocked(spawn).mock.lastCall?.[1]).toEqual([process.argv[1], "player", "_daemon", "--artwork", "--log-plays"]);

      const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
      const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
      try {
        vi.mocked(runPlayerTui).mockResolvedValueOnce();
        await makeProgram().parseAsync(["node", "test", "player", "--log-plays"]);
        expect(runPlayerTui).toHaveBeenLastCalledWith({ logPlays: true });
      } finally {
        vi.mocked(runPlayerTui).mockReset();
        if (stdinDescriptor) Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
        else Reflect.deleteProperty(process.stdin, "isTTY");
        if (stdoutDescriptor) Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
        else Reflect.deleteProperty(process.stdout, "isTTY");
      }
    });
  });

  describe("cover-art window", () => {
    const configWith = (player_artwork?: boolean) =>
      vi.mocked(loadConfig).mockReturnValue({ api_base: "http://localhost:3000/api", default_friend_id: 1, insecure_tls: true, player_artwork });

    it("keeps artwork off unless the config enables it", () => {
      configWith();
      createPlayerDaemon();
      expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: true, artwork: undefined });
      configWith(true);
      createPlayerDaemon();
      expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: true, artwork: true });
    });

    it("lets the artwork argument override the config", () => {
      configWith(false);
      createPlayerDaemon({ artwork: true });
      expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: true, artwork: true });
      configWith(true);
      createPlayerDaemon({ artwork: false });
      expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: true, artwork: false });
    });

    it("applies --artwork to the foreground daemon, the TUI and the detached daemon", async () => {
      configWith(false);
      vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
      vi.spyOn(PlayerDaemon.prototype, "stop").mockResolvedValue();
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      setImmediate(() => process.emit("SIGINT"));
      await makeProgram().parseAsync(["node", "test", "player", "start", "--artwork"]);
      expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: true, artwork: true });

      await makeProgram().parseAsync(["node", "test", "player", "_daemon", "--artwork"]);
      expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: true, artwork: true });
      process.emit("SIGTERM");

      vi.spyOn(PlayerControlClient.prototype, "request").mockResolvedValue({ status: "stopped" });
      vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
      await makeProgram().parseAsync(["node", "test", "player", "start", "--detach", "--artwork"]);
      expect(vi.mocked(spawn).mock.lastCall?.[1]).toEqual([process.argv[1], "player", "_daemon", "--artwork"]);
      await makeProgram().parseAsync(["node", "test", "player", "start", "--detach"]);
      expect(vi.mocked(spawn).mock.lastCall?.[1]).toEqual([process.argv[1], "player", "_daemon"]);
    });

    it("passes --artwork to the interactive player", async () => {
      const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
      const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
      Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
      try {
        vi.mocked(runPlayerTui).mockResolvedValueOnce();
        await makeProgram().parseAsync(["node", "test", "player", "--artwork"]);
        expect(runPlayerTui).toHaveBeenLastCalledWith({ artwork: true });
      } finally {
        vi.mocked(runPlayerTui).mockReset();
        if (stdinDescriptor) Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
        else Reflect.deleteProperty(process.stdin, "isTTY");
        if (stdoutDescriptor) Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
        else Reflect.deleteProperty(process.stdout, "isTTY");
      }
    });
  });
});


describe("OwnTone daemon selection", () => {
  afterEach(() => vi.restoreAllMocks());
  const config = { api_base: "http://app/api", default_friend_id: 1, player_backend: "owntone" as const, owntone_url: "http://engine/api", owntone_library: "/media", owntone_output: "lounge", owntone_password: "private" };
  it("selects OwnTone explicitly through config, and allows an mpv override", () => {
    vi.mocked(loadConfig).mockReturnValue(config);
    createPlayerDaemon();
    expect(OwnToneBackend).toHaveBeenLastCalledWith({ apiUrl: "http://engine/api", outputId: "lounge", password: "private" });
    createPlayerDaemon({ backend: "mpv" });
    expect(MpvBackend).toHaveBeenLastCalledWith({ insecureTls: undefined, artwork: undefined });
  });
  it("rejects invalid engines and missing delivery config", () => {
    vi.mocked(loadConfig).mockReturnValue({ api_base: "http://app/api", default_friend_id: 1 });
    expect(() => createPlayerDaemon({ backend: "vlc" })).toThrow(/must be mpv or owntone/);
    expect(() => createPlayerDaemon({ backend: "owntone" })).toThrow(/requires owntone_url and owntone_library/);
  });
  it("propagates --backend into detached and internal daemons", async () => {
    vi.mocked(loadConfig).mockReturnValue(config);
    vi.spyOn(PlayerControlClient.prototype, "request").mockResolvedValue({ status: "stopped" });
    vi.spyOn(PlayerControlClient.prototype, "close").mockResolvedValue();
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await makeProgram().parseAsync(["node", "test", "player", "start", "--detach", "--backend", "owntone"]);
    expect(vi.mocked(spawn).mock.lastCall?.[1]).toEqual([process.argv[1], "player", "_daemon", "--backend", "owntone"]);
    vi.spyOn(PlayerDaemon.prototype, "start").mockResolvedValue();
    vi.spyOn(PlayerDaemon.prototype, "stop").mockResolvedValue();
    await makeProgram().parseAsync(["node", "test", "player", "_daemon", "--backend", "owntone"]);
    expect(OwnToneBackend).toHaveBeenCalled();
    process.emit("SIGTERM");
  });
});
