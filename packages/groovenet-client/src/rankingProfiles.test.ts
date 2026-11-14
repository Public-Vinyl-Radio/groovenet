import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({
  default: { create: vi.fn(() => ({ request: requestMock })), isAxiosError: vi.fn(() => false) },
}));

import { GroovenetClient } from "./client.js";

const client = () => new GroovenetClient({ baseUrl: "https://example.test" });
const draft = {
  version: 1 as const,
  name: "Peak",
  surfaces: ["suggestions" as const],
  weights: { bpm_distance: 2 },
};

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({ status: 200, data: { ok: true } });
});

describe("ranking profile methods (#1192)", () => {
  it("lists a library's profiles", async () => {
    expect(await client().listRankingProfiles(3)).toEqual({ ok: true });
    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      url: "/ranking/profiles",
      data: undefined,
      params: { friend_id: 3 },
    });
  });

  it("gets one, escaping the id", async () => {
    await client().getRankingProfile("beatmatcher");
    await client().getRankingProfile("a/b");
    expect(requestMock.mock.calls.map(([config]) => [config.method, config.url])).toEqual([
      ["GET", "/ranking/profiles/beatmatcher"],
      ["GET", "/ranking/profiles/a%2Fb"],
    ]);
  });

  it("creates one", async () => {
    await client().createRankingProfile(3, draft);
    expect(requestMock).toHaveBeenCalledWith({
      method: "POST",
      url: "/ranking/profiles",
      data: { friend_id: 3, profile: draft },
      params: undefined,
    });
  });

  it("copies one, with or without a name", async () => {
    await client().copyRankingProfile("selector", 3);
    await client().copyRankingProfile("17", 3, "Mine");
    expect(
      requestMock.mock.calls.map(([config]) => [config.method, config.url, config.data]),
    ).toEqual([
      ["POST", "/ranking/profiles/selector/copy", { friend_id: 3 }],
      ["POST", "/ranking/profiles/17/copy", { friend_id: 3, name: "Mine" }],
    ]);
  });

  it("updates and deletes one", async () => {
    await client().updateRankingProfile("17", draft);
    await client().deleteRankingProfile("17");
    expect(
      requestMock.mock.calls.map(([config]) => [config.method, config.url, config.data]),
    ).toEqual([
      ["PUT", "/ranking/profiles/17", { profile: draft }],
      ["DELETE", "/ranking/profiles/17", undefined],
    ]);
  });

  it("sets the active profile, on given surfaces or all it applies to", async () => {
    await client().setActiveRankingProfile(3, "beatmatcher");
    await client().setActiveRankingProfile(3, "17", ["related"]);
    expect(
      requestMock.mock.calls.map(([config]) => [config.method, config.url, config.data]),
    ).toEqual([
      ["PUT", "/ranking/active", { friend_id: 3, profile_id: "beatmatcher" }],
      ["PUT", "/ranking/active", { friend_id: 3, profile_id: "17", surfaces: ["related"] }],
    ]);
  });

  it("ranks recommendations with a stored profile", async () => {
    await client().getRecommendationCandidates("seed", 1, { breakdown: true, ranker: "17" });
    expect(requestMock.mock.calls[0][0].params).toEqual({
      track_id: "seed",
      friend_id: 1,
      breakdown: "true",
      ranker: "17",
    });
  });
});
