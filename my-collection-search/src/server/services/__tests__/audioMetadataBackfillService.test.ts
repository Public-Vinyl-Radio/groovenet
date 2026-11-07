import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  const hashes = new Map<string, Record<string, string>>();
  const lists = new Map<string, string[]>();
  const pipeline = () => {
    const ops: Array<() => void> = [];
    const api = {
      hincrby: (k: string, f: string, n: number) => {
        ops.push(() => {
          const h = hashes.get(k) ?? {};
          h[f] = String(parseInt(h[f] ?? "0", 10) + n);
          hashes.set(k, h);
        });
        return api;
      },
      hset: (k: string, f: string | Record<string, string>, v?: string) => {
        ops.push(() => {
          hashes.set(k, { ...(hashes.get(k) ?? {}), ...(typeof f === "string" ? { [f]: v! } : f) });
        });
        return api;
      },
      rpush: (k: string, v: string) => {
        ops.push(() => lists.set(k, [...(lists.get(k) ?? []), v]));
        return api;
      },
      ltrim: () => api,
      expire: () => api,
      exec: async () => {
        ops.forEach((op) => op());
        return [];
      },
    };
    return api;
  };
  return {
    hashes,
    lists,
    multi: pipeline,
    pipeline,
    hgetall: async (k: string) => hashes.get(k) ?? {},
    lrange: async (k: string) => lists.get(k) ?? [],
  };
});
vi.mock("@/lib/redis", () => ({ getRedisConnection: () => redis }));

const repo = vi.hoisted(() => ({
  listAudioBackfillCandidates: vi.fn(),
  updateTrackFields: vi.fn(),
}));
vi.mock("@/server/repositories/trackRepository", () => ({ trackRepository: repo }));

const files = vi.hoisted(() => ({ statSync: vi.fn() }));
vi.mock("fs", () => ({ default: files, ...files }));

const meta = vi.hoisted(() => ({ resolveAudioFilePath: vi.fn(), runFfprobe: vi.fn() }));
vi.mock("@/server/services/trackAudioMetadataService", () => ({
  trackAudioMetadataService: meta,
  audioFieldsFromProbe: () => ({ audio_codec: "aac", audio_lossless: false }),
}));

import { AudioMetadataBackfillService } from "../audioMetadataBackfillService";

const AAC = (tags: Record<string, string> = {}, codec = "aac") => ({
  streams: [{ codec_type: "audio", codec_name: codec }],
  format: { format_name: "mov,mp4,m4a", tags },
});

const cand = (id: string, extra = {}) => ({
  track_id: id,
  friend_id: 1,
  local_audio_url: `${id}.m4a`,
  audio_source: null,
  audio_probed_at: null,
  ...extra,
});

let service: AudioMetadataBackfillService;
beforeEach(() => {
  vi.clearAllMocks();
  redis.hashes.clear();
  redis.lists.clear();
  process.env.AUDIO_BACKFILL_DELAY_MS = "0";
  meta.resolveAudioFilePath.mockImplementation((f: string) => `/audio/${f}`);
  meta.runFfprobe.mockResolvedValue(AAC({ apID: "x" }));
  files.statSync.mockReturnValue({ mtimeMs: 1000 });
  repo.updateTrackFields.mockResolvedValue({});
  service = new AudioMetadataBackfillService();
});

async function runAll(candidates: ReturnType<typeof cand>[], force = false) {
  repo.listAudioBackfillCandidates.mockResolvedValue(candidates);
  const started = await service.start({ force });
  // `start` runs in the background; wait for the counters to settle.
  await vi.waitFor(async () => expect((await service.getRun(started.run_id))?.complete).toBe(true));
  return (await service.getRun(started.run_id))!;
}

describe("AudioMetadataBackfillService", () => {
  it("probes, classifies and stores each track, counting sources", async () => {
    meta.runFfprobe.mockResolvedValueOnce(AAC({ apID: "x" }));
    meta.runFfprobe.mockResolvedValueOnce(AAC({}, "opus"));

    const run = await runAll([cand("a"), cand("b")]);

    expect(run).toMatchObject({ total: 2, probed: 2, skipped: 0, missing_files: 0 });
    expect(run.sources).toMatchObject({ apple_music: 1, unknown: 1 });
    expect(run.weak_youtube_hints).toBe(1);
    expect(repo.updateTrackFields).toHaveBeenCalledWith({
      track_id: "a",
      friend_id: 1,
      audio_codec: "aac",
      audio_lossless: false,
      audio_source: "apple_music",
    });
  });

  it("keeps a source a writer already recorded, but reclassifies unknown", async () => {
    meta.runFfprobe.mockResolvedValue(AAC({ apID: "x" }));
    await runAll([cand("a", { audio_source: "youtube" }), cand("b", { audio_source: "unknown" })]);

    const sources = repo.updateTrackFields.mock.calls.map((c) => c[0].audio_source);
    expect(sources).toEqual(["youtube", "apple_music"]);
  });

  it("skips tracks probed after the file changed unless forced", async () => {
    const probedAt = new Date(5000).toISOString();
    const first = await runAll([cand("a", { audio_probed_at: probedAt })]);
    expect(first).toMatchObject({ probed: 0, skipped: 1 });
    expect(meta.runFfprobe).not.toHaveBeenCalled();

    const forced = await runAll([cand("a", { audio_probed_at: probedAt })], true);
    expect(forced).toMatchObject({ probed: 1, skipped: 0 });
  });

  it("probes again when the file is newer than the last probe", async () => {
    files.statSync.mockReturnValue({ mtimeMs: 9000 });
    const run = await runAll([cand("a", { audio_probed_at: new Date(5000) })]);
    expect(run.probed).toBe(1);
  });

  it("counts missing files and probe failures without stopping", async () => {
    meta.resolveAudioFilePath.mockImplementation((f: string) => (f === "gone.m4a" ? null : f));
    meta.runFfprobe.mockRejectedValueOnce(new Error("Invalid data"));

    const run = await runAll([cand("gone"), cand("bad"), cand("ok")]);

    expect(run).toMatchObject({ missing_files: 1, probe_failures: 1, probed: 1 });
    expect(run.errors).toEqual(["bad: Invalid data"]);
    expect(repo.updateTrackFields).toHaveBeenCalledTimes(1);
  });

  it("stringifies non-Error failures", async () => {
    meta.runFfprobe.mockRejectedValueOnce("plain");
    const run = await runAll([cand("x")]);
    expect(run.errors).toEqual(["x: plain"]);
  });

  it("is complete immediately for an empty library and passes the friend filter", async () => {
    repo.listAudioBackfillCandidates.mockResolvedValue([]);
    const started = await service.start({ friend_id: 4 });
    expect(started).toMatchObject({ total: 0, complete: true });
    expect(repo.listAudioBackfillCandidates).toHaveBeenCalledWith(4);
  });

  it("starts with an empty request", async () => {
    repo.listAudioBackfillCandidates.mockResolvedValue([]);
    await service.start();
    expect(repo.listAudioBackfillCandidates).toHaveBeenCalledWith(undefined);
  });

  it("throttles between probes and tolerates a bad delay setting", async () => {
    process.env.AUDIO_BACKFILL_DELAY_MS = "1";
    expect((await runAll([cand("a")])).probed).toBe(1);
    process.env.AUDIO_BACKFILL_DELAY_MS = "nope";
    expect((await runAll([cand("a")])).probed).toBe(1);
  });

  it("returns null for an unknown run and logs an aborted run", async () => {
    expect(await service.getRun("nope")).toBeNull();

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.listAudioBackfillCandidates.mockResolvedValue([cand("a")]);
    vi.spyOn(service, "execute").mockRejectedValue(new Error("redis down"));
    await service.start();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });
});
