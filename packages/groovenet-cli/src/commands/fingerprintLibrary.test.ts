import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatProgress,
  formatSummary,
  resolveScope,
  settledCount,
  waitForRun,
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
