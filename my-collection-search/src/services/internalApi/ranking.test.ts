import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportRankingProfile,
  importRankingProfile,
  useFriendRankingProfile,
  copyRankingProfile,
  createRankingProfile,
  deleteRankingProfile,
  fetchRankingPreview,
  fetchRankingProfiles,
  setActiveRankingProfile,
  updateRankingProfile,
} from "./ranking";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":true}' });
  vi.stubGlobal("fetch", fetchMock);
});
const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => [
    url,
    init?.method ?? "GET",
    init?.body ? JSON.parse(init.body) : undefined,
  ]);
const draft = { version: 1 as const, name: "Mine", surfaces: ["related" as const], weights: {} };

describe("ranking internal API", () => {
  it("sends every profile request", async () => {
    await fetchRankingProfiles(4);
    await createRankingProfile(4, draft);
    await copyRankingProfile("beatmatcher", 4);
    await updateRankingProfile("a/b", draft);
    await deleteRankingProfile("7");
    await setActiveRankingProfile({ friend_id: 4, profile_id: "selector", surfaces: ["related"] });
    expect(calls()).toEqual([
      ["/api/ranking/profiles?friend_id=4", "GET", undefined],
      ["/api/ranking/profiles", "POST", { friend_id: 4, profile: draft }],
      ["/api/ranking/profiles/beatmatcher/copy", "POST", { friend_id: 4 }],
      ["/api/ranking/profiles/a%2Fb", "PUT", { profile: draft }],
      ["/api/ranking/profiles/7", "DELETE", undefined],
      [
        "/api/ranking/active",
        "PUT",
        { friend_id: 4, profile_id: "selector", surfaces: ["related"] },
      ],
    ]);
  });

  it("previews a seed with a whole config", async () => {
    const config = { version: 1 as const, id: "7", weights: {}, usePrior: false, constraints: {} };
    await fetchRankingPreview({ track_id: "t", friend_id: 4 }, config, 10);
    expect(calls()[0]).toEqual([
      "/api/recommendations/candidates",
      "POST",
      {
        tracks: [{ track_id: "t", friend_id: 4 }],
        limit_identity: 10,
        limit_audio: 10,
        breakdown: true,
        ranking_config: config,
      },
    ]);
  });
});

it("sends sharing requests with escaped ids", async () => {
  await exportRankingProfile("a/b");
  await importRankingProfile(3, "file");
  await useFriendRankingProfile("a/b", 3, 4);
  expect(calls()).toEqual([
    ["/api/ranking/profiles/a%2Fb/export", "GET", undefined],
    ["/api/ranking/profiles/import", "POST", { friend_id: 3, file: "file" }],
    ["/api/ranking/profiles/a%2Fb/use-friend", "POST", { friend_id: 3, source_friend_id: 4 }],
  ]);
});
