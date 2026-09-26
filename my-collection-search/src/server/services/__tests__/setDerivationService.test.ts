import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SET_QUEUE_KEY,
  SetDerivationNotFound,
  SetDerivationQueueError,
  SetDerivationService,
  stalledAfterMs,
} from "../setDerivationService";
import { NoFingerprintEngineError } from "../fingerprintIndexService";
import type { SetDerivationRepository } from "@/server/repositories/setDerivationRepository";
import type {
  PlannedEntry,
  SetDerivationRow,
  SetRecordingRow,
  SetWindow,
} from "@/types/setDerivation";

const SHA = "a".repeat(64);
const recording: SetRecordingRow = {
  sha256: SHA, file_path: `${SHA}.mp3`, original_filename: "set.mp3", format_name: "mp3",
  duration_seconds: 300, size_bytes: 1000, created_at: "2026-09-25T00:00:00Z",
};
const engine = { fingerprint_type: "chromaprint" as const, fingerprint_version: "1" };
const NOW = Date.parse("2026-09-25T12:00:00Z");

function row(overrides: Partial<SetDerivationRow> = {}): SetDerivationRow {
  return {
    id: "d1", recording_sha256: SHA, ...engine, window_seconds: 15, step_seconds: 15,
    status: "queued", error: null, duration_seconds: null, windows: null,
    created_at: "2026-09-25T11:59:00Z", updated_at: "2026-09-25T11:59:00Z", completed_at: null,
    ...overrides,
  };
}

function windowsFor(trackId: string, from: number, count: number): SetWindow[] {
  return Array.from({ length: count }, (_, i) => ({
    start_seconds: from + i * 15,
    duration_seconds: 15,
    candidates: [{ track_id: trackId, friend_id: 1, confidence: 0.9, offset_seconds: i * 15 }],
  }));
}

let repository: Record<keyof SetDerivationRepository, ReturnType<typeof vi.fn>>;
let recordings: { find: ReturnType<typeof vi.fn> };
let engines: { getEngine: ReturnType<typeof vi.fn> };
let redis: { lpush: ReturnType<typeof vi.fn> };
let service: SetDerivationService;

beforeEach(() => {
  repository = {
    create: vi.fn(async (input) => row({ id: "new", ...input })),
    findById: vi.fn(),
    findReusable: vi.fn().mockResolvedValue(null),
    transitionStatus: vi.fn(),
    complete: vi.fn(),
    findTracks: vi.fn().mockResolvedValue([]),
    listPlannedEntries: vi.fn().mockResolvedValue([]),
    listUnindexedOnReleases: vi.fn().mockResolvedValue([]),
    findPlaylistIdForLiveSet: vi.fn(),
    playlistExists: vi.fn().mockResolvedValue(true),
    attachToLiveSet: vi.fn(),
  };
  recordings = { find: vi.fn().mockResolvedValue(recording) };
  engines = { getEngine: vi.fn().mockResolvedValue(engine) };
  redis = { lpush: vi.fn().mockResolvedValue(1) };
  service = new SetDerivationService(
    repository as unknown as SetDerivationRepository,
    recordings as unknown as ConstructorParameters<typeof SetDerivationService>[1],
    engines as unknown as ConstructorParameters<typeof SetDerivationService>[2],
    redis as unknown as ConstructorParameters<typeof SetDerivationService>[3]
  );
});

describe("create", () => {
  it("records a run under the running engine and queues it for the set worker", async () => {
    const { derivation, reused } = await service.create({ recording_sha256: SHA }, NOW);

    expect(reused).toBe(false);
    expect(repository.create).toHaveBeenCalledWith({
      recording_sha256: SHA, ...engine, window_seconds: 15, step_seconds: 15,
    });
    expect(redis.lpush).toHaveBeenCalledWith(
      SET_QUEUE_KEY,
      JSON.stringify({ derivation_id: derivation.id, file_path: `${SHA}.mp3`, window_seconds: 15, step_seconds: 15 })
    );
  });

  it("passes custom window settings through to the job", async () => {
    await service.create({ recording_sha256: SHA, window_seconds: 10, step_seconds: 5 }, NOW);
    expect(JSON.parse(redis.lpush.mock.calls[0][1])).toMatchObject({ window_seconds: 10, step_seconds: 5 });
  });

  it("hands back an equivalent run instead of doing the work twice", async () => {
    const existing = row({ id: "old", status: "processed" });
    repository.findReusable.mockResolvedValue(existing);

    expect(await service.create({ recording_sha256: SHA }, NOW)).toEqual({ derivation: existing, reused: true });
    expect(repository.create).not.toHaveBeenCalled();
    expect(redis.lpush).not.toHaveBeenCalled();
  });

  it("hands back a run still in progress", async () => {
    repository.findReusable.mockResolvedValue(row({ status: "processing" }));
    expect((await service.create({ recording_sha256: SHA }, NOW)).reused).toBe(true);
  });

  it("writes off a run stuck past the stall window and starts a new one", async () => {
    const stale = row({ id: "stuck", updated_at: new Date(NOW - stalledAfterMs() - 1).toISOString() });
    repository.findReusable.mockResolvedValue(stale);

    const { derivation, reused } = await service.create({ recording_sha256: SHA }, NOW);

    expect(repository.transitionStatus).toHaveBeenCalledWith(
      "stuck", "failed", ["queued", "processing"], "stalled: no result from the worker"
    );
    expect(reused).toBe(false);
    expect(derivation.id).toBe("new");
  });

  it("starts a fresh run when forced", async () => {
    await service.create({ recording_sha256: SHA, force: true }, NOW);
    expect(repository.findReusable).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalled();
  });

  it("refuses an unknown recording", async () => {
    recordings.find.mockResolvedValue(null);
    await expect(service.create({ recording_sha256: SHA }, NOW)).rejects.toBeInstanceOf(SetDerivationNotFound);
  });

  it("refuses when no engine is advertised", async () => {
    engines.getEngine.mockResolvedValue(null);
    await expect(service.create({ recording_sha256: SHA }, NOW)).rejects.toBeInstanceOf(NoFingerprintEngineError);
  });

  it("fails the run and says so when the queue is unreachable", async () => {
    redis.lpush.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(service.create({ recording_sha256: SHA }, NOW)).rejects.toBeInstanceOf(SetDerivationQueueError);
    expect(repository.transitionStatus).toHaveBeenCalledWith("new", "failed", ["queued"], "could not be queued");
  });

  it("lists the recording in a live set's media when asked", async () => {
    await service.create({ recording_sha256: SHA, live_set_id: 7 }, NOW);
    expect(repository.attachToLiveSet).toHaveBeenCalledWith(7, `/api/set-recordings/${SHA}`, "set.mp3");
  });

  it("uses the stall window from the environment", () => {
    vi.stubEnv("SET_DERIVATION_STALL_MINUTES", "5");
    expect(stalledAfterMs()).toBe(300_000);
    vi.stubEnv("SET_DERIVATION_STALL_MINUTES", "nope");
    expect(stalledAfterMs()).toBe(1_800_000);
    vi.unstubAllEnvs();
  });
});

describe("claim", () => {
  it("moves a queued run to processing", async () => {
    repository.transitionStatus.mockResolvedValue(row({ status: "processing" }));
    expect((await service.claim("d1")).status).toBe("processing");
    expect(repository.transitionStatus).toHaveBeenCalledWith("d1", "processing", ["queued"]);
  });

  it("returns a run it could not claim as it stands", async () => {
    repository.transitionStatus.mockResolvedValue(null);
    repository.findById.mockResolvedValue(row({ status: "processed" }));
    expect((await service.claim("d1")).status).toBe("processed");
  });

  it("refuses an unknown run", async () => {
    repository.transitionStatus.mockResolvedValue(null);
    repository.findById.mockResolvedValue(null);
    await expect(service.claim("nope")).rejects.toBeInstanceOf(SetDerivationNotFound);
  });
});

describe("report", () => {
  const windows = windowsFor("1-A1", 0, 2);

  it("stores a processed result's windows", async () => {
    repository.complete.mockResolvedValue(row({ status: "processed" }));
    await service.report({ derivation_id: "d1", status: "processed", duration_seconds: 30, windows });
    expect(repository.complete).toHaveBeenCalledWith("d1", {
      status: "processed", error: null, duration_seconds: 30, windows,
    });
  });

  it("stores a failure with its reason and no windows", async () => {
    repository.complete.mockResolvedValue(row({ status: "failed" }));
    await service.report({ derivation_id: "d1", status: "failed", error: "moov atom not found", windows });
    expect(repository.complete).toHaveBeenCalledWith("d1", {
      status: "failed", error: "moov atom not found", duration_seconds: null, windows: [],
    });
  });

  it("gives a failure without a reason one", async () => {
    repository.complete.mockResolvedValue(row({ status: "failed" }));
    await service.report({ derivation_id: "d1", status: "failed", windows: [] });
    expect(repository.complete.mock.calls[0][1].error).toBe("failed without a reason");
  });

  it("ignores a late duplicate for a run already closed", async () => {
    repository.complete.mockResolvedValue(null);
    repository.findById.mockResolvedValue(row({ status: "processed" }));
    expect((await service.report({ derivation_id: "d1", status: "failed", windows: [] })).status).toBe("processed");
  });

  it("refuses an unknown run", async () => {
    repository.complete.mockResolvedValue(null);
    repository.findById.mockResolvedValue(null);
    await expect(service.report({ derivation_id: "x", status: "processed", windows: [] })).rejects.toBeInstanceOf(
      SetDerivationNotFound
    );
  });
});

describe("view", () => {
  const processed = row({
    status: "processed",
    duration_seconds: 300,
    windows: [...windowsFor("10-A1", 0, 4), ...windowsFor("11-A6", 150, 4)],
  });
  const tracks = [
    { track_id: "10-A1", friend_id: 1, title: "First", artist: "a", release_id: "10", position: "A1" },
    { track_id: "11-A6", friend_id: 1, title: "Lovetripper", artist: "Cuco", release_id: "11", position: "A6" },
  ];
  const plan: PlannedEntry[] = [
    { ...tracks[0], index: 0, fingerprinted: true },
    { track_id: "11-A5", friend_id: 1, title: "Feelings", artist: "Cuco", release_id: "11", position: "A5", index: 1, fingerprinted: true },
  ];

  beforeEach(() => {
    repository.findById.mockResolvedValue(processed);
    repository.findTracks.mockResolvedValue(tracks);
  });

  it("returns a tracklist with each play's track resolved", async () => {
    const view = await service.view("d1");

    expect(view.tracklist.map((p) => [p.track_id, p.start_seconds, p.end_seconds, p.track?.title])).toEqual([
      ["10-A1", 0, 60, "First"],
      ["11-A6", 150, 210, "Lovetripper"],
    ]);
    expect(view.summary).toEqual({
      plays: 2, duration_seconds: 300, identified_seconds: 120, identified_fraction: 0.4,
    });
    expect(view.diff).toBeNull();
    expect(view.derivation).not.toHaveProperty("windows");
  });

  it("lists unidentified stretches with the unindexed tracks on neighbouring releases", async () => {
    const sibling = { track_id: "10-A2", friend_id: 1, title: "Unindexed", artist: "a", release_id: "10", position: "A2" };
    repository.listUnindexedOnReleases.mockResolvedValue([sibling]);

    const view = await service.view("d1");

    expect(repository.listUnindexedOnReleases).toHaveBeenCalledWith(["10", "11"], engine);
    expect(view.unidentified).toEqual([
      { start_seconds: 60, end_seconds: 150, unindexed_neighbours: [sibling] },
      { start_seconds: 210, end_seconds: 300, unindexed_neighbours: [] },
    ]);
  });

  it("diffs against a playlist when given one", async () => {
    repository.listPlannedEntries.mockResolvedValue(plan);

    const view = await service.view("d1", { playlist_id: 176 });

    expect(repository.listPlannedEntries).toHaveBeenCalledWith(176, engine);
    expect(view.diff?.played_instead_of).toEqual([{ play: 1, planned: plan[1] }]);
  });

  it("diffs against a live set's playlist", async () => {
    repository.findPlaylistIdForLiveSet.mockResolvedValue(176);
    repository.listPlannedEntries.mockResolvedValue(plan);
    expect((await service.view("d1", { live_set_id: 3 })).diff?.playlist_id).toBe(176);
  });

  it("refuses an unknown playlist or live set", async () => {
    repository.playlistExists.mockResolvedValue(false);
    await expect(service.view("d1", { playlist_id: 9 })).rejects.toThrow("no playlist 9");
    repository.findPlaylistIdForLiveSet.mockResolvedValue(null);
    await expect(service.view("d1", { live_set_id: 9 })).rejects.toThrow("no live set 9");
  });

  it("returns an unfinished run with nothing to show yet", async () => {
    repository.findById.mockResolvedValue(row({ status: "processing" }));
    const view = await service.view("d1", {});
    expect(view).toMatchObject({ summary: null, tracklist: [], unidentified: [], diff: null });
    expect(repository.findTracks).not.toHaveBeenCalled();
  });

  it("falls back to the recording's duration, and copes with neither", async () => {
    repository.findById.mockResolvedValue({ ...processed, duration_seconds: null });
    expect((await service.view("d1")).summary?.duration_seconds).toBe(300);

    recordings.find.mockResolvedValue({ ...recording, duration_seconds: null });
    const view = await service.view("d1");
    expect(view.summary?.identified_fraction).toBeNull();
    expect(view.unidentified).toEqual([]);
  });

  it("keeps a play whose track has since been deleted, unresolved", async () => {
    repository.findTracks.mockResolvedValue([]);
    const view = await service.view("d1");
    expect(view.tracklist[0].track).toBeNull();
  });

  it("refuses an unknown run or recording", async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.view("x")).rejects.toThrow("no derivation x");
    repository.findById.mockResolvedValue(processed);
    recordings.find.mockResolvedValue(null);
    await expect(service.view("d1")).rejects.toThrow(`no recording ${SHA}`);
  });
});
