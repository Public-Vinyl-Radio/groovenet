import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());

vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import { Command } from "commander";
import type {
  GenreProposal,
  GenreReconciliationCoverage,
  GenreReconciliationRun,
} from "@groovenet/client";
import {
  addGenresCommands,
  describeProposal,
  formatCoverage,
  formatRunProgress,
  formatRunSummary,
  renderProposals,
  resolveFriendId,
  runCoverage,
  runProposals,
  runReconcile,
  toRequest,
  waitForReconciliation,
  type GenresIO,
} from "./genres.js";

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

function run(overrides: Partial<GenreReconciliationRun> = {}): GenreReconciliationRun {
  return {
    id: "run-1",
    status: "running",
    options: { ai: true, new_genre_min_tracks: 5, limit: null, refresh: false, friend_id: null },
    model: "gpt-5-mini",
    distinct_values: 100,
    exact_matches: 20,
    kept: 10,
    ai_pending: 0,
    ai_proposed: 0,
    ai_failed: 0,
    ai_batches: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    error: null,
    started_at: "2026-10-05T00:00:00.000Z",
    updated_at: "2026-10-05T00:00:00.000Z",
    finished_at: null,
    ...overrides,
  };
}

const coverage: GenreReconciliationCoverage = {
  tracks: { with_local_tags: 10, with_genres: 4, descriptors_only: 1, no_genre: 1, unresolved: 4 },
  values: {
    distinct: 8, proposed: 6, exact: 2, exact_share: 0.25,
    by_status: { pending: 3, accepted: 2, rejected: 0, edited: 1 },
    by_action: { map: 4, new_genre: 1, descriptor: 1, drop: 0 },
  },
};

function proposal(overrides: Partial<GenreProposal> = {}): GenreProposal {
  return {
    id: "p-1",
    value_normalized: "psychedelic cumbia",
    raw_examples: ["Psychedelic Cumbia"],
    track_count: 113,
    action: "map",
    target_genre_ids: ["g-1"],
    target_genres: [{ id: "g-1", name: "Cumbia", parent_name: "Latin" }],
    proposed_genre_name: null,
    proposed_parent_id: null,
    proposed_parent_name: null,
    confidence: 0.9,
    method: "ai",
    status: "pending",
    run_id: "run-1",
    created_genre_id: null,
    applied_at: null,
    created_at: "2026-10-05T00:00:00.000Z",
    updated_at: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

function captureIO(): GenresIO & { lines: string[]; written: string } {
  const io = {
    lines: [] as string[],
    written: "",
    log: (line: string) => io.lines.push(strip(line)),
    write: (text: string) => {
      io.written += text;
    },
  };
  return io;
}

// Commands read default_friend_id from config unless a test says otherwise.
beforeEach(() => {
  loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
});

describe("toRequest()", () => {
  it("sends only what was asked for", () => {
    expect(toRequest({})).toEqual({});
    expect(toRequest({ ai: true })).toEqual({});
    expect(toRequest({ ai: false, newGenreMinTracks: 3, limit: 50, refresh: true }, 6)).toEqual({
      ai: false, new_genre_min_tracks: 3, limit: 50, refresh: true, friend_id: 6,
    });
  });
});

describe("resolveFriendId()", () => {
  it("prefers --friend-id, then the configured default, else everyone", () => {
    expect(resolveFriendId({ friendId: 2 }, 6)).toBe(2);
    expect(resolveFriendId({}, 6)).toBe(6);
    expect(resolveFriendId({}, undefined)).toBeUndefined();
    expect(resolveFriendId({ allFriends: true }, 6)).toBeUndefined();
  });

  it("reads the default from config, and refuses both flags", () => {
    loadConfig.mockReturnValue({ default_friend_id: 6 });
    expect(resolveFriendId({})).toBe(6);
    expect(() => resolveFriendId({ friendId: 2, allFriends: true }, 6)).toThrow("not both");
  });
});

describe("formatting", () => {
  it("shows AI progress against the values actually sent", () => {
    expect(formatRunProgress(run({ ai_proposed: 30, ai_failed: 5, cost_usd: 0.0123 }))).toBe(
      "  mapping  35/70 values  $0.0123"
    );
    expect(formatRunProgress(run({ distinct_values: 1, exact_matches: 5 }))).toContain("0/0");
  });

  it("summarises a run, including unsent values, cost and errors", () => {
    const lines = formatRunSummary(run({
      status: "completed", ai_proposed: 60, ai_failed: 2, ai_pending: 8, ai_batches: 2,
      input_tokens: 1000, output_tokens: 500, cost_usd: 0.5, error: "Model output incomplete",
    })).map(strip);
    expect(lines).toEqual([
      "  100 distinct values",
      "  = 20 exact matches",
      "  ~ 60 proposed by gpt-5-mini, 2 failed",
      "  · 10 kept from earlier runs",
      "  … 8 not sent to the model this run",
      "  2 batches, 1000 in / 500 out tokens, $0.5000",
      "  ✗ Model output incomplete",
    ]);
  });

  it("summarises an exact-only run without AI lines", () => {
    const lines = formatRunSummary(run({ model: null, status: "completed" })).map(strip);
    expect(lines).toContain("  ~ 0 proposed by AI");
    expect(lines.some((line) => line.includes("batches"))).toBe(false);
  });

  it("reports coverage with the exact-match share", () => {
    const lines = formatCoverage(coverage).map(strip);
    expect(lines[0]).toBe("Coverage — all friends");
    expect(strip(formatCoverage(coverage, 6)[0])).toBe("Coverage — friend 6");
    expect(lines[1]).toBe("  exact matches  2/8 values (25.0%)");
    expect(lines[2]).toBe("  proposals      3 pending, 2 accepted, 1 edited, 0 rejected");
    expect(lines[3]).toContain("4 with genres, 1 descriptors only, 1 no genre, 4 unresolved — of 10");
  });

  it("describes each kind of proposal", () => {
    expect(strip(describeProposal(proposal()))).toBe("Cumbia (Latin)");
    expect(strip(describeProposal(proposal({ target_genres: [{ id: "g", name: "Latin", parent_name: null }] })))).toBe("Latin");
    expect(strip(describeProposal(proposal({ target_genres: [] })))).toBe("(targets gone)");
    expect(strip(describeProposal(proposal({ action: "new_genre", proposed_genre_name: "Chicha", proposed_parent_name: "Cumbia" })))).toBe("new: Chicha under Cumbia");
    expect(strip(describeProposal(proposal({ action: "new_genre" })))).toBe("new: ? under ?");
    expect(strip(describeProposal(proposal({ action: "descriptor" })))).toBe("descriptor");
    expect(strip(describeProposal(proposal({ action: "drop" })))).toBe("drop");
  });

  it("renders a page of proposals, or says there are none", () => {
    const table = strip(renderProposals([proposal(), proposal({ id: "p-2", confidence: null })], 40, 10));
    expect(table).toContain("psychedelic cumbia");
    expect(table).toContain("0.90");
    expect(table).toContain("11-12 of 40");
    expect(strip(renderProposals([], 0, 0))).toBe("No proposals found.");
  });
});

describe("waitForReconciliation()", () => {
  it("polls until the run leaves running", async () => {
    vi.useFakeTimers();
    const getGenreReconciliationRun = vi.fn()
      .mockResolvedValueOnce(run())
      .mockResolvedValueOnce(run({ status: "completed" }));
    const seen: string[] = [];
    const pending = waitForReconciliation({ getGenreReconciliationRun }, "run-1", {
      pollIntervalMs: 500,
      onProgress: (r) => seen.push(r.status),
    });
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toMatchObject({ status: "completed" });
    expect(seen).toEqual(["running", "completed"]);
    vi.useRealTimers();
  });
});

describe("runReconcile()", () => {
  const client = () => ({
    startGenreReconciliation: vi.fn().mockResolvedValue(run()),
    getGenreReconciliationRun: vi.fn().mockResolvedValue(
      run({ status: "completed", ai_batches: 1, ai_proposed: 70 })
    ),
    getGenreReconciliationCoverage: vi.fn().mockResolvedValue(coverage),
  });

  it("starts, polls, and prints the summary and coverage", async () => {
    const c = client();
    const io = captureIO();
    loadConfig.mockReturnValue({ default_friend_id: 6 });
    await expect(runReconcile(c, { limit: 10, pollInterval: 1 }, io)).resolves.toBe(0);
    expect(c.startGenreReconciliation).toHaveBeenCalledWith({ limit: 10, friend_id: 6 });
    expect(c.getGenreReconciliationCoverage).toHaveBeenCalledWith(6);
    expect(io.written).toContain("mapping  70/70 values");
    expect(io.lines[0]).toBe("Reconciling local_tags — friend 6, run run-1");
    expect(io.lines).toContain("  = 20 exact matches");
    expect(io.lines).toContain("Coverage — friend 6");
  });

  it("exits 1 when the run failed, also with --json", async () => {
    const c = client();
    c.getGenreReconciliationRun.mockResolvedValue(run({ status: "failed", error: "boom" }));
    const io = captureIO();
    await expect(runReconcile(c, { json: true }, io)).resolves.toBe(1);
    expect(JSON.parse(io.written)).toMatchObject({ run: { status: "failed" }, coverage });
    await expect(runReconcile(c, {}, captureIO())).resolves.toBe(1);
  });

  it("--no-wait returns the started run", async () => {
    const c = client();
    const io = captureIO();
    await expect(runReconcile(c, { wait: false }, io)).resolves.toBe(0);
    expect(io.lines).toEqual(["Reconciliation run run-1 started"]);
    const json = captureIO();
    await runReconcile(c, { wait: false, json: true }, json);
    expect(JSON.parse(json.written)).toMatchObject({ id: "run-1" });
    expect(c.getGenreReconciliationRun).not.toHaveBeenCalled();
  });
});

describe("runProposals() and runCoverage()", () => {
  it("lists proposals as a table or JSON, passing filters through", async () => {
    const listGenreProposals = vi.fn().mockResolvedValue({ proposals: [proposal()], total: 1 });
    const io = captureIO();
    await runProposals({ listGenreProposals }, { status: "pending", limit: 5 }, io);
    expect(listGenreProposals).toHaveBeenCalledWith({ status: "pending", limit: 5 });
    expect(io.lines[0]).toContain("psychedelic cumbia");
    const json = captureIO();
    await runProposals({ listGenreProposals }, { json: true }, json);
    expect(JSON.parse(json.written)).toMatchObject({ total: 1 });
  });

  it("prints coverage as text or JSON", async () => {
    const getGenreReconciliationCoverage = vi.fn().mockResolvedValue(coverage);
    const io = captureIO();
    await runCoverage({ getGenreReconciliationCoverage }, {}, io);
    expect(io.lines[0]).toBe("Coverage — all friends");
    await runCoverage({ getGenreReconciliationCoverage }, { friendId: 2 }, captureIO());
    expect(getGenreReconciliationCoverage).toHaveBeenLastCalledWith(2);
    const json = captureIO();
    await runCoverage({ getGenreReconciliationCoverage }, { json: true }, json);
    expect(JSON.parse(json.written)).toEqual(coverage);
  });
});

describe("addGenresCommands()", () => {
  const methods = {
    startGenreReconciliation: vi.fn(),
    getGenreReconciliationRun: vi.fn(),
    getGenreReconciliationCoverage: vi.fn(),
    listGenreProposals: vi.fn(),
  };

  beforeEach(() => {
    methods.startGenreReconciliation.mockReset().mockResolvedValue(run());
    methods.getGenreReconciliationRun.mockReset().mockResolvedValue(run({ status: "completed" }));
    methods.getGenreReconciliationCoverage.mockReset().mockResolvedValue(coverage);
    methods.listGenreProposals.mockReset().mockResolvedValue({ proposals: [], total: 0 });
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockImplementation(function () {
      // Not an arrow: `makeClient` calls this with `new`.
      return methods;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function parse(...args: string[]) {
    const program = new Command();
    program.exitOverride();
    addGenresCommands(program);
    return program.parseAsync(["node", "groovenet", "genres", ...args]);
  }

  it("reconcile passes its flags through", async () => {
    await parse("reconcile", "--no-ai", "--new-genre-min-tracks", "3", "--limit", "20", "--refresh", "--no-wait");
    expect(methods.startGenreReconciliation).toHaveBeenCalledWith({
      ai: false, new_genre_min_tracks: 3, limit: 20, refresh: true,
    });
    expect(process.exitCode).toBe(0);
  });

  it("proposals validates its filters and defaults the page", async () => {
    await parse("proposals", "--status", "accepted", "--method", "exact", "--action", "map");
    expect(methods.listGenreProposals).toHaveBeenCalledWith({
      status: "accepted", method: "exact", action: "map", limit: 50, offset: 0,
    });
    await expect(parse("proposals", "--status", "done")).rejects.toThrow(/expected one of/);
  });

  it("coverage prints the report", async () => {
    await parse("coverage", "--json");
    expect(methods.getGenreReconciliationCoverage).toHaveBeenCalled();
  });

  it("scopes to the configured friend unless told otherwise", async () => {
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api", default_friend_id: 6 });
    await parse("reconcile", "--no-wait");
    expect(methods.startGenreReconciliation).toHaveBeenLastCalledWith({ friend_id: 6 });
    await parse("reconcile", "--all-friends", "--no-wait");
    expect(methods.startGenreReconciliation).toHaveBeenLastCalledWith({});
    await parse("coverage", "--friend-id", "2");
    expect(methods.getGenreReconciliationCoverage).toHaveBeenLastCalledWith(2);
  });

  it("reports API errors and exits 1", async () => {
    methods.getGenreReconciliationCoverage.mockRejectedValue(new Error("API Error: down"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await parse("coverage");
    expect(exit).toHaveBeenCalledWith(1);
    methods.getGenreReconciliationCoverage.mockRejectedValue("plain");
    await parse("coverage");
    expect(exit).toHaveBeenCalledTimes(2);
  });
});
