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
    hincrby: async (k: string, f: string, n: number) => pipeline().hincrby(k, f, n).exec(),
    hgetall: async (k: string) => hashes.get(k) ?? {},
    lrange: async (k: string) => lists.get(k) ?? [],
  };
});
vi.mock("@/lib/redis", () => ({ getRedisConnection: () => redis }));

const repo = vi.hoisted(() => ({
  listEmbeddedTagsCandidates: vi.fn(),
  saveEmbeddedTags: vi.fn(),
}));
vi.mock("@/server/repositories/trackRepository", () => ({ trackRepository: repo }));

const queue = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("@/server/services/embeddingQueueService", () => ({ embeddingQueueService: queue }));

const files = vi.hoisted(() => ({ statSync: vi.fn() }));
vi.mock("fs", () => ({ default: files, ...files }));

const meta = vi.hoisted(() => ({ resolveAudioFilePath: vi.fn(), runFfprobe: vi.fn() }));
vi.mock("@/server/services/trackAudioMetadataService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../trackAudioMetadataService")>();
  return { ...actual, trackAudioMetadataService: meta };
});

import { EMBEDDING_BATCH_SIZE, EmbeddedTagsBackfillService } from "../embeddedTagsBackfillService";

const probe = (tags: Record<string, string> = {}) => ({ format: { tags } });

const cand = (id: string, extra = {}) => ({
  track_id: id,
  friend_id: 1,
  local_audio_url: `${id}.m4a`,
  embedded_tags_read_at: null,
  ...extra,
});

let service: EmbeddedTagsBackfillService;
beforeEach(() => {
  vi.clearAllMocks();
  redis.hashes.clear();
  redis.lists.clear();
  meta.resolveAudioFilePath.mockImplementation((f: string) => `/audio/${f}`);
  meta.runFfprobe.mockResolvedValue(probe({ composer: "A", genre: "House", lyrics: "la" }));
  files.statSync.mockReturnValue({ mtimeMs: 1000 });
  repo.saveEmbeddedTags.mockResolvedValue({ composerFilledFor: [] });
  queue.enqueue.mockResolvedValue(undefined);
  service = new EmbeddedTagsBackfillService();
});

async function runAll(candidates: ReturnType<typeof cand>[], force = false) {
  repo.listEmbeddedTagsCandidates.mockResolvedValue(candidates);
  const started = await service.start({ force });
  await vi.waitFor(async () => expect((await service.getRun(started.run_id))?.complete).toBe(true));
  return (await service.getRun(started.run_id))!;
}

describe("EmbeddedTagsBackfillService", () => {
  it("reads and stores each track, counting which tags the files carried", async () => {
    meta.runFfprobe.mockResolvedValueOnce(probe({ composer: "A", genre: "House", lyrics: "la" }));
    meta.runFfprobe.mockResolvedValueOnce(probe({})); // an instrumental with no tags is not a failure

    const run = await runAll([cand("a"), cand("b")]);

    expect(run).toMatchObject({
      total: 2,
      read: 2,
      with_composer: 1,
      with_genre: 1,
      with_lyrics: 1,
    });
    expect(repo.saveEmbeddedTags).toHaveBeenCalledWith("a", 1, {
      composer: "A",
      genres: ["House"],
      lyrics: "la",
    });
    expect(repo.saveEmbeddedTags).toHaveBeenCalledWith("b", 1, {
      composer: null,
      genres: [],
      lyrics: null,
    });
  });

  it("is idempotent: skips tracks read after the file changed unless forced", async () => {
    const readAt = new Date(5000).toISOString();
    const first = await runAll([cand("a", { embedded_tags_read_at: readAt })]);
    expect(first).toMatchObject({ read: 0, skipped: 1 });
    expect(meta.runFfprobe).not.toHaveBeenCalled();
    expect(repo.saveEmbeddedTags).not.toHaveBeenCalled();

    const forced = await runAll([cand("a", { embedded_tags_read_at: readAt })], true);
    expect(forced).toMatchObject({ read: 1, skipped: 0 });
  });

  it("reads again when the file is newer than the last read", async () => {
    files.statSync.mockReturnValue({ mtimeMs: 9000 });
    const run = await runAll([cand("a", { embedded_tags_read_at: new Date(5000) })]);
    expect(run.read).toBe(1);
  });

  it("counts missing files and failures without stopping", async () => {
    meta.resolveAudioFilePath.mockImplementation((f: string) => (f === "gone.m4a" ? null : f));
    meta.runFfprobe.mockRejectedValueOnce(new Error("Invalid data"));

    const run = await runAll([cand("gone"), cand("bad"), cand("ok")]);

    expect(run).toMatchObject({ missing_files: 1, read_failures: 1, read: 1 });
    expect(run.errors).toEqual(["bad: Invalid data"]);
    expect(repo.saveEmbeddedTags).toHaveBeenCalledTimes(1);
  });

  it("stringifies non-Error failures", async () => {
    meta.runFfprobe.mockRejectedValueOnce("plain");
    expect((await runAll([cand("x")])).errors).toEqual(["x: plain"]);
  });

  it("is complete immediately for an empty library and scopes by friend", async () => {
    repo.listEmbeddedTagsCandidates.mockResolvedValue([]);
    expect(await service.start({ friend_id: 4 })).toMatchObject({ total: 0, complete: true });
    expect(repo.listEmbeddedTagsCandidates).toHaveBeenCalledWith(4);
    await service.start();
    expect(repo.listEmbeddedTagsCandidates).toHaveBeenLastCalledWith(undefined);
  });

  it("returns null for an unknown run and logs an aborted run", async () => {
    expect(await service.getRun("nope")).toBeNull();

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.listEmbeddedTagsCandidates.mockResolvedValue([cand("a")]);
    vi.spyOn(service, "execute").mockRejectedValue(new Error("redis down"));
    await service.start();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });

  it("reads a sparse or damaged hash as zeros and falls back to the requested id", async () => {
    redis.hashes.set("embeddedtags:run:odd", { total: "x", read: "2" });
    expect(await service.getRun("odd")).toMatchObject({
      run_id: "odd",
      total: 0,
      read: 2,
      with_composer: 0,
      errors: [],
    });
  });

  describe("queues embeddings for filled composers (#1169)", () => {
    const filledFor = (ids: string[]) =>
      repo.saveEmbeddedTags.mockImplementation(async (id: string, friendId: number) => ({
        composerFilledFor: ids.includes(id) ? [friendId] : [],
      }));

    it("queues identity and context for exactly the tracks whose composer was filled", async () => {
      filledFor(["a", "c"]);
      const run = await runAll([cand("a"), cand("b"), cand("c")]);

      expect(run).toMatchObject({ read: 3, with_composer: 3, queued_embeddings: 2 });
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(queue.enqueue).toHaveBeenCalledWith(
        [
          { track_id: "a", friend_id: 1, kind: "identity" },
          { track_id: "a", friend_id: 1, kind: "context" },
          { track_id: "c", friend_id: 1, kind: "identity" },
          { track_id: "c", friend_id: 1, kind: "context" },
        ],
        "bulk",
      );
    });

    it("queues nothing when no composer was filled, forced or not", async () => {
      expect((await runAll([cand("a"), cand("b")])).queued_embeddings).toBe(0);
      expect((await runAll([cand("a")], true)).queued_embeddings).toBe(0);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("queues nothing for skipped, missing or failed tracks", async () => {
      filledFor(["skip", "gone", "bad"]);
      meta.resolveAudioFilePath.mockImplementation((f: string) => (f === "gone.m4a" ? null : f));
      meta.runFfprobe.mockRejectedValueOnce(new Error("Invalid data"));
      const run = await runAll([
        cand("skip", { embedded_tags_read_at: new Date(5000).toISOString() }),
        cand("gone"),
        cand("bad"),
      ]);
      expect(run).toMatchObject({ skipped: 1, missing_files: 1, read_failures: 1 });
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it("batches the queue writes instead of one call per track", async () => {
      const ids = Array.from({ length: EMBEDDING_BATCH_SIZE + 5 }, (_, i) => `t${i}`);
      filledFor(ids);
      const run = await runAll(ids.map((id) => cand(id)));

      expect(run.queued_embeddings).toBe(ids.length);
      expect(queue.enqueue).toHaveBeenCalledTimes(2);
      expect(queue.enqueue.mock.calls[0][0]).toHaveLength(EMBEDDING_BATCH_SIZE * 2);
      expect(queue.enqueue.mock.calls[1][0]).toHaveLength(10);
    });

    it("logs a queue failure and still completes the run", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      filledFor(["a"]);
      queue.enqueue.mockRejectedValueOnce(new Error("redis down"));

      const run = await runAll([cand("a"), cand("b")]);

      expect(run).toMatchObject({ read: 2, complete: true, queued_embeddings: 0, errors: [] });
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("failed to queue embeddings for 1 track(s)"),
        expect.any(Error),
      );
    });
  });
});
