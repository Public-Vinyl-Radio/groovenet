import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listLocalTagTracks: vi.fn(),
  listTaxonomy: vi.fn(),
  resolveExactValues: vi.fn(),
  listProposalStates: vi.fn(),
  upsertProposals: vi.fn(),
  refreshProposalStats: vi.fn(),
  failStaleRuns: vi.fn(),
  createRun: vi.fn(),
  getRunningRun: vi.fn(),
  getRun: vi.fn(),
  updateRun: vi.fn(),
  finishRun: vi.fn(),
  getProposal: vi.fn(),
  updateProposal: vi.fn(),
  listApprovedProposals: vi.fn(),
  listTrackGenreState: vi.fn(),
}));
const resolveGenreRefs = vi.hoisted(() => vi.fn());
const mapValuesWithAi = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());

vi.mock("@/server/repositories/genreReconciliationRepository", () => ({ genreReconciliationRepository: repo }));
vi.mock("@/server/repositories/trackGenreRepository", () => ({ trackGenreRepository: { resolveGenreRefs } }));
vi.mock("@/server/genres/reconciliationAi", () => ({
  RECONCILIATION_BATCH_SIZE: 2,
  RECONCILIATION_MODEL: "test-model",
  mapValuesWithAi,
}));
vi.mock("@/lib/serverDb", () => ({ withDbTransaction: async (fn: (c: unknown) => unknown) => fn({ query }) }));

import {
  applyProposals,
  defaultRunOptions,
  executeRun,
  getCoverage,
  getRun,
  GenreReconciliationError,
  planRun,
  startRun,
  updateProposal,
} from "../genreReconciliationService";
import type { Proposal, ProposalDraft } from "@/server/repositories/genreReconciliationRepository";
import type { LocalTagValue } from "@/lib/genres/localTags";

const value = (v: string, track_count = 1): LocalTagValue => ({ value_normalized: v, raw_examples: [v], track_count, styles: [] });
const draft = (v: string): ProposalDraft => ({
  value_normalized: v, raw_examples: [v], track_count: 1, action: "drop", target_genre_ids: [],
  proposed_genre_name: null, proposed_parent_id: null, confidence: 0.5, method: "ai",
});
const proposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  id: "p1", value_normalized: "cumbia", raw_examples: ["Cumbia"], track_count: 2, action: "map",
  target_genre_ids: ["g1"], target_genres: [{ id: "g1", name: "Cumbia", parent_name: "Latin" }],
  proposed_genre_name: null, proposed_parent_id: null, proposed_parent_name: null, confidence: 1,
  method: "exact", status: "accepted", run_id: null, created_genre_id: null, applied_at: null,
  created_at: "", updated_at: "", ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.OPENAI_API_KEY = "test";
});
afterEach(() => vi.restoreAllMocks());

describe("planRun", () => {
  const existing = new Map([
    ["accepted", { status: "accepted" as const, method: "ai" }],
    ["rejected", { status: "rejected" as const, method: "ai" }],
    ["pending ai", { status: "pending" as const, method: "ai" }],
    ["pending exact", { status: "pending" as const, method: "exact" }],
    ["now exact", { status: "pending" as const, method: "ai" }],
  ]);
  const values = ["accepted", "rejected", "pending ai", "pending exact", "now exact", "new"].map((v) => value(v));
  const exact = new Map([["now exact", "g1"], ["accepted", "g2"]]);

  it("keeps reviewed and pending AI proposals, proposes exact matches, sends the rest", () => {
    const plan = planRun(values, existing, exact, { refresh: false });
    expect(plan.kept.map((v) => v.value_normalized)).toEqual(["accepted", "rejected", "pending ai"]);
    expect(plan.exact).toEqual([expect.objectContaining({ value_normalized: "now exact", target_genre_ids: ["g1"], confidence: 1, method: "exact" })]);
    expect(plan.forAi.map((v) => v.value_normalized)).toEqual(["pending exact", "new"]);
  });

  it("re-sends pending AI proposals when refreshing", () => {
    const plan = planRun(values, existing, exact, { refresh: true });
    expect(plan.forAi.map((v) => v.value_normalized)).toEqual(["pending ai", "pending exact", "new"]);
  });
});

describe("startRun", () => {
  it("creates a run and processes it in the background", async () => {
    repo.createRun.mockResolvedValue({ id: "run" });
    repo.listLocalTagTracks.mockReturnValue(new Promise(() => {}));
    await expect(startRun({ limit: 5 })).resolves.toEqual({ id: "run" });
    expect(repo.failStaleRuns).toHaveBeenCalledWith(15);
    expect(repo.createRun).toHaveBeenCalledWith({ ...defaultRunOptions, limit: 5 }, "test-model");
    expect(repo.listLocalTagTracks).toHaveBeenCalled();
  });

  it("records no model for an exact-only run, which needs no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    repo.createRun.mockResolvedValue({ id: "run" });
    repo.listLocalTagTracks.mockReturnValue(new Promise(() => {}));
    await startRun({ ai: false });
    expect(repo.createRun).toHaveBeenCalledWith(expect.objectContaining({ ai: false }), null);
  });

  it("refuses AI without a key", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(startRun({})).rejects.toMatchObject({ status: 503 });
    expect(repo.createRun).not.toHaveBeenCalled();
  });

  it("refuses a second run, returning the one in progress", async () => {
    repo.createRun.mockResolvedValue(null);
    repo.getRunningRun.mockResolvedValueOnce({ id: "other" }).mockResolvedValueOnce(null);
    await expect(startRun({})).rejects.toMatchObject({ status: 409, run: { id: "other" } });
    await expect(startRun({})).rejects.toMatchObject({ status: 409, run: undefined });
  });
});

describe("executeRun", () => {
  beforeEach(() => {
    repo.listLocalTagTracks.mockResolvedValue([
      { track_id: "1", friend_id: 1, local_tags: "Cumbia · Chicha · Uplifting", styles: [] },
      { track_id: "2", friend_id: 1, local_tags: "Chicha, Noise, Rare", styles: [] },
    ]);
    repo.listProposalStates.mockResolvedValue(new Map());
    repo.resolveExactValues.mockResolvedValue(new Map([["cumbia", "g1"]]));
    repo.listTaxonomy.mockResolvedValue([]);
  });

  it("proposes exact matches, maps the rest in batches and records cost", async () => {
    mapValuesWithAi
      .mockResolvedValueOnce({ drafts: [draft("chicha")], usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.01 } })
      .mockRejectedValueOnce(Object.assign(new Error("Model output incomplete"), { usage: { input_tokens: 3, output_tokens: 1, cost_usd: 0.001 } }));
    await executeRun("run", { ...defaultRunOptions, limit: 4, friend_id: 6 });

    expect(repo.listLocalTagTracks).toHaveBeenCalledWith(undefined, 6);
    expect(repo.refreshProposalStats).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ value_normalized: "chicha", track_count: 2 })]));
    expect(repo.upsertProposals).toHaveBeenNthCalledWith(1, [expect.objectContaining({ value_normalized: "cumbia", method: "exact" })], "run");
    expect(repo.upsertProposals).toHaveBeenNthCalledWith(2, [expect.objectContaining({ value_normalized: "chicha" })], "run");
    expect(mapValuesWithAi).toHaveBeenCalledTimes(2);
    expect(mapValuesWithAi.mock.calls[0][0].map((v: LocalTagValue) => v.value_normalized)).toEqual(["chicha", "noise"]);
    expect(repo.updateRun).toHaveBeenLastCalledWith("run", expect.objectContaining({
      distinct_values: 5, exact_matches: 1, ai_pending: 0, ai_proposed: 1, ai_failed: 3,
      ai_batches: 2, input_tokens: 13, output_tokens: 6, cost_usd: 0.011,
    }));
    expect(repo.finishRun).toHaveBeenCalledWith("run", "completed", "Model output incomplete");
  });

  it("counts a failure without usage, and a non-Error rejection", async () => {
    mapValuesWithAi.mockRejectedValue("network");
    await executeRun("run", { ...defaultRunOptions, limit: 1 });
    expect(repo.updateRun).toHaveBeenLastCalledWith("run", expect.objectContaining({ ai_failed: 1, ai_pending: 3, input_tokens: 0 }));
    expect(repo.finishRun).toHaveBeenCalledWith("run", "completed", "network");
  });

  it("sends every remaining value when there is no limit", async () => {
    mapValuesWithAi.mockResolvedValue({ drafts: [], usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0 } });
    await executeRun("run", defaultRunOptions);
    expect(mapValuesWithAi).toHaveBeenCalledTimes(2);
  });

  it("makes no model calls with AI off", async () => {
    await executeRun("run", { ...defaultRunOptions, ai: false });
    expect(mapValuesWithAi).not.toHaveBeenCalled();
    expect(repo.listTaxonomy).not.toHaveBeenCalled();
    expect(repo.updateRun).toHaveBeenLastCalledWith("run", expect.objectContaining({ ai_pending: 4 }));
    expect(repo.finishRun).toHaveBeenCalledWith("run", "completed", null);
  });

  it("marks the run failed when the pipeline throws", async () => {
    repo.listLocalTagTracks.mockRejectedValue(new Error("db down"));
    await executeRun("run", defaultRunOptions);
    expect(repo.finishRun).toHaveBeenCalledWith("run", "failed", "db down");

    repo.listLocalTagTracks.mockRejectedValue("odd");
    repo.finishRun.mockRejectedValue(new Error("still down"));
    await expect(executeRun("run", defaultRunOptions)).resolves.toBeUndefined();
    expect(repo.finishRun).toHaveBeenLastCalledWith("run", "failed", "odd");
  });
});

describe("getRun", () => {
  it("returns a run or a 404", async () => {
    repo.getRun.mockResolvedValueOnce({ id: "run" }).mockResolvedValueOnce(null);
    await expect(getRun("run")).resolves.toEqual({ id: "run" });
    await expect(getRun("gone")).rejects.toMatchObject({ status: 404 });
  });
});

describe("updateProposal", () => {
  beforeEach(() => {
    repo.getProposal.mockResolvedValue(proposal({ status: "pending", method: "ai" }));
    repo.updateProposal.mockResolvedValue(true);
  });

  it("accepts or rejects as proposed", async () => {
    await updateProposal("p1", { status: "accepted" });
    expect(repo.updateProposal).toHaveBeenCalledWith("p1", { status: "accepted" });
  });

  it("marks a changed proposal edited and manual, resolving genre names", async () => {
    resolveGenreRefs.mockResolvedValue({ ids: ["g2"], unknown: [] });
    await updateProposal("p1", { target_genres: ["Salsa"], status: "accepted" });
    expect(repo.updateProposal).toHaveBeenCalledWith("p1", { target_genre_ids: ["g2"], method: "manual", status: "edited" });
  });

  it("lets an edit be parked as pending or rejected", async () => {
    await updateProposal("p1", { action: "drop", status: "rejected" });
    expect(repo.updateProposal).toHaveBeenCalledWith("p1", { action: "drop", method: "manual", status: "rejected" });
  });

  it("edits a new genre, trimming the name", async () => {
    await updateProposal("p1", { action: "new_genre", proposed_genre_name: " Chicha ", proposed_parent_id: "g1" });
    expect(repo.updateProposal).toHaveBeenCalledWith("p1", expect.objectContaining({ proposed_genre_name: "Chicha", proposed_parent_id: "g1", status: "edited" }));
  });

  it("touches nothing but the timestamp when given nothing", async () => {
    await updateProposal("p1", {});
    expect(repo.updateProposal).toHaveBeenCalledWith("p1", {});
  });

  it("clears a proposed genre name with null", async () => {
    await updateProposal("p1", { proposed_genre_name: null });
    expect(repo.updateProposal).toHaveBeenCalledWith("p1", expect.objectContaining({ proposed_genre_name: null, status: "edited" }));
  });

  it("rejects unknown genres and incomplete proposals", async () => {
    resolveGenreRefs.mockResolvedValue({ ids: [], unknown: ["Nope"] });
    await expect(updateProposal("p1", { target_genres: ["Nope"] })).rejects.toThrow("Unknown genres: Nope");
    resolveGenreRefs.mockResolvedValue({ ids: [], unknown: [] });
    await expect(updateProposal("p1", { target_genres: [] })).rejects.toThrow("at least one target");
    await expect(updateProposal("p1", { action: "new_genre", proposed_genre_name: "  " })).rejects.toThrow("needs proposed_genre_name");
    expect(repo.updateProposal).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing proposal", async () => {
    repo.getProposal.mockResolvedValue(null);
    await expect(updateProposal("p1", { status: "accepted" })).rejects.toBeInstanceOf(GenreReconciliationError);
  });

  it("turns a missing parent into a 400, and passes other errors on", async () => {
    repo.updateProposal.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "23503" }));
    await expect(updateProposal("p1", { action: "new_genre", proposed_genre_name: "X", proposed_parent_id: "gone" }))
      .rejects.toMatchObject({ status: 400 });
    repo.updateProposal.mockRejectedValueOnce(new Error("boom"));
    await expect(updateProposal("p1", { status: "accepted" })).rejects.toThrow("boom");
  });
});

describe("applyProposals", () => {
  const tracks = [
    { track_id: "1", friend_id: 1, local_tags: "Cumbia · Chicha · Uplifting · Noise" },
    { track_id: "2", friend_id: 1, local_tags: "chicha" },
  ];
  let created: boolean;
  let existingGenre: string | null;
  let slugTaken: boolean;
  let createdStillExists: boolean;

  beforeEach(() => {
    created = false; existingGenre = null; slugTaken = false; createdStillExists = true;
    repo.listLocalTagTracks.mockResolvedValue(tracks);
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT id FROM genres WHERE id")) return { rows: createdStillExists ? [{ id: "made" }] : [] };
      if (sql.includes("UNION ALL SELECT genre_id")) return { rows: existingGenre ? [{ id: existingGenre }] : [] };
      if (sql.startsWith("SELECT 1 FROM genres WHERE slug")) return { rows: slugTaken ? [{}] : [] };
      if (sql.startsWith("INSERT INTO genres")) { created = true; return { rows: [{ id: "new-genre" }] }; }
      if (sql.includes("INSERT INTO track_genres")) return { rowCount: 2 };
      if (sql.includes("INSERT INTO genre_aliases")) return { rowCount: 1 };
      if (sql.includes("UPDATE tracks")) return { rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  });

  it("links, describes and aliases each accepted proposal under lock", async () => {
    repo.listApprovedProposals.mockResolvedValue([
      proposal({ id: "p1", value_normalized: "cumbia" }),
      proposal({ id: "p2", value_normalized: "chicha", action: "new_genre", target_genres: [], proposed_genre_name: "Chicha", proposed_parent_id: "g1" }),
      proposal({ id: "p3", value_normalized: "uplifting", action: "descriptor", target_genres: [] }),
      proposal({ id: "p4", value_normalized: "noise", action: "drop", target_genres: [] }),
      proposal({ id: "p5", value_normalized: "unused", target_genres: [{ id: "a", name: "A", parent_name: null }, { id: "b", name: "B", parent_name: null }] }),
    ]);
    const summary = await applyProposals(["p1"], 6);

    expect(query.mock.calls[0][0]).toContain("LOCK TABLE genres, genre_aliases");
    expect(repo.listApprovedProposals).toHaveBeenCalledWith(expect.anything(), ["p1"]);
    expect(repo.listLocalTagTracks).toHaveBeenCalledWith(expect.anything(), 6);
    expect(created).toBe(true);
    expect(summary).toEqual({
      proposals_applied: 5, tracks_linked: 4, descriptors_added: 1, aliases_added: 2, genres_created: 1, skipped: [],
    });
    const linkCalls = query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO track_genres"));
    expect(linkCalls[0][1]).toEqual([["1"], [1], ["g1"]]);
    expect(linkCalls[1][1]).toEqual([["1", "2"], [1, 1], ["new-genre"]]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET applied_at = now()"), ["p2", "new-genre"]);
  });

  it("reuses a genre it created before, or one that now exists", async () => {
    repo.listApprovedProposals.mockResolvedValue([
      proposal({ id: "p1", value_normalized: "chicha", action: "new_genre", target_genres: [], created_genre_id: "made", proposed_genre_name: "Chicha" }),
    ]);
    expect(await applyProposals()).toMatchObject({ genres_created: 0, proposals_applied: 1 });

    createdStillExists = false;
    existingGenre = "existing";
    expect(await applyProposals()).toMatchObject({ genres_created: 0, proposals_applied: 1 });
    expect(created).toBe(false);
  });

  it("skips what it cannot apply, with the reason", async () => {
    slugTaken = true;
    repo.listApprovedProposals.mockResolvedValue([
      proposal({ id: "a", value_normalized: "cumbia", target_genres: [] }),
      proposal({ id: "b", value_normalized: "x", action: "new_genre", target_genres: [], proposed_genre_name: null }),
      proposal({ id: "c", value_normalized: "x", action: "new_genre", target_genres: [], proposed_genre_name: "X" }),
      proposal({ id: "d", value_normalized: "x", action: "new_genre", target_genres: [], proposed_genre_name: "!!!", proposed_parent_id: "g1" }),
      proposal({ id: "e", value_normalized: "x", action: "new_genre", target_genres: [], proposed_genre_name: "Taken", proposed_parent_id: "g1" }),
    ]);
    const summary = await applyProposals();
    expect(summary.proposals_applied).toBe(0);
    expect(summary.skipped.map((s) => s.reason)).toEqual([
      "none of its target genres exist any more",
      "new_genre without a proposed_genre_name",
      "new_genre without an existing parent",
      "'!!!' does not produce a URL slug",
      "slug 'taken' is already taken",
    ]);
  });

  it("tolerates a driver that reports no row count", async () => {
    query.mockResolvedValue({ rows: [] });
    repo.listApprovedProposals.mockResolvedValue([
      proposal({ value_normalized: "cumbia" }),
      proposal({ id: "p3", value_normalized: "uplifting", action: "descriptor", target_genres: [] }),
    ]);
    expect(await applyProposals()).toMatchObject({ tracks_linked: 0, aliases_added: 0, descriptors_added: 0, proposals_applied: 2 });
  });
});

describe("getCoverage", () => {
  it("puts every tagged track in one bucket and reports the exact share", async () => {
    repo.listLocalTagTracks.mockResolvedValue([
      { track_id: "1", friend_id: 1, local_tags: "Cumbia" },
      { track_id: "2", friend_id: 1, local_tags: "Uplifting" },
      { track_id: "3", friend_id: 1, local_tags: "Noise" },
      { track_id: "4", friend_id: 1, local_tags: "Noise, Mystery" },
      { track_id: "5", friend_id: 1, local_tags: " , " },
      { track_id: "6", friend_id: 1, local_tags: "Hiss" },
      { track_id: "7", friend_id: 1, local_tags: "Maybe" },
    ]);
    // Track 5 has no values at all: unresolved, not "no genre".
    repo.listTrackGenreState.mockResolvedValue({ linked: new Set(["1:1"]), described: new Set(["2:1"]) });
    repo.listProposalStates.mockResolvedValue(new Map([
      ["cumbia", { status: "accepted", method: "exact", action: "map" }],
      ["uplifting", { status: "edited", method: "manual", action: "descriptor" }],
      ["noise", { status: "accepted", method: "ai", action: "drop" }],
      ["hiss", { status: "edited", method: "manual", action: "drop" }],
      ["maybe", { status: "pending", method: "ai", action: "drop" }],
    ]));
    expect(await getCoverage()).toEqual({
      tracks: { with_local_tags: 7, with_genres: 1, descriptors_only: 1, no_genre: 2, unresolved: 3 },
      values: {
        distinct: 6, proposed: 5, exact: 1, exact_share: 1 / 6,
        by_status: { pending: 1, accepted: 2, rejected: 0, edited: 2 },
        by_action: { map: 1, new_genre: 0, descriptor: 1, drop: 3 },
      },
    });
  });

  it("reports a zero share with nothing tagged", async () => {
    repo.listLocalTagTracks.mockResolvedValue([]);
    repo.listTrackGenreState.mockResolvedValue({ linked: new Set(), described: new Set() });
    repo.listProposalStates.mockResolvedValue(new Map());
    expect((await getCoverage(6)).values.exact_share).toBe(0);
    expect(repo.listLocalTagTracks).toHaveBeenCalledWith(undefined, 6);
    expect(repo.listTrackGenreState).toHaveBeenCalledWith(6);
  });
});
