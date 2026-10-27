import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerPlayer } from "@groovenet/contracts";
import type { PlaybackSnapshot } from "@groovenet/player";
import { encodeRpcResponse } from "@groovenet/player/protocol";

const getServerPlayer = vi.hoisted(() => vi.fn());
vi.mock("./remotePlayer.js", () => ({ makeRemoteApi: () => ({ getServerPlayer }) }));
vi.mock("./player.js", () => ({ PLAYER_DAEMON_PATHS: { socketPath: "/nonexistent/groovenet-status-test/player.sock" } }));

import {
  addStatusCommand, cleanText, defaultStatusSources, escapeTmux, fitPair, fromLocalSnapshot, fromServerPlayer,
  progressBar, readLocalSnapshot, readNowPlaying, renderSegment, runStatus, truncate,
  type NowPlaying, type StatusSources,
} from "./status.js";

const ENTRY = "11111111-1111-4111-8111-111111111111";

function np(overrides: Partial<NowPlaying> = {}): NowPlaying {
  return { state: "playing", title: "Money Trees", artist: "Kendrick Lamar", position: 44, duration: 386, target: "LOUNGE", ...overrides };
}

function local(overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
  return {
    status: "playing", position: 44, duration: 386, volume: 80, error: null, queue: [],
    current: { id: "a", track: { track_id: "t1", friend_id: 1, title: "Money Trees", artist: "Kendrick Lamar" } as PlaybackSnapshot["queue"][number]["track"] },
    ...overrides,
  };
}

function server(overrides: Partial<ServerPlayer["state"]> = {}): ServerPlayer {
  return {
    id: "lounge", name: "Lounge", engine_id: "owntone", availability_policy: "ask", revision: 3, assigned_output: null,
    state: {
      queue: [{ id: ENTRY, track_id: "t1", friend_id: 1, title: "Money Trees", artist: "Kendrick Lamar" }],
      current_entry_id: ENTRY, status: "playing", position: 44, duration: 386, volume: 50,
      desired_output: null, checkpoint: false, error: null, ...overrides,
    },
  };
}

function sources(overrides: Partial<StatusSources> = {}): StatusSources {
  return { local: vi.fn(async () => local()), remote: vi.fn(async () => server()), ...overrides };
}

describe("progressBar", () => {
  it("fills by fraction of the duration", () => {
    expect(progressBar(44, 386, 6)).toBe("━─────");
    expect(progressBar(193, 386, 6)).toBe("━━━───");
    expect(progressBar(386, 386, 4)).toBe("━━━━");
  });
  it("clamps out-of-range positions and handles unknown durations", () => {
    expect(progressBar(999, 100, 3)).toBe("━━━");
    expect(progressBar(-5, 100, 3)).toBe("───");
    expect(progressBar(10, null, 3)).toBe("───");
    expect(progressBar(10, 0, 3)).toBe("───");
    expect(progressBar(Number.NaN, 100, 3)).toBe("───");
    expect(progressBar(10, 100, 0)).toBe("");
    expect(progressBar(10, 100, -2)).toBe("");
  });
});

describe("text helpers", () => {
  it("cleans control characters and whitespace", () => {
    expect(cleanText(" a\n\tb\u0007  c ")).toBe("a b c");
    expect(cleanText(null)).toBe("");
  });
  it("truncates with an ellipsis", () => {
    expect(truncate("Money Trees", 20)).toBe("Money Trees");
    expect(truncate("Money Trees", 6)).toBe("Money…");
    expect(truncate("Money", 0)).toBe("");
  });
  it("shrinks the longer of title and artist first", () => {
    expect(fitPair(10, 4, 10)).toEqual([6, 4]);
    expect(fitPair(4, 10, 10)).toEqual([4, 6]);
    expect(fitPair(10, 10, 10)).toEqual([5, 5]);
    expect(fitPair(3, 3, -5)).toEqual([0, 0]);
  });
  it("escapes # for tmux", () => {
    expect(escapeTmux("#1 #[fg=red]")).toBe("##1 ##[fg=red]");
  });
});

describe("now playing", () => {
  it("reads the local snapshot", () => {
    expect(fromLocalSnapshot(local())).toEqual(np({ target: "LOCAL" }));
  });
  it("falls back to the track's duration and placeholder names", () => {
    const snapshot = local({ duration: null, current: { id: "a", track: { track_id: "t", friend_id: 1, title: "", artist: "", duration_seconds: 200 } as never } });
    expect(fromLocalSnapshot(snapshot)).toMatchObject({ title: "Unknown track", artist: "Unknown artist", duration: 200 });
  });
  it("is idle when nothing is current or playback stopped", () => {
    expect(fromLocalSnapshot(local({ current: null }))).toBeNull();
    expect(fromLocalSnapshot(local({ status: "stopped" }))).toBeNull();
    expect(fromLocalSnapshot(local({ status: "ended" }))).toBeNull();
    expect(fromLocalSnapshot(local({ position: Number.NaN }))).toMatchObject({ position: 0 });
  });
  it("reads a server player", () => {
    expect(fromServerPlayer(server())).toEqual(np());
    expect(fromServerPlayer(server({ status: "paused" }))).toMatchObject({ state: "paused" });
    expect(fromServerPlayer(server({ current_entry_id: null }))).toBeNull();
    expect(fromServerPlayer(server({ status: "stopped" }))).toBeNull();
  });
});

describe("renderSegment", () => {
  it("renders the default segment", () => {
    expect(renderSegment(np())).toBe("▶ Money Trees · Kendrick Lamar ━───── 0:44 · LOUNGE");
  });
  it("uses a template, bar width and state icons", () => {
    expect(renderSegment(np({ state: "paused" }), { format: "{icon} {position}/{duration} {bar} {nope}", barWidth: 2 })).toBe("‖ 0:44/6:26 ── {nope}");
    expect(renderSegment(np({ state: "loading", duration: null }), { format: "{icon}{duration}|{title}" })).toBe("…|Money Trees");
    expect(renderSegment(np({ state: "error" }), { format: "{icon}" })).toBe("!");
  });
  it("truncates title and artist before the rest of the line", () => {
    const line = renderSegment(np({ title: "Puente Del Papa (Regiorebajada)", artist: "Frente Cumbiero" }), { maxWidth: 40 });
    expect(line).toBe("▶ Puente… · Frente… ━───── 0:44 · LOUNGE");
    expect(Array.from(line).length).toBeLessThanOrEqual(40);
    expect(renderSegment(np(), { maxWidth: 100 })).toBe("▶ Money Trees · Kendrick Lamar ━───── 0:44 · LOUNGE");
  });
  it("cuts the line from the end when the fixed parts alone are too wide", () => {
    expect(renderSegment(np(), { maxWidth: 8 })).toBe("▶  ·  ━─");
  });
  it("emits tmux styles and escapes track text", () => {
    expect(renderSegment(np({ title: "#1 Hit" }), { tmux: true, barWidth: 10, format: "{icon}{title}{bar}{artist}{target}" })).toBe(
      "#[reverse,bold] ▶ #[noreverse,nobold]#[bold]##1 Hit#[nobold]#[bold]━#[nobold]#[dim]─────────#[nodim]#[dim]Kendrick Lamar#[nodim]#[bold]LOUNGE#[nobold]");
    expect(renderSegment(np({ state: "paused", position: 386 }), { tmux: true, barWidth: 2, format: "{icon}{bar}" })).toBe("#[fg=yellow,bold] ‖ #[fg=default,nobold]#[bold]━━#[nobold]");
    expect(renderSegment(np({ state: "loading", duration: null }), { tmux: true, format: "{icon}{duration}" })).toBe("#[fg=cyan] … #[fg=default]");
    expect(renderSegment(np({ state: "error" }), { tmux: true, format: "{icon}" })).toBe("#[fg=red,bold] ! #[fg=default,nobold]");
  });
  it("counts visible cells, not styles, in tmux mode", () => {
    const line = renderSegment(np(), { tmux: true, maxWidth: 30, format: "{icon} {title} · {artist}" });
    expect(line.replace(/#\[[^\]]*\]/g, "")).toBe(" ▶  Money Trees · Kendrick La…");
  });
});

describe("readNowPlaying / runStatus", () => {
  it("reads the local daemon by default", async () => {
    const src = sources();
    expect(await runStatus({}, src)).toBe("▶ Money Trees · Kendrick Lamar ━───── 0:44 · LOCAL");
    expect(src.local).toHaveBeenCalledWith(1000);
    expect(src.remote).not.toHaveBeenCalled();
  });
  it("reads a server player with --remote", async () => {
    const src = sources();
    expect(await runStatus({ remote: "lounge" }, src)).toBe("▶ Money Trees · Kendrick Lamar ━───── 0:44 · LOUNGE");
    expect(src.remote).toHaveBeenCalledWith("lounge");
  });
  it("prints nothing when the daemon or server is unreachable", async () => {
    expect(await runStatus({}, sources({ local: async () => { throw new Error("ENOENT"); } }))).toBe("");
    expect(await runStatus({ remote: "lounge", idle: "idle" }, sources({ remote: async () => { throw new Error("API Error"); } }))).toBe("");
  });
  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const pending = readNowPlaying({ remote: "lounge", timeout: 50 }, sources({ remote: () => new Promise(() => {}) }));
      await vi.advanceTimersByTimeAsync(50);
      expect(await pending).toBeUndefined();
    } finally { vi.useRealTimers(); }
  });
  it("prints the idle string, escaped for tmux, when nothing plays", async () => {
    const idle = sources({ local: async () => local({ current: null }) });
    expect(await runStatus({}, idle)).toBe("");
    expect(await runStatus({ idle: "■ idle" }, idle)).toBe("■ idle");
    expect(await runStatus({ idle: "# idle", tmux: true }, idle)).toBe("## idle");
  });
  it("prints JSON", async () => {
    expect(JSON.parse(await runStatus({ json: true, remote: "lounge" }, sources()))).toEqual(np());
    expect(await runStatus({ json: true }, sources({ local: async () => { throw new Error("down"); } }))).toBe("null");
  });
});

describe("readLocalSnapshot", () => {
  let dir: string | undefined;
  let socketServer: Server | undefined;
  const open: Socket[] = [];
  afterEach(async () => {
    for (const socket of open.splice(0)) socket.destroy();
    await new Promise((resolve) => socketServer ? socketServer.close(resolve) : resolve(undefined));
    socketServer = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("asks the daemon for status over its socket", async () => {
    dir = mkdtempSync(join(tmpdir(), "gn-status-"));
    const socketPath = join(dir, "player.sock");
    socketServer = createServer((socket) => socket.on("data", (chunk) => {
      const request = JSON.parse(chunk.toString()) as { id: number; method: string };
      expect(request.method).toBe("status");
      socket.write(encodeRpcResponse({ version: 1, id: request.id, result: local() }));
    }));
    await new Promise<void>((resolve) => socketServer!.listen(socketPath, resolve));
    expect(await readLocalSnapshot(socketPath, 500)).toEqual(local());
  });

  it("stops waiting for the daemon to hang up after a moment", async () => {
    dir = mkdtempSync(join(tmpdir(), "gn-status-"));
    const socketPath = join(dir, "player.sock");
    socketServer = createServer({ allowHalfOpen: true }, (socket) => socket.on("data", (chunk) => {
      const request = JSON.parse(chunk.toString()) as { id: number };
      socket.write(encodeRpcResponse({ version: 1, id: request.id, result: local() }));
      open.push(socket);
    }));
    await new Promise<void>((resolve) => socketServer!.listen(socketPath, resolve));
    expect(await readLocalSnapshot(socketPath, 500, 20)).toEqual(local());
  });

  it("rejects when no daemon is listening", async () => {
    await expect(readLocalSnapshot(join(tmpdir(), "gn-status-missing", "player.sock"), 200)).rejects.toThrow(/unavailable/);
  });
});

describe("default sources", () => {
  it("reads a server player through the configured client", async () => {
    getServerPlayer.mockResolvedValueOnce(server());
    expect(await defaultStatusSources.remote("lounge")).toEqual(server());
    expect(getServerPlayer).toHaveBeenCalledWith("lounge");
  });
  it("reads the daemon's socket and prints nothing without one", async () => {
    await expect(defaultStatusSources.local(200)).rejects.toThrow(/unavailable/);
    expect(await runStatus({})).toBe("");
  });
});

describe("addStatusCommand", () => {
  afterEach(() => vi.restoreAllMocks());

  async function run(args: string[], src: StatusSources) {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(((_text: string, done?: () => void) => { done?.(); return true; }) as never);
    const exit = vi.fn();
    const program = new Command().exitOverride();
    addStatusCommand(program, src, exit);
    await program.parseAsync(["node", "groovenet", "status", ...args]);
    return { write, exit };
  }

  it("writes the segment and exits 0", async () => {
    const { write, exit } = await run(["--remote", "lounge", "--tmux", "--max-width", "40", "--bar-width", "3", "--timeout", "500"], sources());
    expect(write.mock.calls[0]![0]).toContain("#[reverse,bold] ▶ ");
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("writes nothing and exits 0 when unreachable", async () => {
    const { write, exit } = await run([], sources({ local: async () => { throw new Error("down"); } }));
    expect(write).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits quietly when stdout is closed under it", async () => {
    const { exit } = await run([], sources());
    exit.mockClear();
    process.stdout.emit("error", new Error("EPIPE"));
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits through process.exit by default", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const program = new Command();
    addStatusCommand(program, sources({ local: async () => local({ current: null }) }));
    await program.parseAsync(["node", "groovenet", "status"]);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
