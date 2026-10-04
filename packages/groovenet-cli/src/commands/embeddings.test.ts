import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());

vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import { Command } from "commander";
import {
  addEmbeddingsCommands,
  consoleIO,
  formatProgress,
  formatStatus,
  formatSummary,
  resolveBackfillRequest,
  runEmbeddingsBackfill,
  runEmbeddingsStatus,
  settledCount,
  waitForBackfillRun,
  type EmbeddingsIO,
} from "./embeddings.js";
import type {
  EmbeddingBackfillDryRun,
  EmbeddingBackfillRun,
  EmbeddingStatus,
} from "@groovenet/client";

function run(overrides: Partial<EmbeddingBackfillRun> = {}): EmbeddingBackfillRun {
  return {
    run_id: "run-1",
    queued: 10,
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    started_at: 1000,
    updated_at: 1000,
    complete: false,
    ...overrides,
  };
}

function dryRun(overrides: Partial<EmbeddingBackfillDryRun> = {}): EmbeddingBackfillDryRun {
  return {
    dry_run: true,
    total: 4,
    by_type: { identity: 3, audio_vibe: 1 },
    ...overrides,
  };
}

// ─── resolveBackfillRequest ─────────────────────────────────────────────────

describe("resolveBackfillRequest()", () => {
  it("defaults to --missing", () => {
    expect(resolveBackfillRequest({})).toEqual({ scope: "missing" });
  });

  it("resolves --all", () => {
    expect(resolveBackfillRequest({ all: true })).toEqual({ scope: "all" });
  });

  it("resolves --release with its id", () => {
    expect(resolveBackfillRequest({ release: "r9" })).toEqual({
      scope: "release",
      release_id: "r9",
    });
  });

  it("resolves --track as a list of ids", () => {
    expect(resolveBackfillRequest({ track: "t1, t2" })).toEqual({
      scope: "track",
      track_ids: ["t1", "t2"],
    });
  });

  it("carries --friend-id, --type and --force through", () => {
    expect(
      resolveBackfillRequest({ all: true, friendId: 2, type: "identity,audio_vibe", force: true })
    ).toEqual({
      scope: "all",
      friend_id: 2,
      types: ["identity", "audio_vibe"],
      force: true,
    });
  });

  it("carries --dry-run through", () => {
    expect(resolveBackfillRequest({ missing: true, dryRun: true })).toEqual({
      scope: "missing",
      dry_run: true,
    });
  });

  it("refuses two scopes rather than picking one", () => {
    expect(() => resolveBackfillRequest({ missing: true, all: true })).toThrow(
      /Choose one scope/
    );
  });

  it("names the conflicting scopes", () => {
    expect(() => resolveBackfillRequest({ all: true, release: "r1" })).toThrow(
      /--all --release/
    );
  });
});

// ─── counters ───────────────────────────────────────────────────────────────

describe("settledCount()", () => {
  it("counts every terminal state", () => {
    expect(settledCount(run({ success: 5, skipped: 3, failed: 2 }))).toBe(10);
  });
});

describe("formatProgress()", () => {
  it("shows settled over queued", () => {
    expect(formatProgress(run({ success: 7, queued: 10 }))).toContain("7/10");
  });

  it("treats an empty run as complete rather than dividing by zero", () => {
    const line = formatProgress(run({ queued: 0 }), 10);
    expect(line).toContain("0/0");
    expect(line).toContain("██████████");
  });
});

describe("formatSummary()", () => {
  it("reports all three counters", () => {
    const line = formatSummary(run({ success: 7, skipped: 1, failed: 2 }));
    expect(line).toContain("7 generated");
    expect(line).toContain("1 unchanged");
    expect(line).toContain("2 failed");
  });

  it("shows zero failed in gray rather than omitting it", () => {
    expect(formatSummary(run({ success: 1, failed: 0 }))).toContain("0 failed");
  });
});

// ─── waitForBackfillRun ─────────────────────────────────────────────────────

describe("waitForBackfillRun()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  function clientReturning(...runs: EmbeddingBackfillRun[]) {
    const getEmbeddingBackfillRun = vi.fn();
    for (const r of runs) getEmbeddingBackfillRun.mockResolvedValueOnce(r);
    return { getEmbeddingBackfillRun };
  }

  it("returns as soon as the run is complete", async () => {
    const client = clientReturning(run({ success: 10, complete: true }));

    const result = await waitForBackfillRun(client, "run-1", { pollIntervalMs: 1 });

    expect(result.success).toBe(10);
    expect(client.getEmbeddingBackfillRun).toHaveBeenCalledTimes(1);
  });

  it("polls until completion", async () => {
    const client = clientReturning(
      run({ success: 3 }),
      run({ success: 7 }),
      run({ success: 10, complete: true })
    );

    const pending = waitForBackfillRun(client, "run-1", { pollIntervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toMatchObject({ success: 10 });
    expect(client.getEmbeddingBackfillRun).toHaveBeenCalledTimes(3);
  });
});

// ─── runEmbeddingsBackfill ──────────────────────────────────────────────────

describe("runEmbeddingsBackfill()", () => {
  function recorder() {
    const lines: string[] = [];
    const writes: string[] = [];
    const io: EmbeddingsIO = {
      log: (line) => lines.push(line),
      write: (text) => writes.push(text),
    };
    return { io, lines, writes, all: () => lines.join("\n") };
  }

  function clientFor(
    started: Partial<EmbeddingBackfillRun | EmbeddingBackfillDryRun>,
    ...polls: Partial<EmbeddingBackfillRun>[]
  ) {
    const startEmbeddingBackfill = vi
      .fn()
      .mockResolvedValue("dry_run" in started ? started : run(started));
    const getEmbeddingBackfillRun = vi.fn();
    for (const p of polls) getEmbeddingBackfillRun.mockResolvedValueOnce(run(p));
    return { startEmbeddingBackfill, getEmbeddingBackfillRun };
  }

  it("starts the run for the resolved scope", async () => {
    const client = clientFor({ queued: 0, complete: true }, { queued: 0, complete: true });
    const { io } = recorder();

    await runEmbeddingsBackfill(client, { all: true, force: true, wait: true }, io);

    expect(client.startEmbeddingBackfill).toHaveBeenCalledWith({ scope: "all", force: true });
  });

  it("prints the queued total", async () => {
    const client = clientFor({ queued: 5 }, { queued: 5, success: 5, complete: true });
    const { io, all } = recorder();

    await runEmbeddingsBackfill(client, { wait: true }, io);

    expect(all()).toContain("Backfilling embeddings (missing)");
    expect(all()).toContain("5 queued");
  });

  it("prints the three counters when the run finishes", async () => {
    const client = clientFor(
      { queued: 10 },
      { queued: 10, success: 7, skipped: 1, failed: 2, complete: true }
    );
    const { io, all } = recorder();

    await runEmbeddingsBackfill(client, { wait: true }, io);

    expect(all()).toContain("7 generated");
    expect(all()).toContain("1 unchanged");
    expect(all()).toContain("2 failed");
  });

  it("exits non-zero when any job failed", async () => {
    const client = clientFor({ queued: 1 }, { queued: 1, failed: 1, complete: true });
    const { io } = recorder();

    expect(await runEmbeddingsBackfill(client, { wait: true }, io)).toBe(1);
  });

  it("exits zero when nothing failed", async () => {
    const client = clientFor({ queued: 1 }, { queued: 1, success: 1, complete: true });
    const { io } = recorder();

    expect(await runEmbeddingsBackfill(client, { wait: true }, io)).toBe(0);
  });

  it("reports each failure as it appears", async () => {
    const client = clientFor(
      { queued: 2 },
      { queued: 2, failed: 2, complete: true, errors: ["t1: rate limited", "t2: not found"] }
    );
    const { io, all } = recorder();

    await runEmbeddingsBackfill(client, { wait: true }, io);

    expect(all()).toContain("t1: rate limited");
    expect(all()).toContain("t2: not found");
  });

  // ── dry run ──

  it("dry_run reports counts and never polls", async () => {
    const client = clientFor(dryRun());
    const { io, all } = recorder();

    const code = await runEmbeddingsBackfill(client, { dryRun: true }, io);

    expect(code).toBe(0);
    expect(client.getEmbeddingBackfillRun).not.toHaveBeenCalled();
    expect(all()).toContain("4 track(s) would be queued");
    expect(all()).toContain("identity: 3");
  });

  it("dry_run --json prints the counts as JSON", async () => {
    const client = clientFor(dryRun());
    const { io, writes, lines } = recorder();

    await runEmbeddingsBackfill(client, { dryRun: true, json: true }, io);

    expect(lines).toEqual([]);
    expect(JSON.parse(writes.join(""))).toMatchObject({ dry_run: true, total: 4 });
  });

  // ── --no-wait ──

  it("--no-wait returns after queueing, without polling", async () => {
    const client = clientFor({ run_id: "run-9", queued: 12 });
    const { io, all } = recorder();

    const code = await runEmbeddingsBackfill(client, { wait: false }, io);

    expect(code).toBe(0);
    expect(client.getEmbeddingBackfillRun).not.toHaveBeenCalled();
    expect(all()).toContain("run run-9");
  });

  it("--no-wait --json prints the queued run", async () => {
    const client = clientFor({ run_id: "run-9", queued: 12 });
    const { io, writes, lines } = recorder();

    await runEmbeddingsBackfill(client, { wait: false, json: true }, io);

    expect(lines).toEqual([]);
    expect(JSON.parse(writes.join(""))).toMatchObject({ run_id: "run-9", queued: 12 });
  });

  // ── --json ──

  it("--json prints only the finished run, as parseable JSON", async () => {
    const client = clientFor({ queued: 10 }, { queued: 10, success: 10, complete: true });
    const { io, writes, lines } = recorder();

    await runEmbeddingsBackfill(client, { wait: true, json: true }, io);

    expect(lines).toEqual([]);
    expect(JSON.parse(writes.join(""))).toMatchObject({ success: 10, complete: true });
  });

  it("--json still exits non-zero when jobs failed", async () => {
    const client = clientFor({ queued: 1 }, { queued: 1, failed: 1, complete: true });
    const { io } = recorder();

    expect(await runEmbeddingsBackfill(client, { wait: true, json: true }, io)).toBe(1);
  });

  it("never reports the same failure twice across polls", async () => {
    // The run hash carries every failure so far, so each poll repeats the
    // ones already printed.
    const client = clientFor(
      { queued: 2 },
      { queued: 2, failed: 1, errors: ["t1: rate limited"] },
      { queued: 2, failed: 1, success: 1, complete: true, errors: ["t1: rate limited"] }
    );
    const { io, lines } = recorder();
    vi.useFakeTimers();

    const pending = runEmbeddingsBackfill(client, { wait: true, pollInterval: 1 }, io);
    await vi.advanceTimersByTimeAsync(5);
    await pending;

    expect(lines.filter((l) => l.includes("t1: rate limited"))).toHaveLength(1);
  });

  it("propagates a scope conflict rather than starting a run", async () => {
    const client = clientFor({});
    const { io } = recorder();

    await expect(
      runEmbeddingsBackfill(client, { missing: true, all: true }, io)
    ).rejects.toThrow(/Choose one scope/);
    expect(client.startEmbeddingBackfill).not.toHaveBeenCalled();
  });
});

// ─── status ─────────────────────────────────────────────────────────────────

function status(overrides: Partial<EmbeddingStatus> = {}): EmbeddingStatus {
  return {
    total_tracks: 100,
    missing: { identity: 0, audio_vibe: 2 },
    ...overrides,
  };
}

describe("formatStatus()", () => {
  it("reports complete for a zero count and missing otherwise", () => {
    const lines = formatStatus(status()).join("\n");
    expect(lines).toContain("100 track(s)");
    expect(lines).toContain("identity");
    expect(lines).toContain("complete");
    expect(lines).toContain("2 missing");
  });
});

describe("runEmbeddingsStatus()", () => {
  it("prints the formatted status", async () => {
    const lines: string[] = [];
    const client = { getEmbeddingStatus: vi.fn().mockResolvedValue(status()) };

    const code = await runEmbeddingsStatus(client, {}, { log: (l) => lines.push(l), write: vi.fn() });

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("100 track(s)");
  });

  it("passes friendId through", async () => {
    const client = { getEmbeddingStatus: vi.fn().mockResolvedValue(status()) };

    await runEmbeddingsStatus(client, { friendId: 7 }, { log: vi.fn(), write: vi.fn() });

    expect(client.getEmbeddingStatus).toHaveBeenCalledWith(7);
  });

  it("--json prints the raw status", async () => {
    const writes: string[] = [];
    const client = { getEmbeddingStatus: vi.fn().mockResolvedValue(status()) };

    await runEmbeddingsStatus(client, { json: true }, {
      log: vi.fn(),
      write: (t) => writes.push(t),
    });

    expect(JSON.parse(writes.join(""))).toMatchObject({ total_tracks: 100 });
  });
});

describe("consoleIO", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a whole line", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleIO.log("hello");
    expect(log).toHaveBeenCalledWith("hello");
  });
});

// ─── command wiring ─────────────────────────────────────────────────────────

describe("addEmbeddingsCommands()", () => {
  const startEmbeddingBackfill = vi.fn();
  const getEmbeddingBackfillRun = vi.fn();
  const getEmbeddingStatus = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    startEmbeddingBackfill.mockReset().mockResolvedValue(run({ run_id: "run-9", queued: 0 }));
    getEmbeddingBackfillRun.mockReset();
    getEmbeddingStatus.mockReset().mockResolvedValue(status());
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockImplementation(function () {
      return { startEmbeddingBackfill, getEmbeddingBackfillRun, getEmbeddingStatus };
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
    addEmbeddingsCommands(program);
    return program.parseAsync(["node", "groovenet", ...args]);
  }

  it("registers the embeddings command with backfill and status subcommands", () => {
    const program = new Command();
    addEmbeddingsCommands(program);

    const embeddings = program.commands.find((c) => c.name() === "embeddings");
    expect(embeddings).toBeDefined();
    expect(embeddings?.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["backfill", "status"])
    );
  });

  it("waits by default", async () => {
    getEmbeddingBackfillRun.mockResolvedValue(run({ queued: 0, complete: true }));

    await parse("embeddings", "backfill");

    expect(getEmbeddingBackfillRun).toHaveBeenCalled();
  });

  it("--no-wait skips polling", async () => {
    await parse("embeddings", "backfill", "--no-wait");

    expect(getEmbeddingBackfillRun).not.toHaveBeenCalled();
  });

  it("passes the scope flags through", async () => {
    await parse(
      "embeddings",
      "backfill",
      "--release",
      "12345",
      "--friend-id",
      "2",
      "--force",
      "--no-wait"
    );

    expect(startEmbeddingBackfill).toHaveBeenCalledWith({
      scope: "release",
      release_id: "12345",
      friend_id: 2,
      force: true,
    });
  });

  it("sets a non-zero exit code when a job failed", async () => {
    getEmbeddingBackfillRun.mockResolvedValue(run({ queued: 1, failed: 1, complete: true }));

    await parse("embeddings", "backfill");

    expect(process.exitCode).toBe(1);
  });

  it("reports an API failure on stderr and exits 1", async () => {
    startEmbeddingBackfill.mockRejectedValue(new Error("redis is gone"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await parse("embeddings", "backfill", "--no-wait");

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("redis is gone"));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("stringifies a non-Error rejection from the backfill command", async () => {
    startEmbeddingBackfill.mockRejectedValue("redis is gone");
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await parse("embeddings", "backfill", "--no-wait");

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("redis is gone"));
  });

  it("stringifies a non-Error rejection from the status command", async () => {
    getEmbeddingStatus.mockRejectedValue("db is gone");
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await parse("embeddings", "status");

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("db is gone"));
  });

  it("runs the status subcommand", async () => {
    await parse("embeddings", "status");

    expect(getEmbeddingStatus).toHaveBeenCalledWith(undefined);
  });

  it("status reports an API failure on stderr and exits 1", async () => {
    getEmbeddingStatus.mockRejectedValue(new Error("db is gone"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await parse("embeddings", "status");

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("db is gone"));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("status --friend-id narrows the lookup", async () => {
    await parse("embeddings", "status", "--friend-id", "3");

    expect(getEmbeddingStatus).toHaveBeenCalledWith(3);
  });
});
