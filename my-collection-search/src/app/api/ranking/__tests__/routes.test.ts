/** Every ranking profile endpoint (#1192), over the real service and an in-memory repository. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { profileToDraft, RANKING_PRESETS } from "@/lib/ranking/profiles";
import { setAnalyticsProvider } from "@/lib/analytics/server";
import { MemoryAnalyticsProvider } from "@/lib/analytics/providers/memory";
import type { FakeRankingProfileRepository } from "@/server/repositories/__tests__/fakeRankingProfileRepository";

vi.mock("@/server/repositories/rankingProfileRepository", async () => {
  const { FakeRankingProfileRepository } =
    await import("@/server/repositories/__tests__/fakeRankingProfileRepository");
  return { rankingProfileRepository: new FakeRankingProfileRepository() };
});

import { rankingProfileRepository } from "@/server/repositories/rankingProfileRepository";
import * as profiles from "../profiles/route";
import * as profile from "../profiles/[id]/route";
import * as copy from "../profiles/[id]/copy/route";
import * as active from "../active/route";

const repo = rankingProfileRepository as unknown as FakeRankingProfileRepository;
const events = new MemoryAnalyticsProvider();
setAnalyticsProvider(events);

const url = (path: string) => `http://localhost/api/ranking${path}`;
const request = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(url(path), {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const draft = (overrides: Record<string, unknown> = {}) => ({
  ...profileToDraft(RANKING_PRESETS.beatmatcher, "Peak time"),
  ...overrides,
});
const create = async (body: unknown = { friend_id: 1, profile: draft() }) =>
  profiles.POST(request("/profiles", "POST", body));
const tracked = () => events.events.map((e) => [e.event, e.properties]);

beforeEach(() => {
  repo.reset();
  events.reset();
});

describe("GET /api/ranking/profiles", () => {
  it("lists presets and the library's profiles, with the active ones", async () => {
    await create();
    const res = await profiles.GET(request("/profiles?friend_id=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles.map((p: { id: string }) => p.id)).toEqual([
      "default",
      "beatmatcher",
      "selector",
      "1",
    ]);
    expect(body.active.suggestions).toBe("default");
  });

  it.each(["", "?friend_id=abc"])("is a 400 without a friend id: %s", async (query) => {
    const res = await profiles.GET(request(`/profiles${query}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("friend_id is required");
  });

  it("is a 500 when storage fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const original = repo.listByFriend;
    repo.listByFriend = async () => {
      throw new Error("down");
    };
    const res = await profiles.GET(request("/profiles?friend_id=1"));
    repo.listByFriend = original;
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Failed to list ranking profiles");
    spy.mockRestore();
  });
});

describe("POST /api/ranking/profiles", () => {
  it("stores a profile and records the edit", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "1", kind: "custom", name: "Peak time" });
    expect(tracked()).toEqual([
      [
        "ranking_profile_edited",
        { action: "created", profile: "custom", from: "custom", source: "web" },
      ],
    ]);
  });

  it.each([
    ["not JSON", "{", "Invalid JSON body"],
    ["no profile", { friend_id: 1 }, "Invalid ranking profile"],
    ["a huge weight", { friend_id: 1, profile: draft({ weights: { rating: 1e12 } }) }, null],
    ["an unknown signal", { friend_id: 1, profile: draft({ weights: { plays: 1 } }) }, null],
    ["an extra field", { friend_id: 1, profile: draft({ script: "alert(1)" }) }, null],
    [
      "a deep object",
      { friend_id: 1, profile: draft({ constraints: { bpm_window: { a: { b: { c: {} } } } } }) },
      null,
    ],
    [
      "a bad energy range",
      {
        friend_id: 1,
        profile: draft({ constraints: { energy_range: { max_drop: 2, max_rise: 0 } } }),
      },
      null,
    ],
    ["a long name", { friend_id: 1, profile: draft({ name: "x".repeat(81) }) }, null],
    ["an id", { friend_id: 1, profile: { ...draft(), id: "4" } }, null],
  ])("is a 400 for %s", async (_label, body, message) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(message ?? "Invalid ranking profile");
    expect(repo.rows).toHaveLength(0);
    expect(events.events).toHaveLength(0);
  });

  it("is a 404 for a library that doesn't exist", async () => {
    const res = await create({ friend_id: 99, profile: draft() });
    expect(res.status).toBe(404);
  });
});

describe("GET, PUT and DELETE /api/ranking/profiles/{id}", () => {
  it("gets a preset or a stored profile", async () => {
    await create();
    expect(
      await (await profile.GET(request("/profiles/selector"), params("selector"))).json(),
    ).toMatchObject({ id: "selector", kind: "preset" });
    expect((await profile.GET(request("/profiles/1"), params("1"))).status).toBe(200);
    expect((await profile.GET(request("/profiles/8"), params("8"))).status).toBe(404);
  });

  it("lists and gets an unreadable stored profile as Default, never an error", async () => {
    repo.rows.push({
      id: 3,
      friend_id: 1,
      name: "Old",
      description: "",
      surfaces: ["suggestions"],
      version: 1,
      config: { weights: { bpm_distance: "fast" } },
    });
    const res = await profile.GET(request("/profiles/3"), params("3"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "3",
      invalid: true,
      weights: RANKING_PRESETS.default.weights,
    });
  });

  it("replaces a stored profile", async () => {
    await create();
    const res = await profile.PUT(
      request("/profiles/1", "PUT", { profile: draft({ name: "Closing" }) }),
      params("1"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Closing");
    expect(tracked().at(-1)).toEqual([
      "ranking_profile_edited",
      { action: "updated", profile: "custom", from: "custom", source: "web" },
    ]);
  });

  it.each([
    ["not JSON", "nope", 400],
    ["an invalid profile", { profile: draft({ surfaces: [] }) }, 400],
    ["an extra key", { profile: draft(), friend_id: 1 }, 400],
  ])("is a 400 to update with %s", async (_label, body, status) => {
    await create();
    const res = await profile.PUT(request("/profiles/1", "PUT", body), params("1"));
    expect(res.status).toBe(status);
  });

  it("is a 403 for a preset and a 404 for a missing profile", async () => {
    const body = { profile: draft() };
    expect((await profile.PUT(request("/x", "PUT", body), params("default"))).status).toBe(403);
    expect((await profile.PUT(request("/x", "PUT", body), params("12"))).status).toBe(404);
    expect((await profile.DELETE(request("/x", "DELETE"), params("selector"))).status).toBe(403);
    expect((await profile.DELETE(request("/x", "DELETE"), params("12"))).status).toBe(404);
  });

  it("deletes a stored profile", async () => {
    await create();
    const res = await profile.DELETE(request("/profiles/1", "DELETE"), params("1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, id: "1" });
    expect(repo.rows).toHaveLength(0);
    expect(tracked().at(-1)?.[1]).toMatchObject({ action: "deleted" });
  });
});

describe("POST /api/ranking/profiles/{id}/copy", () => {
  it("copies a preset and records which", async () => {
    const res = await copy.POST(
      request("/profiles/selector/copy", "POST", { friend_id: 2 }),
      params("selector"),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: "Selector copy", kind: "custom" });
    expect(tracked()).toEqual([
      [
        "ranking_profile_edited",
        { action: "copied", profile: "custom", from: "selector", source: "web" },
      ],
    ]);
  });

  it("copies a stored profile under a new name, recorded as custom", async () => {
    await create();
    events.reset();
    const res = await copy.POST(
      request("/profiles/1/copy", "POST", { friend_id: 1, name: "Mine" }),
      params("1"),
    );
    expect((await res.json()).name).toBe("Mine");
    expect(tracked()[0][1]).toMatchObject({ from: "custom" });
  });

  it.each([
    ["not JSON", "x", 400],
    ["no friend", {}, 400],
    ["an empty name", { friend_id: 1, name: " " }, 400],
  ])("is a 400 for %s", async (_label, body, status) => {
    const res = await copy.POST(request("/profiles/default/copy", "POST", body), params("default"));
    expect(res.status).toBe(status);
  });

  it("is a 404 for a missing source", async () => {
    const res = await copy.POST(request("/x", "POST", { friend_id: 1 }), params("30"));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/ranking/active", () => {
  const choose = (body: unknown) => active.PUT(request("/active", "PUT", body));

  it("chooses a preset per surface and records it by id", async () => {
    const res = await choose({
      friend_id: 1,
      profile_id: "beatmatcher",
      surfaces: ["suggestions"],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      friend_id: 1,
      active: {
        suggestions: "beatmatcher",
        related: "default",
        recommendations: "default",
        playlists: "default",
      },
    });
    expect(tracked()).toEqual([
      [
        "ranking_profile_chosen",
        { profile: "beatmatcher", surfaces: ["suggestions"], source: "web" },
      ],
    ]);
  });

  it("chooses a stored profile on every surface it applies to, recorded as custom", async () => {
    await create({ friend_id: 1, profile: draft({ surfaces: ["related", "suggestions"] }) });
    events.reset();
    const body = await (await choose({ friend_id: 1, profile_id: "1" })).json();
    expect(body.active).toEqual({
      suggestions: "1",
      related: "1",
      recommendations: "default",
      playlists: "default",
    });
    expect(tracked()[0][1]).toEqual({
      profile: "custom",
      surfaces: ["related", "suggestions"],
      source: "web",
    });
  });

  it.each([
    ["not JSON", "{"],
    ["no profile", { friend_id: 1 }],
    ["a built-in config", { friend_id: 1, profile_id: "strict" }],
    ["an unknown surface", { friend_id: 1, profile_id: "default", surfaces: ["search"] }],
    ["an extra key", { friend_id: 1, profile_id: "default", all: true }],
  ])("is a 400 for %s", async (_label, body) => {
    expect((await choose(body)).status).toBe(400);
  });

  it("is a 400 for a surface the profile doesn't apply to", async () => {
    await create({ friend_id: 1, profile: draft({ surfaces: ["related"] }) });
    const res = await choose({ friend_id: 1, profile_id: "1", surfaces: ["suggestions"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/doesn't apply to suggestions/);
  });

  it("is a 404 for a missing profile", async () => {
    expect((await choose({ friend_id: 1, profile_id: "44" })).status).toBe(404);
  });
});
