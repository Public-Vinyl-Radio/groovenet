import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscogsImportRow } from "@/server/repositories/discogsImportRepository";
import type { DiscogsImportReporter } from "@/server/services/discogsImportRunner";

const repoMock = vi.hoisted(() => ({
  claimNext: vi.fn(),
  heartbeat: vi.fn(),
  updateProgress: vi.fn(),
  finish: vi.fn(),
  appendLog: vi.fn(),
  prune: vi.fn(),
}));
const runnerMock = vi.hoisted(() => ({ runDiscogsImport: vi.fn() }));
vi.mock("@/server/repositories/discogsImportRepository", () => ({
  discogsImportRepository: repoMock,
}));
vi.mock("@/server/services/discogsImportRunner", () => runnerMock);

import {
  DiscogsImportWorker,
  kickDiscogsImportWorker,
  leaseSeconds,
  LeaseLostError,
  MAX_ATTEMPTS,
  outcomeError,
  pollSeconds,
  resetDiscogsImportWorkerForTests,
  startDiscogsImportWorker,
} from "../discogsImportWorker";

const row = (patch: Partial<DiscogsImportRow> = {}): DiscogsImportRow => ({
  id: 5,
  username: "dj",
  status: "running",
  phase: "queued",
  found: 0,
  total: null,
  fetched: 0,
  added: 0,
  removed: 0,
  failed_releases: 0,
  last_error: null,
  attempts: 1,
  lease_owner: "me",
  stalled: false,
  created_at: "2026-11-24T10:00:00.000Z",
  started_at: "2026-11-24T10:00:00.000Z",
  updated_at: "2026-11-24T10:00:00.000Z",
  finished_at: null,
  ...patch,
});

const outcome = {
  added: 2,
  removed: 1,
  failedReleases: [],
  trackFailures: 0,
  ingestError: null,
};

function worker(tokenSet = true) {
  return new DiscogsImportWorker({
    repo: repoMock,
    run: runnerMock.runDiscogsImport,
    owner: "me",
    tokenSet: () => tokenSet,
  });
}

const logged = () => repoMock.appendLog.mock.calls.flatMap(([, lines]) => lines as string[]);
const progressWritten = () =>
  Object.assign({}, ...repoMock.updateProgress.mock.calls.map(([, , patch]) => patch));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  repoMock.heartbeat.mockResolvedValue(true);
  repoMock.updateProgress.mockResolvedValue(true);
  repoMock.finish.mockResolvedValue(true);
  repoMock.appendLog.mockResolvedValue(undefined);
  repoMock.prune.mockResolvedValue(undefined);
  delete process.env.DISCOGS_IMPORT_LEASE_SECONDS;
  delete process.env.DISCOGS_IMPORT_POLL_SECONDS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDiscogsImportWorkerForTests();
});

describe("settings", () => {
  it("reads the lease and poll from the env, with defaults for nonsense", () => {
    expect(leaseSeconds()).toBe(60);
    expect(pollSeconds()).toBe(5);
    process.env.DISCOGS_IMPORT_LEASE_SECONDS = "20";
    process.env.DISCOGS_IMPORT_POLL_SECONDS = "-1";
    expect(leaseSeconds()).toBe(20);
    expect(pollSeconds()).toBe(5);
  });
});

describe("outcomeError", () => {
  it("is null for a clean run and names every problem otherwise", () => {
    expect(outcomeError(outcome)).toBeNull();
    expect(
      outcomeError({
        ...outcome,
        ingestError: "db down",
        failedReleases: [{ releaseId: "1", error: "404" }],
        trackFailures: 3,
      }),
    ).toBe("Auto-ingest error: db down; 1 releases failed to download; 3 tracks failed to save");
  });
});

describe("DiscogsImportWorker", () => {
  it("runs a claimed import to completed, with its log, counters and lease", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    runnerMock.runDiscogsImport.mockImplementation(
      async (_username: string, reporter: DiscogsImportReporter) => {
        reporter.send("Found release ID: 1\n\n");
        reporter.progress({ phase: "fetching", total: 2 });
        reporter.progress({ fetched: 1 });
        reporter.ensureActive();
        return outcome;
      },
    );

    expect(await worker().tick()).toBe(1);

    expect(repoMock.claimNext).toHaveBeenCalledWith("me", 60);
    expect(runnerMock.runDiscogsImport.mock.calls[0][0]).toBe("dj");
    expect(logged()).toEqual(["Found release ID: 1\n\n"]);
    expect(progressWritten()).toEqual({
      phase: "fetching",
      total: 2,
      fetched: 1,
      added: 2,
      removed: 1,
      failed_releases: 0,
    });
    expect(repoMock.finish).toHaveBeenCalledWith(5, "me", "completed", null);
    expect(repoMock.prune).toHaveBeenCalledWith("dj", 10);
  });

  it("records what went wrong in a run that finished with errors", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    runnerMock.runDiscogsImport.mockResolvedValue({ ...outcome, trackFailures: 2 });
    await worker().tick();
    expect(repoMock.finish).toHaveBeenCalledWith(5, "me", "completed", "2 tracks failed to save");
  });

  it("marks an import that threw as failed, with the error in its log and last_error", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    runnerMock.runDiscogsImport.mockRejectedValue(new Error("HTTP 401"));
    await worker().tick();
    expect(logged()).toEqual(["Error: HTTP 401\n\n"]);
    expect(repoMock.finish).toHaveBeenCalledWith(5, "me", "failed", "HTTP 401");
  });

  it("names a non-Error failure", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    runnerMock.runDiscogsImport.mockRejectedValue("offline");
    await worker().tick();
    expect(repoMock.finish).toHaveBeenCalledWith(5, "me", "failed", "offline");
  });

  it("fails an import at once without a token, as the route's 500 did", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    await worker(false).tick();
    expect(runnerMock.runDiscogsImport).not.toHaveBeenCalled();
    expect(repoMock.finish).toHaveBeenCalledWith(
      5,
      "me",
      "failed",
      "Discogs credentials not set in environment",
    );
  });

  it("says it is resuming when it takes up an import a restart cut short", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row({ attempts: 2 })).mockResolvedValueOnce(null);
    runnerMock.runDiscogsImport.mockResolvedValue(outcome);
    await worker().tick();
    expect(logged()[0]).toBe("Resuming the import after a restart (attempt 2)\n\n");
    expect(repoMock.finish).toHaveBeenCalledWith(5, "me", "completed", null);
  });

  it("gives up on an import that keeps taking its process down: interrupted, to resume by hand", async () => {
    repoMock.claimNext
      .mockResolvedValueOnce(row({ attempts: MAX_ATTEMPTS + 1 }))
      .mockResolvedValueOnce(null);
    await worker().tick();
    expect(runnerMock.runDiscogsImport).not.toHaveBeenCalled();
    expect(repoMock.finish).toHaveBeenCalledWith(
      5,
      "me",
      "interrupted",
      "Stopped after 3 restarts; resume to try again",
    );
  });

  it("stops and writes nothing more once another worker holds the import", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    repoMock.heartbeat.mockResolvedValue(false);
    runnerMock.runDiscogsImport.mockImplementation(
      async (_u: string, reporter: DiscogsImportReporter) => {
        // A lease of 60 s beats every 15 s; the beat finds the row is someone else's.
        await vi.advanceTimersByTimeAsync(15_000);
        reporter.ensureActive();
        return outcome;
      },
    );

    await worker().tick();

    expect(repoMock.heartbeat).toHaveBeenCalledWith(5, "me", 60);
    expect(repoMock.finish).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      "[Discogs Import] Lost the lease on Discogs import 5; another worker carries on",
    );
  });

  it("notices a lost lease from a progress write too, and keeps a heartbeat error from failing the run", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    repoMock.heartbeat.mockRejectedValue(new Error("db blip"));
    repoMock.updateProgress.mockResolvedValue(false);
    runnerMock.runDiscogsImport.mockImplementation(
      async (_u: string, reporter: DiscogsImportReporter) => {
        reporter.progress({ found: 1 });
        await vi.advanceTimersByTimeAsync(15_000);
        reporter.ensureActive();
        return outcome;
      },
    );

    await worker().tick();

    expect(console.error).toHaveBeenCalledWith(
      "[Discogs Import] Heartbeat for 5 failed:",
      expect.any(Error),
    );
    expect(repoMock.finish).not.toHaveBeenCalled();
  });

  it("flushes a long burst of lines early and survives a log write failing", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    repoMock.appendLog.mockRejectedValueOnce(new Error("db blip"));
    runnerMock.runDiscogsImport.mockImplementation(
      async (_u: string, reporter: DiscogsImportReporter) => {
        for (let i = 0; i < 250; i += 1) reporter.send(`Found release ID: ${i}\n\n`);
        return outcome;
      },
    );

    await worker().tick();

    expect(repoMock.appendLog.mock.calls[0][1]).toHaveLength(200);
    expect(console.error).toHaveBeenCalledWith(
      "[Discogs Import] Could not record progress of 5:",
      expect.any(Error),
    );
    expect(repoMock.finish).toHaveBeenCalledWith(5, "me", "completed", null);
  });

  it("finishes even when pruning old imports fails", async () => {
    repoMock.claimNext.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    repoMock.prune.mockRejectedValue(new Error("locked"));
    runnerMock.runDiscogsImport.mockResolvedValue(outcome);
    await expect(worker().tick()).resolves.toBe(1);
  });

  it("drains the queue one import at a time, and a second tick while busy does nothing", async () => {
    let release: () => void = () => {};
    repoMock.claimNext
      .mockResolvedValueOnce(row({ id: 1 }))
      .mockResolvedValueOnce(row({ id: 2 }))
      .mockResolvedValueOnce(null);
    runnerMock.runDiscogsImport
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(outcome))))
      .mockResolvedValueOnce(outcome);
    const w = worker();

    const first = w.tick();
    await vi.waitFor(() => expect(runnerMock.runDiscogsImport).toHaveBeenCalledTimes(1));
    expect(await w.tick()).toBe(0);
    release();

    expect(await first).toBe(2);
    expect(repoMock.finish.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(w.owner).toBe("me");
  });
});

describe("startDiscogsImportWorker", () => {
  it("polls once per process however often it is started, and a kick ticks at once", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    repoMock.claimNext.mockResolvedValue(null);

    startDiscogsImportWorker();
    startDiscogsImportWorker();
    await vi.waitFor(() => expect(repoMock.claimNext).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5000);
    expect(repoMock.claimNext).toHaveBeenCalledTimes(2);

    kickDiscogsImportWorker();
    await vi.waitFor(() => expect(repoMock.claimNext).toHaveBeenCalledTimes(3));
    expect(repoMock.claimNext.mock.calls[0][0]).toMatch(/^.+:\d+:[0-9a-f]{8}$/);
  });

  it("logs a tick that throws", async () => {
    repoMock.claimNext.mockRejectedValue(new Error("db down"));
    kickDiscogsImportWorker();
    await vi.waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        "[Discogs Import] Worker tick failed:",
        expect.any(Error),
      ),
    );
  });

  it("exposes the lease error by name", () => {
    expect(new LeaseLostError(3).name).toBe("LeaseLostError");
  });
});
