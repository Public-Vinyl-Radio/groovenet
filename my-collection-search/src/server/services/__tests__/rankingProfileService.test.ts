import { beforeEach, describe, expect, it } from "vitest";
import type { RankingProfileDraft } from "@groovenet/contracts";
import { DEFAULT_RANKING_CONFIG, RANKING_CONFIGS } from "@/lib/ranking/configs";
import { profileToDraft, RANKING_PRESETS } from "@/lib/ranking/profiles";
import type { RankingProfileRepository } from "@/server/repositories/rankingProfileRepository";
import { FakeRankingProfileRepository } from "@/server/repositories/__tests__/fakeRankingProfileRepository";
import { RankingProfileError, RankingProfileService } from "../rankingProfileService";

let repo: FakeRankingProfileRepository;
let service: RankingProfileService;

const draft = (overrides: Partial<RankingProfileDraft> = {}): RankingProfileDraft => ({
  ...profileToDraft(RANKING_PRESETS.selector, "Warm-up"),
  ...overrides,
});

const rejects = async (promise: Promise<unknown>, status: number, message?: RegExp) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RankingProfileError);
  expect((error as RankingProfileError).status).toBe(status);
  if (message) expect((error as Error).message).toMatch(message);
};

beforeEach(() => {
  repo = new FakeRankingProfileRepository();
  service = new RankingProfileService(repo as unknown as RankingProfileRepository);
});

describe("list", () => {
  it("is the presets and Default everywhere for a new library", async () => {
    const result = await service.list(1);
    expect(result.profiles.map((p) => p.id)).toEqual(["default", "beatmatcher", "selector"]);
    expect(result.active).toEqual({
      suggestions: "default",
      related: "default",
      recommendations: "default",
      playlists: "default",
    });
  });

  it("adds the library's profiles and marks an unreadable one, without failing", async () => {
    await service.create(1, draft());
    await service.create(2, draft({ name: "Theirs" }));
    repo.rows.push({
      id: 50,
      friend_id: 1,
      name: "Broken",
      description: "",
      surfaces: ["suggestions"],
      version: 1,
      config: { weights: { plays: 3 } },
    });
    const { profiles } = await service.list(1);
    expect(profiles.slice(3).map((p) => [p.name, p.invalid ?? false])).toEqual([
      ["Warm-up", false],
      ["Broken", true],
    ]);
  });

  it("reads a choice that can't be used as default", async () => {
    repo.selections.push(
      { friend_id: 1, surface: "suggestions", preset_id: "retired-preset", profile_id: null },
      { friend_id: 1, surface: "related", preset_id: null, profile_id: 99 },
      { friend_id: 1, surface: "search", preset_id: "selector", profile_id: null },
      { friend_id: 1, surface: "recommendations", preset_id: "selector", profile_id: null },
    );
    expect((await service.list(1)).active).toEqual({
      suggestions: "default",
      related: "default",
      recommendations: "selector",
      playlists: "default",
    });
  });
});

describe("create, copy, update and delete", () => {
  it("stores a profile and gets it back", async () => {
    const profile = await service.create(1, draft());
    expect(profile).toMatchObject({ id: "1", kind: "custom", name: "Warm-up" });
    expect(await service.get("1")).toEqual(profile);
    expect(await service.get("selector")).toBe(RANKING_PRESETS.selector);
  });

  it("is a 404 for a missing profile or library", async () => {
    await rejects(service.get("9"), 404);
    await rejects(service.get("not-an-id"), 404);
    await rejects(service.create(77, draft()), 404, /Library 77/);
    await rejects(service.update("9", draft()), 404);
    await rejects(service.update("nope", draft()), 404);
    await rejects(service.remove("9"), 404);
  });

  it("is a 409 past the per-library limit", async () => {
    for (let i = 0; i < 50; i += 1) await service.create(1, draft());
    await rejects(service.create(1, draft()), 409, /50 ranking profiles/);
    await rejects(service.copy("beatmatcher", 1), 409);
  });

  it("rethrows a database error it doesn't know", async () => {
    repo.insert = async () => {
      throw new Error("connection lost");
    };
    await expect(service.create(1, draft())).rejects.toThrow("connection lost");
    repo.setSelections = async () => {
      throw new Error("connection lost");
    };
    await expect(service.setActive(1, "selector")).rejects.toThrow("connection lost");
  });

  it("copies a preset as the library's own, named a copy", async () => {
    const copy = await service.copy("beatmatcher", 2);
    expect(copy).toMatchObject({ kind: "custom", name: "Beatmatcher copy" });
    expect(copy.weights).toEqual(RANKING_PRESETS.beatmatcher.weights);
    expect(copy.constraints).toEqual(RANKING_PRESETS.beatmatcher.constraints);
    expect((await service.copy(copy.id, 2, "Mine")).name).toBe("Mine");
  });

  it("keeps presets read-only", async () => {
    await rejects(service.update("beatmatcher", draft()), 403, /read-only/);
    await rejects(service.remove("default"), 403);
  });

  it("updates a profile and drops its choice where it no longer applies", async () => {
    const { id } = await service.create(1, draft({ surfaces: ["suggestions", "related"] }));
    await service.setActive(1, id);
    const updated = await service.update(id, draft({ name: "Peak", surfaces: ["related"] }));
    expect(updated.name).toBe("Peak");
    expect((await service.list(1)).active).toMatchObject({ suggestions: "default", related: id });
  });

  it("deletes a profile, and its surfaces go back to Default", async () => {
    const { id } = await service.create(1, draft());
    await service.setActive(1, id);
    expect((await service.remove(id)).id).toBe(id);
    expect((await service.list(1)).active.suggestions).toBe("default");
  });
});

describe("setActive", () => {
  it("chooses a preset on every surface by default", async () => {
    const result = await service.setActive(1, "beatmatcher");
    expect(result.active).toEqual({
      suggestions: "beatmatcher",
      related: "beatmatcher",
      recommendations: "beatmatcher",
      playlists: "beatmatcher",
    });
    expect(result.profile.id).toBe("beatmatcher");
  });

  it("chooses a stored profile on the surfaces given", async () => {
    const { id } = await service.create(1, draft());
    const result = await service.setActive(1, id, ["related"]);
    expect(result.active).toMatchObject({ related: id, suggestions: "default" });
  });

  it("is a 400 for a surface the profile doesn't apply to", async () => {
    const { id } = await service.create(1, draft({ surfaces: ["suggestions"] }));
    await rejects(service.setActive(1, id, ["recommendations"]), 400, /recommendations/);
  });

  it("is a 400 for a profile that can't be read", async () => {
    repo.rows.push({
      id: 5,
      friend_id: 1,
      name: "Broken",
      description: "",
      surfaces: ["suggestions"],
      version: 3,
      config: {},
    });
    await rejects(service.setActive(1, "5"), 400, /can't be read/);
  });

  it("is a 404 for a missing library", async () => {
    await rejects(service.setActive(77, "selector"), 404);
  });
});

describe("resolveRanker", () => {
  it("is Default with nothing chosen", async () => {
    const ranker = await service.resolveRanker(undefined, 1, "recommendations");
    expect(ranker).toMatchObject({ id: "default", fallback: false });
    expect(ranker.config).toEqual(DEFAULT_RANKING_CONFIG);
  });

  it("follows the surface's active preset or profile", async () => {
    await service.setActive(1, "selector", ["recommendations"]);
    expect((await service.resolveRanker(undefined, 1, "recommendations")).id).toBe("selector");
    const { id } = await service.create(1, draft({ surfaces: ["recommendations"] }));
    await service.setActive(1, id);
    const ranker = await service.resolveRanker(undefined, 1, "recommendations");
    expect(ranker).toMatchObject({ id, fallback: false });
    expect(ranker.config.id).toBe(id);
  });

  it("falls back when the active profile can't be read", async () => {
    const { id } = await service.create(1, draft({ surfaces: ["recommendations"] }));
    await service.setActive(1, id);
    repo.rows[0].config = { weights: { nope: 1 } };
    const ranker = await service.resolveRanker(undefined, 1, "recommendations");
    expect(ranker).toMatchObject({ id, fallback: true });
    expect(ranker.config).toEqual(DEFAULT_RANKING_CONFIG);
  });

  it("names presets, built-in configs and stored ids", async () => {
    expect((await service.resolveRanker("beatmatcher", 1, "recommendations")).config.id).toBe(
      "beatmatcher",
    );
    const strict = await service.resolveRanker("strict", 1, "recommendations");
    expect(strict).toMatchObject({ id: "strict", fallback: false });
    expect(strict.config).toBe(RANKING_CONFIGS.strict);
    const { id } = await service.create(2, draft());
    expect((await service.resolveRanker(id, 1, "recommendations")).config.id).toBe(id);
  });

  it("is a 400 for an id that names nothing", async () => {
    await rejects(service.resolveRanker("404", 1, "recommendations"), 400, /Unknown ranker/);
    await rejects(service.resolveRanker("fastest", 1, "recommendations"), 400);
  });
});
