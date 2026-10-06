import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { GenreProposal, GenreProposalDecision, GenreTreeNode } from "@groovenet/client";
import {
  decisionsFor,
  flattenTaxonomy,
  formatApplySummary,
  formatGroup,
  formatProgress,
  groupOf,
  groupProposals,
  listAll,
  rawKeyReader,
  runReview,
  searchTaxonomy,
  splitGroup,
  type ReviewClient,
} from "./genresReview.js";

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

let n = 0;
function proposal(overrides: Partial<GenreProposal> = {}): GenreProposal {
  n += 1;
  return {
    id: `p${n}`,
    value_normalized: `value ${n}`,
    raw_examples: [`Value ${n}`],
    track_count: 1,
    action: "map",
    target_genre_ids: ["cumbia"],
    target_genres: [{ id: "cumbia", name: "Cumbia", parent_name: "Latin" }],
    proposed_genre_name: null,
    proposed_parent_id: null,
    proposed_parent_name: null,
    confidence: 0.9,
    method: "ai",
    status: "pending",
    run_id: null,
    created_genre_id: null,
    applied_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const node = (id: string, name: string, children: GenreTreeNode[] = []): GenreTreeNode => ({
  id, name, slug: id, parent_id: null, source: "discogs", track_count: 0, album_count: 0, children,
});
const tree = [
  node("latin", "Latin", [node("cumbia", "Cumbia"), node("cumbia-colombiana", "Cumbia Colombiana"), node("salsa", "Salsa")]),
  node("rock", "Rock", [node("psych", "Psychedelic Rock")]),
];

describe("grouping", () => {
  it("groups by what the proposals would do, most tracks first", () => {
    const a = proposal({ value_normalized: "cumbia fusion", track_count: 3 });
    const b = proposal({ value_normalized: "experimental cumbia", track_count: 9 });
    const c = proposal({ action: "descriptor", target_genre_ids: [], target_genres: [], track_count: 5 });
    const d = proposal({ action: "drop", target_genre_ids: [], target_genres: [], track_count: 20 });
    const groups = groupProposals([a, b, c, d]);
    expect(groups.map((g) => [g.label, g.trackCount])).toEqual([
      ["drop (no genre)", 20],
      ["Cumbia (Latin)", 12],
      ["descriptor (mood or description, not a genre)", 5],
    ]);
    expect(groups[1].proposals.map((p) => p.value_normalized)).toEqual(["experimental cumbia", "cumbia fusion"]);
  });

  it("breaks a tie in tracks by label", () => {
    const drop = proposal({ action: "drop", target_genre_ids: [], target_genres: [], track_count: 4 });
    const desc = proposal({ action: "descriptor", target_genre_ids: [], target_genres: [], track_count: 4 });
    expect(groupProposals([drop, desc]).map((g) => g.key)).toEqual(["descriptor", "drop"]);
  });

  it("keys maps by target set and new genres by name and parent", () => {
    const twoTargets = proposal({ target_genre_ids: ["b", "a"], target_genres: [{ id: "b", name: "B", parent_name: null }, { id: "a", name: "A", parent_name: null }] });
    expect(groupOf(twoTargets)).toEqual({ key: "map:a,b", label: "B, A" });
    expect(groupOf(proposal({ target_genres: [] })).label).toBe("(targets gone)");
    const fresh = proposal({ action: "new_genre", proposed_genre_name: " Chicha ", proposed_parent_id: "cumbia", proposed_parent_name: "Cumbia" });
    expect(groupOf(fresh)).toEqual({ key: "new:chicha|cumbia", label: "new genre Chicha under Cumbia" });
    expect(groupOf(proposal({ action: "new_genre" })).label).toBe("new genre ? under ?");
    expect(groupOf(proposal({ action: "new_genre" })).key).toBe("new:|");
  });

  it("splits a group into one per value", () => {
    const [group] = groupProposals([proposal({ track_count: 2 }), proposal({ track_count: 1 })]);
    const parts = splitGroup(group);
    expect(parts.map((g) => [g.proposals.length, g.trackCount, g.label])).toEqual([[1, 2, "Cumbia (Latin)"], [1, 1, "Cumbia (Latin)"]]);
  });
});

describe("searchTaxonomy", () => {
  const entries = flattenTaxonomy(tree);

  it("flattens the tree with parent names", () => {
    expect(entries).toContainEqual({ id: "cumbia", name: "Cumbia", parent_name: "Latin" });
    expect(entries).toContainEqual({ id: "latin", name: "Latin", parent_name: null });
  });

  it("ranks exact, prefix, word prefix, substring, then letters in order", () => {
    expect(searchTaxonomy(entries, "cumbia").map((e) => e.name)).toEqual(["Cumbia", "Cumbia Colombiana"]);
    expect(searchTaxonomy(entries, "colomb").map((e) => e.name)).toEqual(["Cumbia Colombiana"]);
    expect(searchTaxonomy(entries, "elic").map((e) => e.name)).toEqual(["Psychedelic Rock"]);
    expect(searchTaxonomy(entries, "psy rk").map((e) => e.name)).toEqual(["Psychedelic Rock"]);
    expect(searchTaxonomy(entries, "Cúmbia", 1).map((e) => e.name)).toEqual(["Cumbia"]);
  });

  it("breaks ties by length, then alphabetically", () => {
    const same = [{ id: "2", name: "Dub B", parent_name: null }, { id: "1", name: "Dub A", parent_name: null }];
    expect(searchTaxonomy(same, "dub").map((e) => e.id)).toEqual(["1", "2"]);
  });

  it("finds nothing for a blank or unmatched query", () => {
    expect(searchTaxonomy(entries, "  ")).toEqual([]);
    expect(searchTaxonomy(entries, "zzz")).toEqual([]);
  });
});

describe("decisionsFor", () => {
  const map = proposal({ id: "m" });
  const desc = proposal({ id: "d", action: "descriptor", target_genre_ids: [], target_genres: [] });
  const group = { key: "k", label: "l", proposals: [map, desc], trackCount: 2 };

  it("accepts as proposed", () => {
    expect(decisionsFor(group, { kind: "accept" })).toEqual([{ id: "m", status: "accepted" }, { id: "d", status: "accepted" }]);
  });

  it("remaps, accepting values already mapped there", () => {
    expect(decisionsFor(group, { kind: "remap", genreId: "cumbia" })).toEqual([
      { id: "m", status: "accepted" },
      { id: "d", action: "map", target_genres: ["cumbia"] },
    ]);
  });

  it("proposes a new genre, or marks descriptor or drop", () => {
    expect(decisionsFor(group, { kind: "new", name: "Chicha", parentId: "cumbia" })[0]).toEqual({
      id: "m", action: "new_genre", proposed_genre_name: "Chicha", proposed_parent_id: "cumbia",
    });
    expect(decisionsFor(group, { kind: "descriptor" })).toEqual([{ id: "m", action: "descriptor" }, { id: "d", status: "accepted" }]);
    expect(decisionsFor(group, { kind: "drop" })).toEqual([{ id: "m", action: "drop" }, { id: "d", action: "drop" }]);
  });
});

describe("formatting", () => {
  it("shows a group with its values, capped", () => {
    const proposals = Array.from({ length: 8 }, (_, i) => proposal({ value_normalized: `v${i}`, track_count: 8 - i, confidence: i ? 0.5 : null }));
    const [group] = groupProposals(proposals);
    const lines = formatGroup(group, "[3 left]").map(strip);
    expect(lines[0]).toBe("[3 left] Cumbia (Latin) ← 8 values, 36 tracks");
    expect(lines[1]).toBe("    v0 (8)");
    expect(lines[2]).toBe("    v1 (7) ai 0.50");
    expect(lines.at(-1)).toBe("    … and 2 more");
    expect(strip(formatGroup(splitGroup(group)[0], "")[0])).toContain("1 value, 8 tracks");
  });

  it("shows progress and apply results", () => {
    expect(strip(formatProgress({ values: 1, tracks: 25 }, { values: 4, tracks: 100 }))).toBe("  1/4 values · 25/100 track tags (25%)");
    expect(strip(formatProgress({ values: 0, tracks: 0 }, { values: 0, tracks: 0 }))).toContain("(100%)");
    const lines = formatApplySummary({
      proposals_applied: 2, tracks_linked: 10, descriptors_added: 1, aliases_added: 1, genres_created: 0,
      skipped: [{ id: "x", value: "chicha", reason: "slug taken" }],
    }).map(strip);
    expect(lines).toEqual([
      "✓ 2 proposals applied: 10 genre links, 1 descriptors, 1 aliases, 0 new genres",
      "  skipped chicha: slug taken",
    ]);
  });
});

describe("listAll", () => {
  it("pages until the total is reached, or a page is empty", async () => {
    const listGenreProposals = vi.fn()
      .mockResolvedValueOnce({ proposals: [proposal()], total: 2 })
      .mockResolvedValueOnce({ proposals: [proposal()], total: 2 });
    expect(await listAll({ listGenreProposals }, { status: "pending" })).toHaveLength(2);
    expect(listGenreProposals).toHaveBeenLastCalledWith({ status: "pending", limit: 500, offset: 1 });

    const shrinking = vi.fn().mockResolvedValueOnce({ proposals: [], total: 5 });
    expect(await listAll({ listGenreProposals: shrinking }, {})).toEqual([]);
  });
});

/** A client over an in-memory proposal list, recording what review sends. */
function fakeClient(proposals: GenreProposal[]) {
  const decided: GenreProposalDecision[][] = [];
  const restored: string[][] = [];
  const client = {
    listGenreProposals: vi.fn(async (q: { method?: string; status?: string }) => {
      const rows = proposals.filter((p) => (!q.method || p.method === q.method) && p.status === "pending");
      return { proposals: rows, total: rows.length };
    }),
    decideGenreProposals: vi.fn(async (decisions: GenreProposalDecision[]) => {
      decided.push(decisions);
      const previous = decisions.map((d) => {
        const p = proposals.find((x) => x.id === d.id)!;
        const snapshot = { id: p.id, status: p.status, action: p.action, target_genre_ids: p.target_genre_ids, proposed_genre_name: p.proposed_genre_name, proposed_parent_id: p.proposed_parent_id, method: p.method };
        p.status = "accepted";
        return snapshot;
      });
      return { proposals: [], previous };
    }),
    restoreGenreProposals: vi.fn(async (snapshots: Array<{ id: string }>) => {
      restored.push(snapshots.map((s) => s.id));
      return { restored: snapshots.length };
    }),
    getGenreProposalTracks: vi.fn(async () => [
      { track_id: "t", friend_id: 6, title: "La Danza", artist: "Los Mirlos", album: null, styles: ["Cumbia", "Psychedelic Rock"] },
      { track_id: "u", friend_id: 6, title: "No Styles", artist: "Someone", album: null, styles: [] },
    ]),
    getGenres: vi.fn(async () => ({ genres: tree })),
    applyGenreProposals: vi.fn(async () => ({
      proposals_applied: 1, tracks_linked: 3, descriptors_added: 0, aliases_added: 0, genres_created: 0, skipped: [],
    })),
  };
  return { client: client as unknown as ReviewClient & typeof client, decided, restored };
}

function scripted(answers: string[]) {
  const queue = [...answers];
  return vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("script ran out");
    return next;
  });
}

function io() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(strip(line)), write: () => {} };
}

describe("runReview", () => {
  it("accepts exact matches up front, then decides groups biggest first and applies", async () => {
    const exact = proposal({ method: "exact", track_count: 50 });
    const big = proposal({ track_count: 10 });
    const small = proposal({ action: "drop", target_genre_ids: [], target_genres: [], track_count: 2 });
    const { client, decided } = fakeClient([exact, big, small]);
    const out = io();
    const keys = scripted(["a", "k", "y"]);

    await expect(runReview(client, { friendId: 6, autoAcceptExact: true }, keys, scripted([]), out)).resolves.toBe(0);

    expect(decided).toEqual([
      [{ id: exact.id, status: "accepted" }],
      [{ id: big.id, status: "accepted" }],
      [{ id: small.id, status: "accepted" }],
    ]);
    expect(out.lines).toContain("✓ Accepted 1 exact matches");
    expect(out.lines).toContain("Reviewing 2 values in 2 groups — friend 6");
    expect(out.lines).toContain("      Los Mirlos – La Danza  [Cumbia, Psychedelic Rock]");
    expect(out.lines).toContain("  2/2 values · 12/12 track tags (100%)");
    expect(client.getGenreProposalTracks).toHaveBeenCalledWith(big.id, { friend_id: 6, limit: 3 });
    expect(client.applyGenreProposals).toHaveBeenCalledWith(undefined, 6);
    expect(out.lines.at(-1)).toContain("1 proposals applied");
  });

  it("accepts no exact matches when there are none, and says when nothing is pending", async () => {
    const { client, decided } = fakeClient([]);
    const out = io();
    await runReview(client, { autoAcceptExact: true }, scripted([]), scripted([]), out);
    expect(decided).toEqual([]);
    expect(out.lines).toEqual(["✓ Accepted 0 exact matches", "No pending proposals to review.", "", "Decided 0 values (0 track tags) this session."]);
  });

  it("splits, skips, marks descriptors, and filters by method", async () => {
    const a = proposal({ track_count: 3 });
    const b = proposal({ track_count: 1 });
    const { client, decided } = fakeClient([a, b, proposal({ method: "exact" })]);
    const out = io();
    // x splits the Cumbia group; d marks the first value; s skips the second; x on a single value is a no-op.
    await runReview(client, { method: "ai", minTracks: 2 }, scripted(["x", "d", "x", "s", "n"]), scripted([]), out);
    expect(client.listGenreProposals).toHaveBeenCalledWith(expect.objectContaining({ method: "ai", min_tracks: 2 }));
    expect(decided).toEqual([[{ id: a.id, action: "descriptor" }]]);
    expect(out.lines).toContain("  Only one value; nothing to split.");
    expect(out.lines.at(-1)).toBe("Nothing applied. Run `groovenet genres apply` when ready.");
  });

  it("remaps through fuzzy search, retrying a cancelled or empty search", async () => {
    const p = proposal();
    const { client, decided } = fakeClient([p]);
    const out = io();
    const keys = scripted(["r", "esc", "r", "r", "enter", "q"]);
    const ask = scripted(["salsa", "zzz", "colomb"]);
    await runReview(client, {}, keys, ask, out);
    expect(out.lines).toContain('  No genre matches "zzz".');
    expect(out.lines).toContain("  1  Cumbia Colombiana (Latin)");
    expect(decided).toEqual([[{ id: p.id, action: "map", target_genres: ["cumbia-colombiana"] }]]);
    expect(client.getGenres).toHaveBeenCalledTimes(1);
  });

  it("creates a new genre, suggesting the proposed name", async () => {
    const p = proposal({ action: "new_genre", proposed_genre_name: "Chicha", proposed_parent_id: "latin", proposed_parent_name: "Latin", target_genre_ids: [], target_genres: [] });
    const q = proposal({ track_count: 0 });
    const { client, decided } = fakeClient([p, q]);
    // Enter keeps "Chicha"; pick 2 → Cumbia Colombiana. Then n with no name and no suggestion cancels; q quits.
    await runReview(client, {}, scripted(["n", "2", "n", "q", "n"]), scripted(["", "cumbia", ""]), io());
    expect(decided).toEqual([[{ id: p.id, action: "new_genre", proposed_genre_name: "Chicha", proposed_parent_id: "cumbia-colombiana" }]]);
  });

  it("asks again when the new genre's parent is cancelled", async () => {
    const p = proposal();
    const { client, decided } = fakeClient([p]);
    await runReview(client, {}, scripted(["n", "esc", "q"]), scripted(["Chicha", "cumbia"]), io());
    expect(decided).toEqual([]);
  });

  it("undoes the last decision, a whole group, and puts it back in the queue", async () => {
    const a = proposal({ track_count: 5 });
    const b = proposal({ track_count: 4 });
    const c = proposal({ action: "drop", target_genre_ids: [], target_genres: [], track_count: 1 });
    const { client, decided, restored } = fakeClient([a, b, c]);
    const out = io();
    // u with nothing to undo; a on the Cumbia group; u undoes it; k drops it instead; a; then apply? no.
    await runReview(client, {}, scripted(["u", "a", "u", "k", "a", "n"]), scripted([]), out);
    expect(out.lines).toContain("  Nothing to undo.");
    expect(out.lines).toContain("  ↶ Undid: Cumbia (Latin)");
    expect(restored).toEqual([[a.id, b.id]]);
    expect(decided.at(-2)).toEqual([{ id: a.id, action: "drop" }, { id: b.id, action: "drop" }]);
    expect(out.lines).toContain("Decided 3 values (10 track tags) this session.");
  });

  it("explains the keys on anything else, and keeps going when examples fail", async () => {
    const { client } = fakeClient([proposal()]);
    client.getGenreProposalTracks.mockRejectedValue(new Error("down"));
    const out = io();
    await runReview(client, { examples: 0 }, scripted(["?", "q"]), scripted([]), out);
    expect(out.lines.some((l) => l.startsWith("  [a]ccept"))).toBe(true);
    expect(out.lines.at(-1)).toBe("Decided 0 values (0 track tags) this session.");
  });

  it("sends groups over 500 values in batches", async () => {
    const many = Array.from({ length: 501 }, () => proposal());
    // A second, smaller group keeps the session going long enough to undo.
    const last = proposal({ action: "drop", target_genre_ids: [], target_genres: [], track_count: 0 });
    const { client, decided, restored } = fakeClient([...many, last]);
    await runReview(client, {}, scripted(["a", "u", "q"]), scripted([]), io());
    expect(decided.map((d) => d.length)).toEqual([500, 1]);
    expect(restored.map((r) => r.length)).toEqual([500, 1]);
  });
});

describe("rawKeyReader", () => {
  function fakeStdin() {
    const stdin = Object.assign(new EventEmitter(), {
      setRawMode: vi.fn(), resume: vi.fn(), pause: vi.fn(),
    });
    return stdin;
  }

  it.each([
    ["A", "a"], ["7", "7"], ["\r", "enter"], ["\n", "enter"], ["\u001b", "esc"], ["\u001b[A", "esc"], ["\u0003", "q"],
  ])("reads %j as %s and restores the terminal", async (input, expected) => {
    const stdin = fakeStdin();
    const stdout = { write: vi.fn() };
    const pending = rawKeyReader(stdin as never, stdout as never)("prompt ");
    stdin.emit("data", Buffer.from(input));
    await expect(pending).resolves.toBe(expected);
    expect(stdout.write).toHaveBeenCalledWith("prompt ");
    expect(stdin.setRawMode.mock.calls).toEqual([[true], [false]]);
    expect(stdin.pause).toHaveBeenCalled();
  });
});
