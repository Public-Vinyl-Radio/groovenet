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
  listIsrcCandidates: vi.fn(),
  saveIsrcs: vi.fn(),
  clearIsrc: vi.fn(),
}));
vi.mock("@/server/repositories/trackRepository", () => ({ trackRepository: repo }));

const apple = vi.hoisted(() => ({ fetchIsrcs: vi.fn(), assertConfigured: vi.fn() }));
vi.mock("@/server/services/appleMusicCatalogService", () => ({
  appleMusicCatalogService: apple,
}));

import { IsrcService } from "../isrcService";

const link = (songId: string, storefront = "us") =>
  `https://music.apple.com/${storefront}/album/x/1?i=${songId}`;

const cand = (id: string, extra = {}) => ({
  track_id: id,
  friend_id: 1,
  apple_music_url: link(`song-${id}`.replace(/\D/g, "") || "1"),
  isrc: null,
  isrc_checked_at: null,
  ...extra,
});

/** Candidates whose song id is the number in their track id. */
const numbered = (n: number, extra = {}) =>
  cand(`t${n}`, { apple_music_url: link(String(n)), ...extra });

let service: IsrcService;
beforeEach(() => {
  vi.clearAllMocks();
  redis.hashes.clear();
  redis.lists.clear();
  repo.saveIsrcs.mockResolvedValue(undefined);
  repo.clearIsrc.mockResolvedValue(undefined);
  apple.fetchIsrcs.mockImplementation(async (ids: string[]) => {
    return new Map(ids.map((id) => [id, `USAB1${id.padStart(7, "0")}`]));
  });
  service = new IsrcService();
});

async function runAll(candidates: ReturnType<typeof cand>[], request = {}) {
  repo.listIsrcCandidates.mockResolvedValue(candidates);
  const started = await service.start(request);
  await vi.waitFor(async () => expect((await service.getRun(started.run_id))?.complete).toBe(true));
  return (await service.getRun(started.run_id))!;
}

describe("IsrcService backfill", () => {
  it("resolves and stores each track in one batch", async () => {
    const run = await runAll([numbered(1), numbered(2)]);
    expect(run).toMatchObject({ total: 2, filled: 2, skipped: 0, no_link: 0, dry_run: false });
    expect(apple.fetchIsrcs).toHaveBeenCalledTimes(1);
    expect(apple.fetchIsrcs).toHaveBeenCalledWith(["1", "2"], "us");
    expect(repo.saveIsrcs).toHaveBeenCalledWith([
      { track_id: "t1", friend_id: 1, isrc: "USAB10000001" },
      { track_id: "t2", friend_id: 1, isrc: "USAB10000002" },
    ]);
  });

  it("classifies tracks without a usable link and tracks already resolved", async () => {
    const run = await runAll([
      numbered(1),
      cand("nolink", { apple_music_url: null }),
      cand("album", { apple_music_url: "https://music.apple.com/us/album/x/5" }),
      numbered(2, { isrc: "USAB10000002" }),
      numbered(3, { isrc_checked_at: new Date() }),
    ]);
    expect(run).toMatchObject({ total: 5, filled: 1, no_link: 2, skipped: 2 });
    expect(apple.fetchIsrcs).toHaveBeenCalledWith(["1"], "us");
  });

  it("does no work on a second run once everything is stamped", async () => {
    const stamped = [numbered(1, { isrc: "USAB10000001" }), numbered(2, { isrc_checked_at: 1 })];
    const run = await runAll(stamped);
    expect(run).toMatchObject({ skipped: 2, filled: 0 });
    expect(apple.fetchIsrcs).not.toHaveBeenCalled();
    expect(repo.saveIsrcs).not.toHaveBeenCalled();
  });

  it("asks again for resolved tracks with force", async () => {
    const run = await runAll([numbered(1, { isrc: "USAB10000001" })], { force: true });
    expect(run).toMatchObject({ filled: 1, skipped: 0 });
  });

  it("counts a song Apple has no ISRC for as not found, and still stamps it", async () => {
    apple.fetchIsrcs.mockResolvedValue(
      new Map([
        ["1", null],
        ["2", "USAB10000002"],
      ]),
    );
    const run = await runAll([numbered(1), numbered(2)]);
    expect(run).toMatchObject({ filled: 1, not_found: 1 });
    expect(repo.saveIsrcs).toHaveBeenCalledWith(
      expect.arrayContaining([{ track_id: "t1", friend_id: 1, isrc: null }]),
    );
  });

  it("treats an id missing from Apple's answer as not found", async () => {
    apple.fetchIsrcs.mockResolvedValue(new Map());
    expect(await runAll([numbered(1)])).toMatchObject({ not_found: 1 });
  });

  it("honours limit", async () => {
    const run = await runAll([numbered(1), numbered(2), numbered(3)], { limit: 2 });
    expect(run).toMatchObject({ total: 2, filled: 2 });
    expect(apple.fetchIsrcs).toHaveBeenCalledWith(["1", "2"], "us");
  });

  it("stores nothing on a dry run but reports what it would fill", async () => {
    const run = await runAll([numbered(1)], { dry_run: true });
    expect(run).toMatchObject({ filled: 1, dry_run: true });
    expect(repo.saveIsrcs).not.toHaveBeenCalled();
  });

  it("groups by storefront and chunks at 100 songs", async () => {
    const many = Array.from({ length: 101 }, (_, i) => numbered(i + 1));
    const run = await runAll([...many, cand("fr", { apple_music_url: link("500", "fr") })]);
    expect(run.filled).toBe(102);
    const calls = apple.fetchIsrcs.mock.calls.map(([ids, store]) => [ids.length, store]);
    expect(calls).toEqual([
      [100, "us"],
      [1, "us"],
      [1, "fr"],
    ]);
  });

  it("fails a batch without stamping it, records the error, and carries on", async () => {
    apple.fetchIsrcs.mockRejectedValueOnce(new Error("Apple Music API 429"));
    const many = [numbered(1), numbered(2)];
    repo.listIsrcCandidates.mockResolvedValue([
      ...many,
      cand("fr", { apple_music_url: link("500", "fr") }),
    ]);
    const started = await service.start();
    await vi.waitFor(async () =>
      expect((await service.getRun(started.run_id))?.complete).toBe(true),
    );
    const run = (await service.getRun(started.run_id))!;
    expect(run).toMatchObject({ failed: 2, filled: 1 });
    expect(run.errors).toEqual(["t1+1: Apple Music API 429"]);
    expect(repo.saveIsrcs).toHaveBeenCalledTimes(1);
  });

  it("fails the batch when the write fails, and stringifies non-Error failures", async () => {
    repo.saveIsrcs.mockRejectedValueOnce("disk full");
    const run = await runAll([numbered(1)]);
    expect(run).toMatchObject({ failed: 1, filled: 0 });
    expect(run.errors).toEqual(["t1+0: disk full"]);
  });

  it("fails fast when Apple credentials are missing", async () => {
    apple.assertConfigured.mockImplementationOnce(() => {
      throw new Error("Missing Apple Music credentials");
    });
    await expect(service.start()).rejects.toThrow(/Missing Apple Music/);
    expect(repo.listIsrcCandidates).not.toHaveBeenCalled();
  });

  it("is complete immediately when nothing needs resolving and scopes by friend", async () => {
    repo.listIsrcCandidates.mockResolvedValue([cand("a", { apple_music_url: null })]);
    expect(await service.start({ friend_id: 4 })).toMatchObject({
      total: 1,
      no_link: 1,
      complete: true,
    });
    expect(repo.listIsrcCandidates).toHaveBeenCalledWith(4);
    await service.start();
    expect(repo.listIsrcCandidates).toHaveBeenLastCalledWith(undefined);
  });

  it("returns null for an unknown run and logs an aborted run", async () => {
    expect(await service.getRun("nope")).toBeNull();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.listIsrcCandidates.mockResolvedValue([numbered(1)]);
    vi.spyOn(service, "execute").mockRejectedValue(new Error("redis down"));
    await service.start();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
  });

  it("reads a sparse or damaged hash as zeros and falls back to the requested id", async () => {
    redis.hashes.set("isrc:run:odd", { total: "x", filled: "2" });
    expect(await service.getRun("odd")).toMatchObject({
      run_id: "odd",
      total: 0,
      filled: 2,
      dry_run: false,
      errors: [],
    });
  });
});

describe("IsrcService.syncForLinkChange", () => {
  const track = { track_id: "t1", friend_id: 1, apple_music_url: link("42") };

  it("clears the stale ISRC then stores the one Apple returns", async () => {
    await service.syncForLinkChange(track);
    expect(repo.clearIsrc).toHaveBeenCalledWith("t1", 1);
    expect(apple.fetchIsrcs).toHaveBeenCalledWith(["42"], "us");
    expect(repo.saveIsrcs).toHaveBeenCalledWith([
      { track_id: "t1", friend_id: 1, isrc: "USAB10000042" },
    ]);
  });

  it("uses the ISRC the caller already has, normalised, without asking Apple", async () => {
    await service.syncForLinkChange(track, "us-ab1-18-00123");
    expect(apple.fetchIsrcs).not.toHaveBeenCalled();
    expect(repo.saveIsrcs).toHaveBeenCalledWith([
      { track_id: "t1", friend_id: 1, isrc: "USAB11800123" },
    ]);
  });

  it("stamps the track as checked when Apple has no ISRC", async () => {
    apple.fetchIsrcs.mockResolvedValue(new Map());
    await service.syncForLinkChange(track);
    expect(repo.saveIsrcs).toHaveBeenCalledWith([{ track_id: "t1", friend_id: 1, isrc: null }]);
  });

  it("only clears when the link was removed or names no song", async () => {
    await service.syncForLinkChange({ ...track, apple_music_url: null });
    await service.syncForLinkChange({
      ...track,
      apple_music_url: "https://music.apple.com/us/album/x/5",
    });
    expect(repo.clearIsrc).toHaveBeenCalledTimes(2);
    expect(repo.saveIsrcs).not.toHaveBeenCalled();
  });

  it("never throws: a failed lookup leaves the ISRC for the backfill", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    apple.fetchIsrcs.mockRejectedValue(new Error("down"));
    await expect(service.syncForLinkChange(track)).resolves.toBeUndefined();
    expect(repo.saveIsrcs).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
