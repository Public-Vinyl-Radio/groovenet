import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());

vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import { Command } from "commander";
import {
  addFingerprintLibraryCommand,
  consoleIO,
  formatProgress,
  formatSummary,
  makeClient,
  resolveScope,
  runFingerprintLibrary,
  settledCount,
  waitForRun,
  type FingerprintLibraryIO,
} from "./fingerprintLibrary.js";
import type { FingerprintIndexRun } from "@groovenet/client";

function run(overrides: Partial<FingerprintIndexRun> = {}): FingerprintIndexRun {
  return {
    run_id: "run-1",
    scope: "missing",
    fingerprint_type: "chromaprint",
    fingerprint_version: "1",
    queued: 10,
    unindexable: 241,
    indexed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    started_at: 1000,
    updated_at: 1000,
    complete: false,
    ...overrides,
  };
}

// ─── resolveScope ─────────────────────────────────────────────────────────────

describe("resolveScope()", () => {
  it("defaults to --missing", () => {
    // The cheap case: the alternatives re-read and re-hash every indexed file.
    expect(resolveScope({})).toEqual({ scope: "missing" });
  });

  it("resolves --missing", () => {
    expect(resolveScope({ missing: true })).toEqual({ scope: "missing" });
  });

  it("resolves --changed", () => {
    expect(resolveScope({ changed: true })).toEqual({ scope: "changed" });
  });

  it("resolves --all", () => {
    expect(resolveScope({ all: true })).toEqual({ scope: "all" });
  });

  it("resolves --track with its id", () => {
    expect(resolveScope({ track: "t1" })).toEqual({
      scope: "track",
      track_id: "t1",
    });
  });

  it("resolves --release with its id", () => {
    expect(resolveScope({ release: "r9" })).toEqual({
      scope: "release",
      release_id: "r9",
    });
  });

  it("carries --friend-id through", () => {
    expect(resolveScope({ all: true, friendId: 2 })).toEqual({
      scope: "all",
      friend_id: 2,
    });
  });

  it("carries --force through", () => {
    expect(resolveScope({ all: true, force: true })).toEqual({
      scope: "all",
      force: true,
    });
  });

  it("omits force when not asked for", () => {
    // Absent rather than false, so a re-run is idempotent by default at every
    // scope — including --all.
    expect(resolveScope({ all: true })).not.toHaveProperty("force");
  });

  it("refuses two scopes rather than picking one", () => {
    expect(() => resolveScope({ missing: true, all: true })).toThrow(
      /Choose one scope/
    );
  });

  it("names the conflicting scopes", () => {
    expect(() => resolveScope({ changed: true, track: "t1" })).toThrow(
      /--changed --track/
    );
  });
});

// ─── counters ─────────────────────────────────────────────────────────────────

describe("settledCount()", () => {
  it("counts every terminal state", () => {
    expect(settledCount(run({ indexed: 5, skipped: 3, failed: 2 }))).toBe(10);
  });

  it("excludes unindexable tracks, which are never queued", () => {
    expect(settledCount(run({ indexed: 1, unindexable: 241 }))).toBe(1);
  });
});

describe("formatProgress()", () => {
  it("shows settled over queued", () => {
    expect(formatProgress(run({ indexed: 7, queued: 10 }))).toContain("7/10");
  });

  it("fills the bar in proportion", () => {
    const line = formatProgress(run({ indexed: 5, queued: 10 }), 10);
    expect(line).toContain("█████░░░░░");
  });

  it("does not overflow past the queued count", () => {
    const line = formatProgress(run({ indexed: 12, queued: 10 }), 10);
    expect(line).toContain("██████████");
    expect(line).not.toContain("░");
  });

  it("treats an empty run as complete rather than dividing by zero", () => {
    const line = formatProgress(run({ queued: 0 }), 10);
    expect(line).toContain("0/0");
    expect(line).toContain("██████████");
  });
});

describe("formatSummary()", () => {
  it("reports all four counters", () => {
    const line = formatSummary(
      run({ indexed: 3412, skipped: 0, failed: 2, unindexable: 241 })
    );

    expect(line).toContain("3412 indexed");
    expect(line).toContain("0 skipped");
    expect(line).toContain("2 failed");
    expect(line).toContain("241 no audio");
  });

  it("keeps tracks with no audio apart from failures", () => {
    // Nullable local_audio_url means only part of the library is indexable.
    // That is a fact about the library, not a failure of the run.
    const line = formatSummary(run({ failed: 0, unindexable: 241 }));
    expect(line).toContain("0 failed");
    expect(line).toContain("241 no audio");
  });
});

// ─── waitForRun ───────────────────────────────────────────────────────────────

describe("waitForRun()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function clientReturning(...runs: FingerprintIndexRun[]) {
    const getFingerprintIndexRun = vi.fn();
    for (const r of runs) getFingerprintIndexRun.mockResolvedValueOnce(r);
    return { getFingerprintIndexRun };
  }

  it("returns as soon as the run is complete", async () => {
    const client = clientReturning(run({ indexed: 10, complete: true }));

    const result = await waitForRun(client, "run-1", { pollIntervalMs: 1 });

    expect(result.indexed).toBe(10);
    expect(client.getFingerprintIndexRun).toHaveBeenCalledTimes(1);
  });

  it("polls until completion", async () => {
    const client = clientReturning(
      run({ indexed: 3 }),
      run({ indexed: 7 }),
      run({ indexed: 10, complete: true })
    );

    const pending = waitForRun(client, "run-1", { pollIntervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toMatchObject({ indexed: 10 });
    expect(client.getFingerprintIndexRun).toHaveBeenCalledTimes(3);
  });

  it("reports every poll to the caller", async () => {
    const client = clientReturning(
      run({ indexed: 3 }),
      run({ indexed: 10, complete: true })
    );
    const seen: number[] = [];

    const pending = waitForRun(client, "run-1", {
      pollIntervalMs: 1000,
      onProgress: (r) => seen.push(r.indexed),
    });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;

    expect(seen).toEqual([3, 10]);
  });
});

// ─── runFingerprintLibrary ────────────────────────────────────────────────────

describe("runFingerprintLibrary()", () => {
  function recorder() {
    const lines: string[] = [];
    const writes: string[] = [];
    const io: FingerprintLibraryIO = {
      log: (line) => lines.push(line),
      write: (text) => writes.push(text),
    };
    return { io, lines, writes, all: () => lines.join("\n") };
  }

  function clientFor(started: Partial<FingerprintIndexRun>, ...polls: Partial<FingerprintIndexRun>[]) {
    const startFingerprintIndex = vi.fn().mockResolvedValue(run(started));
    const getFingerprintIndexRun = vi.fn();
    for (const p of polls) getFingerprintIndexRun.mockResolvedValueOnce(run(p));
    return { startFingerprintIndex, getFingerprintIndexRun };
  }

  it("starts the run for the resolved scope", async () => {
    const client = clientFor({ queued: 0, complete: true }, { queued: 0, complete: true });
    const { io } = recorder();

    await runFingerprintLibrary(client, { all: true, force: true, wait: true }, io);

    expect(client.startFingerprintIndex).toHaveBeenCalledWith({
      scope: "all",
      force: true,
    });
  });

  it("prints the engine and the queued totals", async () => {
    const client = clientFor(
      { scope: "missing", fingerprint_type: "chromaprint", fingerprint_version: "1", queued: 3653, unindexable: 241 },
      { queued: 3653, indexed: 3653, complete: true }
    );
    const { io, all } = recorder();

    await runFingerprintLibrary(client, { wait: true }, io);

    expect(all()).toContain("Indexing missing");
    expect(all()).toContain("chromaprint 1");
    expect(all()).toContain("3653 queued, 241 without reference audio");
  });

  it("prints the four counters when the run finishes", async () => {
    const client = clientFor(
      { queued: 10 },
      { queued: 10, indexed: 7, skipped: 1, failed: 2, unindexable: 241, complete: true }
    );
    const { io, all } = recorder();

    await runFingerprintLibrary(client, { wait: true }, io);

    expect(all()).toContain("7 indexed");
    expect(all()).toContain("1 skipped");
    expect(all()).toContain("2 failed");
    expect(all()).toContain("241 no audio");
  });

  it("exits non-zero when any track failed", async () => {
    const client = clientFor({ queued: 1 }, { queued: 1, failed: 1, complete: true });
    const { io } = recorder();

    expect(await runFingerprintLibrary(client, { wait: true }, io)).toBe(1);
  });

  it("exits zero when nothing failed", async () => {
    const client = clientFor({ queued: 1 }, { queued: 1, indexed: 1, complete: true });
    const { io } = recorder();

    expect(await runFingerprintLibrary(client, { wait: true }, io)).toBe(0);
  });

  it("clears the progress line before the summary", async () => {
    // Otherwise the bar's tail is left dangling after the last counters.
    const client = clientFor({ queued: 1 }, { queued: 1, indexed: 1, complete: true });
    const { io, writes } = recorder();

    await runFingerprintLibrary(client, { wait: true }, io);

    expect(writes.at(-1)).toBe("\r\x1b[2K");
  });

  it("rewrites one progress line rather than scrolling", async () => {
    const client = clientFor(
      { queued: 10 },
      { queued: 10, indexed: 3 },
      { queued: 10, indexed: 10, complete: true }
    );
    const { io, writes } = recorder();
    vi.useFakeTimers();

    const pending = runFingerprintLibrary(client, { wait: true, pollInterval: 1 }, io);
    await vi.advanceTimersByTimeAsync(5);
    await pending;

    const progress = writes.filter((w) => w.startsWith("\r  indexing"));
    expect(progress).toHaveLength(2);
    expect(progress[0]).toContain("3/10");
    expect(progress[1]).toContain("10/10");
  });

  // ── failure reporting ──

  it("reports each failure as it appears", async () => {
    const client = clientFor(
      { queued: 2 },
      { queued: 2, failed: 2, complete: true, errors: ["t1: decode failed", "t2: no such file"] }
    );
    const { io, all } = recorder();

    await runFingerprintLibrary(client, { wait: true }, io);

    expect(all()).toContain("t1: decode failed");
    expect(all()).toContain("t2: no such file");
  });

  it("never reports the same failure twice across polls", async () => {
    // The run hash carries every failure so far, so each poll repeats the ones
    // already printed.
    const client = clientFor(
      { queued: 2 },
      { queued: 2, failed: 1, errors: ["t1: decode failed"] },
      { queued: 2, failed: 1, indexed: 1, complete: true, errors: ["t1: decode failed"] }
    );
    const { io, lines } = recorder();
    vi.useFakeTimers();

    const pending = runFingerprintLibrary(client, { wait: true, pollInterval: 1 }, io);
    await vi.advanceTimersByTimeAsync(5);
    await pending;

    expect(lines.filter((l) => l.includes("t1: decode failed"))).toHaveLength(1);
  });

  // ── --no-wait ──

  it("--no-wait returns after queueing, without polling", async () => {
    const client = clientFor({ run_id: "run-9", queued: 12 });
    const { io, all } = recorder();

    const code = await runFingerprintLibrary(client, { wait: false }, io);

    expect(code).toBe(0);
    expect(client.getFingerprintIndexRun).not.toHaveBeenCalled();
    expect(all()).toContain("run run-9");
  });

  it("--no-wait --json prints the queued run", async () => {
    const client = clientFor({ run_id: "run-9", queued: 12 });
    const { io, writes, lines } = recorder();

    await runFingerprintLibrary(client, { wait: false, json: true }, io);

    expect(lines).toEqual([]); // no human header in JSON mode
    expect(JSON.parse(writes.join(""))).toMatchObject({ run_id: "run-9", queued: 12 });
  });

  // ── --json ──

  it("--json prints only the finished run, as parseable JSON", async () => {
    const client = clientFor(
      { queued: 10 },
      { queued: 10, indexed: 3 },
      { queued: 10, indexed: 10, complete: true }
    );
    const { io, writes, lines } = recorder();
    vi.useFakeTimers();

    const pending = runFingerprintLibrary(client, { wait: true, json: true, pollInterval: 1 }, io);
    await vi.advanceTimersByTimeAsync(5);
    await pending;

    expect(lines).toEqual([]);
    // One object at the end, not a stream of progress lines.
    expect(JSON.parse(writes.join(""))).toMatchObject({ indexed: 10, complete: true });
  });

  it("--json still exits non-zero when tracks failed", async () => {
    const client = clientFor({ queued: 1 }, { queued: 1, failed: 1, complete: true });
    const { io } = recorder();

    expect(await runFingerprintLibrary(client, { wait: true, json: true }, io)).toBe(1);
  });

  it("propagates a scope conflict rather than starting a run", async () => {
    const client = clientFor({});
    const { io } = recorder();

    await expect(
      runFingerprintLibrary(client, { missing: true, all: true, wait: true }, io)
    ).rejects.toThrow(/Choose one scope/);
    expect(client.startFingerprintIndex).not.toHaveBeenCalled();
  });
});

// ─── makeClient ───────────────────────────────────────────────────────────────

describe("makeClient()", () => {
  afterEach(() => vi.clearAllMocks());

  it("builds a client from the stored config", () => {
    loadConfig.mockReturnValue({
      api_base: "https://groovenet.home.arpa/api",
      api_key: "secret",
      insecure_tls: true,
    });

    makeClient();

    expect(GroovenetClientMock).toHaveBeenCalledWith({
      baseUrl: "https://groovenet.home.arpa/api",
      apiKey: "secret",
      insecureTls: true,
    });
  });
});

describe("consoleIO", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a whole line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleIO.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
  });

  it("writes raw, so the progress line can rewrite itself", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    consoleIO.write("\rprogress");
    expect(write).toHaveBeenCalledWith("\rprogress");
  });
});

// ─── command wiring ───────────────────────────────────────────────────────────

describe("addFingerprintLibraryCommand()", () => {
  const startFingerprintIndex = vi.fn();
  const getFingerprintIndexRun = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    startFingerprintIndex.mockReset().mockResolvedValue(run({ run_id: "run-9", queued: 0 }));
    getFingerprintIndexRun.mockReset();
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockImplementation(function () {
      // Not an arrow: `makeClient` calls this with `new`.
      return { startFingerprintIndex, getFingerprintIndexRun };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function parse(...args: string[]) {
    const program = new Command();
    program.exitOverride();
    addFingerprintLibraryCommand(program);
    return program.parseAsync(["node", "groovenet", "fingerprint-library", ...args]);
  }

  it("registers the command", () => {
    const program = new Command();
    addFingerprintLibraryCommand(program);

    expect(program.commands.map((c) => c.name())).toContain("fingerprint-library");
  });

  it("waits by default", async () => {
    getFingerprintIndexRun.mockResolvedValue(run({ queued: 0, complete: true }));

    await parse();

    expect(getFingerprintIndexRun).toHaveBeenCalled();
  });

  it("--no-wait skips polling", async () => {
    await parse("--no-wait");

    expect(getFingerprintIndexRun).not.toHaveBeenCalled();
  });

  it("passes the scope flags through", async () => {
    await parse("--release", "12345", "--friend-id", "2", "--force", "--no-wait");

    expect(startFingerprintIndex).toHaveBeenCalledWith({
      scope: "release",
      release_id: "12345",
      friend_id: 2,
      force: true,
    });
  });

  it("sets a non-zero exit code when tracks failed", async () => {
    getFingerprintIndexRun.mockResolvedValue(
      run({ queued: 1, failed: 1, complete: true })
    );

    await parse();

    expect(process.exitCode).toBe(1);
  });

  it("leaves the exit code clean on success", async () => {
    getFingerprintIndexRun.mockResolvedValue(
      run({ queued: 1, indexed: 1, complete: true })
    );

    await parse();

    expect(process.exitCode).toBe(0);
  });

  it("reports an API failure on stderr and exits 1", async () => {
    startFingerprintIndex.mockRejectedValue(
      new Error("API Error: No fingerprint engine registered")
    );
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    await parse("--no-wait");

    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("No fingerprint engine registered")
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
