import { beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const loadConfig = vi.hoisted(() => vi.fn(() => ({ api_base: "x", default_friend_id: 4 })));
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({ loadConfig, GroovenetClient: GroovenetClientMock }));

import type { RankingProfileEntry, RankingProfilesResponse } from "@groovenet/client";
import {
  addProfilesCommands,
  formatProfile,
  formatProfileList,
  runCreate,
  runDelete,
  runList,
  runShow,
  runUse,
  surfacesOption,
} from "./profiles.js";

const beatmatcher: RankingProfileEntry = {
  version: 1,
  id: "beatmatcher",
  name: "Beatmatcher",
  description: "Tempo and key first.",
  surfaces: ["suggestions", "related", "recommendations"],
  kind: "preset",
  weights: { identity_similarity: 0.5, vibe_similarity: 0.5, bpm_distance: 3 },
  base: { combine: "max", signals: ["identity_similarity", "vibe_similarity"] },
  usePrior: true,
  constraints: {
    bpm_window: { unit: "ratio", max: 0.06, half_double: true },
    key_rule: { metric: "wheel", max: 1 },
  },
};
const custom: RankingProfileEntry = {
  ...beatmatcher,
  id: "17",
  name: "Mine",
  description: "",
  kind: "custom",
  surfaces: ["related"],
  base: undefined,
  constraints: {
    bpm_window: { unit: "bpm", max: 4 },
    key_rule: { metric: "wheel", max: 0 },
    genre_floor: { min: 0.2 },
    energy_range: { max_drop: 0.1, max_rise: 0.3 },
  },
};
const list: RankingProfilesResponse = {
  friend_id: 4,
  profiles: [beatmatcher, custom, { ...custom, id: "18", name: "Old", invalid: true }],
  active: { suggestions: "beatmatcher", related: "17", recommendations: "default" },
};

const api = {
  listRankingProfiles: vi.fn(async () => list),
  getRankingProfile: vi.fn(async () => beatmatcher),
  copyRankingProfile: vi.fn(async () => custom),
  setActiveRankingProfile: vi.fn(async () => ({ friend_id: 4, active: list.active })),
  deleteRankingProfile: vi.fn(async () => ({ deleted: true as const, id: "17" })),
};
let lines: string[] = [];
const io = { log: (line: string) => lines.push(line) };

beforeEach(() => {
  lines = [];
  vi.clearAllMocks();
  GroovenetClientMock.mockImplementation(function () {
    return api;
  });
});

describe("formatting", () => {
  it("lists profiles, marking where each is active and which can't be read", () => {
    expect(formatProfileList(list)).toEqual([
      "* beatmatcher  Beatmatcher  (preset; active: suggestions)",
      "* 17           Mine  (custom; active: related)",
      "  18           Old  (custom; unreadable, ranks as Default)",
    ]);
  });

  it("shows weights and every constraint", () => {
    expect(formatProfile(beatmatcher)).toEqual([
      "Beatmatcher (beatmatcher, preset)",
      "Tempo and key first.",
      "Surfaces: suggestions, related, recommendations",
      "Weights:",
      "  identity_similarity  0.5  (base: best of)",
      "  vibe_similarity      0.5  (base: best of)",
      "  bpm_distance         3",
      "Constraints: ",
      "  BPM within ±6%, half and double time",
      "  Key: adjacent",
    ]);
    expect(formatProfile({ ...custom, invalid: true }).slice(1)).toEqual([
      "Surfaces: related",
      "This profile can't be read; it ranks as Default.",
      "Weights:",
      "  identity_similarity  0.5",
      "  vibe_similarity      0.5",
      "  bpm_distance         3",
      "Constraints: ",
      "  BPM within ±4 BPM",
      "  Key: same",
      "  Genre overlap ≥ 0.2",
      "  Energy: drop ≤ 0.1, rise ≤ 0.3",
    ]);
    expect(
      formatProfile({
        ...custom,
        weights: { rating: undefined as never },
        constraints: { key_rule: { metric: "camelot", max: 2 } },
      }).slice(-3),
    ).toEqual(["  rating               0", "Constraints: ", "  Key: camelot ≤ 2"]);
    expect(formatProfile({ ...custom, constraints: {} }).at(-1)).toBe("Constraints: none");
  });

  it("parses surfaces", () => {
    expect(surfacesOption("related, suggestions,related")).toEqual(["related", "suggestions"]);
    expect(() => surfacesOption("search")).toThrow(/expected surfaces/);
    expect(() => surfacesOption(",")).toThrow(/expected surfaces/);
  });
});

describe("runs", () => {
  it("lists as text or JSON", async () => {
    await runList(api, 4, false, io);
    expect(api.listRankingProfiles).toHaveBeenCalledWith(4);
    expect(lines).toHaveLength(3);
    lines = [];
    await runList(api, 4, true, io);
    expect(JSON.parse(lines[0])).toEqual(list);
  });

  it("shows as text or JSON", async () => {
    await runShow(api, "beatmatcher", false, io);
    expect(lines[0]).toBe("Beatmatcher (beatmatcher, preset)");
    lines = [];
    await runShow(api, "beatmatcher", true, io);
    expect(JSON.parse(lines[0]).id).toBe("beatmatcher");
  });

  it("creates from a preset, optionally making it active", async () => {
    await runCreate(api, { from: "beatmatcher", friendId: 4 }, io);
    expect(api.copyRankingProfile).toHaveBeenCalledWith("beatmatcher", 4, undefined);
    expect(api.setActiveRankingProfile).not.toHaveBeenCalled();
    expect(lines).toEqual(["✓ Created Mine (17) from beatmatcher."]);
    lines = [];
    await runCreate(api, { from: "beatmatcher", name: "Mine", friendId: 4, use: true }, io);
    expect(api.setActiveRankingProfile).toHaveBeenCalledWith(4, "17");
    expect(lines).toEqual(["✓ Created Mine (17) from beatmatcher, now active."]);
    lines = [];
    await runCreate(api, { from: "selector", friendId: 4, json: true }, io);
    expect(JSON.parse(lines[0]).id).toBe("17");
  });

  it("sets the active profile", async () => {
    await runUse(api, { id: "17", friendId: 4, surfaces: ["related"] }, io);
    expect(api.setActiveRankingProfile).toHaveBeenCalledWith(4, "17", ["related"]);
    expect(lines).toEqual(["✓ 17 ranks related."]);
    lines = [];
    await runUse(api, { id: "17", friendId: 4, json: true }, io);
    expect(JSON.parse(lines[0]).active.related).toBe("17");
  });

  it("deletes", async () => {
    await runDelete(api, "17", false, io);
    await runDelete(api, "17", true, io);
    expect(lines[0]).toBe("✓ Deleted profile 17.");
    expect(JSON.parse(lines[1])).toEqual({ deleted: true, id: "17" });
  });
});

describe("commands", () => {
  const run = async (...args: string[]) => {
    const program = new Command().exitOverride();
    addProfilesCommands(program);
    await program.parseAsync(["node", "groovenet", "profiles", ...args]);
  };

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  it("wires every subcommand to the client, defaulting the library from config", async () => {
    await run("list");
    expect(api.listRankingProfiles).toHaveBeenCalledWith(4);
    await run("list", "--friend-id", "9", "--json");
    expect(api.listRankingProfiles).toHaveBeenLastCalledWith(9);
    await run("show", "selector");
    expect(api.getRankingProfile).toHaveBeenCalledWith("selector");
    await run("create", "--from", "beatmatcher", "--name", "Mine", "--use");
    expect(api.copyRankingProfile).toHaveBeenCalledWith("beatmatcher", 4, "Mine");
    await run("use", "17", "--surface", "related,suggestions");
    expect(api.setActiveRankingProfile).toHaveBeenLastCalledWith(4, "17", [
      "related",
      "suggestions",
    ]);
    await run("delete", "17");
    expect(api.deleteRankingProfile).toHaveBeenCalledWith("17");
    expect(GroovenetClientMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientName: "cli" }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("reports an API error and exits 1", async () => {
    api.getRankingProfile.mockRejectedValueOnce(new Error("API Error: not found"));
    await run("show", "99");
    expect(process.exitCode).toBe(1);
    api.deleteRankingProfile.mockRejectedValueOnce("boom");
    await run("delete", "1");
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});
