import { beforeEach, describe, expect, it, vi } from "vitest";

const question = vi.hoisted(() => vi.fn());
const close = vi.hoisted(() => vi.fn());
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({ question, close }),
}));

import {
  applyChanges,
  changesFrom,
  describeChange,
  planFrom,
  readlineAsk,
  runReview,
  type Ask,
  type Change,
  type ReviewClient,
} from "./setsReview.js";
import type { DerivedPlay, PlannedEntry, SetDerivationView, SetTrackRef } from "@groovenet/client";
import type { SetsIO } from "./sets.js";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

function ref(trackId: string, title: string): SetTrackRef {
  const [release, position] = trackId.split("-");
  return { track_id: trackId, friend_id: 1, title, artist: "Artist", release_id: release, position: position ?? null };
}

function planned(index: number, trackId: string, title: string, fingerprinted = true): PlannedEntry {
  return { ...ref(trackId, title), index, fingerprinted };
}

function play(trackId: string, title: string, start: number): DerivedPlay {
  return {
    track_id: trackId, friend_id: 1, start_seconds: start, end_seconds: start + 200,
    confidence: 0.9, windows: 12, rate: 1, track: ref(trackId, title),
  };
}

/**
 * Plan:   0 Soul Beat Momma · 1 Feelings (A5) · 2 El Palteado · 3 Shida · 4 Eventually
 * Played: 0 Intro (not planned, before anything planned) · 1 Soul Beat Momma
 *         · 2 Lovetripper (A6, instead of Feelings) · 3 Nobody (not planned)
 *         · 4 Lovetripper again · 5 Shida · 6 Nobody again
 */
const PLAN = [
  planned(0, "10-A1", "Soul Beat Momma"),
  planned(1, "11-A5", "Feelings"),
  planned(2, "12-A", "El Palteado", false),
  planned(3, "13-B5", "Shida"),
  planned(4, "14-B2", "Eventually"),
];

function view(overrides: Partial<SetDerivationView> = {}): SetDerivationView {
  return {
    derivation: {
      id: "d1", recording_sha256: "a".repeat(64), fingerprint_type: "chromaprint", fingerprint_version: "1",
      window_seconds: 15, step_seconds: 15, status: "processed", error: null, duration_seconds: 2000,
      created_at: "", updated_at: "", completed_at: "",
    },
    recording: {
      sha256: "a".repeat(64), file_path: "a.mp3", original_filename: "set.mp3", format_name: "mp3",
      duration_seconds: 2000, size_bytes: 1, created_at: "",
    },
    summary: { plays: 7, duration_seconds: 2000, identified_seconds: 1400, identified_fraction: 0.7 },
    tracklist: [
      play("99-A1", "Intro", 0),
      play("10-A1", "Soul Beat Momma", 200),
      play("11-A6", "Lovetripper", 400),
      play("13-A2", "Nobody", 600),
      play("11-A6", "Lovetripper", 800),
      play("13-B5", "Shida", 1000),
      play("13-A2", "Nobody", 1200),
    ],
    unidentified: [],
    diff: {
      playlist_id: 176,
      played_as_planned: [
        { play: 1, planned: PLAN[0], out_of_order: false },
        { play: 5, planned: PLAN[3], out_of_order: false },
      ],
      played_instead_of: [
        { play: 2, planned: PLAN[1] },
        { play: 4, planned: PLAN[1] },
      ],
      played_not_planned: [{ play: 0 }, { play: 3 }, { play: 6 }],
      planned_not_played: [PLAN[2], PLAN[4]],
    },
    ...overrides,
  };
}

const ids = (refs: Array<{ track_id: string }>) => refs.map((r) => r.track_id);

describe("planFrom()", () => {
  it("rebuilds the plan in order from the diff's lists", () => {
    expect(planFrom(view())).toEqual(PLAN);
  });

  it("is empty without a diff", () => {
    expect(planFrom(view({ diff: null }))).toEqual([]);
  });
});

describe("changesFrom()", () => {
  const changes = changesFrom(view());

  it("lists replacements and insertions in play order, then removals", () => {
    expect(changes.map((c) => [c.kind, c.kind === "remove" ? c.planned.track_id : c.play])).toEqual([
      ["insert", 0],
      ["replace", 2],
      ["insert", 3],
      ["remove", "12-A"],
      ["remove", "14-B2"],
    ]);
  });

  it("counts a track that came back as one change", () => {
    expect(changes.filter((c) => c.kind === "replace")).toHaveLength(1);
    expect(changes.filter((c) => c.kind === "insert" && c.play === 6)).toHaveLength(0);
  });

  it("places an insertion after the slot played before it, or at the start", () => {
    const inserts = changes.filter((c): c is Extract<Change, { kind: "insert" }> => c.kind === "insert");
    expect(inserts.map((c) => [c.play, c.after])).toEqual([
      [0, null],
      [3, 1],
    ]);
  });

  it("looks past other unplanned plays for the slot to insert after", () => {
    const base = view();
    const twoInARow = { ...base, diff: { ...base.diff!, played_not_planned: [{ play: 3 }, { play: 4 }] } };
    twoInARow.tracklist = [...base.tracklist];
    twoInARow.tracklist[4] = play("15-A1", "Bridge", 800);
    twoInARow.diff.played_instead_of = [{ play: 2, planned: PLAN[1] }];
    const inserts = changesFrom(twoInARow).filter((c): c is Extract<Change, { kind: "insert" }> => c.kind === "insert");
    expect(inserts.map((c) => [c.play, c.after])).toEqual([
      [3, 1],
      [4, 1],
    ]);
  });

  it("has nothing to change without a diff", () => {
    expect(changesFrom(view({ diff: null }))).toEqual([]);
  });
});

describe("applyChanges()", () => {
  const all = changesFrom(view());

  it("replaces in the slot, inserts after the slot before, and removes", () => {
    expect(ids(applyChanges(PLAN, view(), all))).toEqual(["99-A1", "10-A1", "11-A6", "13-A2", "13-B5"]);
  });

  it("changes only what was accepted", () => {
    const replaceOnly = all.filter((c) => c.kind === "replace");
    expect(ids(applyChanges(PLAN, view(), replaceOnly))).toEqual(["10-A1", "11-A6", "12-A", "13-B5", "14-B2"]);
  });

  it("returns the plan unchanged when nothing is accepted", () => {
    expect(ids(applyChanges(PLAN, view(), []))).toEqual(ids(PLAN));
  });

  it("keeps an insertion after a slot whose entry was removed", () => {
    const changes: Change[] = [
      { kind: "remove", planned: PLAN[2] },
      { kind: "insert", play: 3, after: 2 },
    ];
    expect(ids(applyChanges(PLAN, view(), changes))).toEqual(["10-A1", "11-A5", "13-A2", "13-B5", "14-B2"]);
  });

  it("keeps two insertions after the same slot in play order", () => {
    const changes: Change[] = [
      { kind: "insert", play: 3, after: 0 },
      { kind: "insert", play: 0, after: 0 },
    ];
    expect(ids(applyChanges(PLAN, view(), changes)).slice(0, 3)).toEqual(["10-A1", "13-A2", "99-A1"]);
  });
});

describe("describeChange()", () => {
  const [insertAtStart, replace, insertAfter, removeUnindexed, removeIndexed] = changesFrom(view());
  const text = (change: Change) => describeChange(change, view(), PLAN).map(plain);

  it("describes a replacement with the slot it takes", () => {
    expect(text(replace)).toEqual([
      "⇄ 0:06:40  Artist — Lovetripper [11-A6]",
      "    was planned as  Artist — Feelings [11-A5] (slot 2)",
      "    Replace it in the playlist?",
    ]);
  });

  it("describes where an insertion goes", () => {
    expect(text(insertAfter)).toContain("    Add it after  Artist — Feelings [11-A5]?");
    expect(text(insertAtStart)).toContain("    Add it at the start of the playlist?");
  });

  it("warns before removing a track the matcher could not have recognised", () => {
    expect(text(removeUnindexed)).toContain("    Not fingerprinted — it may have been played and not recognised.");
    expect(text(removeIndexed).join("\n")).not.toContain("Not fingerprinted");
  });

  it("describes an insertion whose slot is missing from the plan as at the start", () => {
    expect(describeChange(insertAfter, view(), []).map(plain)).toContain("    Add it at the start of the playlist?");
  });
});

// ─── runReview ────────────────────────────────────────────────────────────────

function capture(): SetsIO & { lines: string[] } {
  const lines: string[] = [];
  return { lines, log: (l) => lines.push(plain(l)), write: () => {} };
}

function scripted(...answers: string[]): Ask & { asked: string[] } {
  const asked: string[] = [];
  const ask = (async (q: string) => {
    asked.push(plain(q));
    return answers.shift() ?? "";
  }) as Ask & { asked: string[] };
  ask.asked = asked;
  return ask;
}

function client(overrides: Partial<Record<keyof ReviewClient, ReturnType<typeof vi.fn>>> = {}) {
  return {
    getSetDerivation: vi.fn().mockResolvedValue(view()),
    getPlaylistTracks: vi.fn().mockResolvedValue({
      track_refs: PLAN.map((p, i) => ({ track_id: p.track_id, friend_id: p.friend_id, position: i })),
    }),
    setPlaylistTracks: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("runReview()", () => {
  it("asks about each change, confirms, and writes the corrected playlist", async () => {
    const c = client();
    const io = capture();
    // insert Intro: no · replace: yes · insert Nobody: yes · remove El Palteado: no · remove Eventually: yes · write: yes
    const ask = scripted("n", "y", "yes", "", "Y", "y");

    const code = await runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, ask, io);

    expect(code).toBe(0);
    expect(c.getSetDerivation).toHaveBeenCalledWith("d1", { playlist_id: 176, live_set_id: undefined });
    expect(c.setPlaylistTracks).toHaveBeenCalledWith(176, [
      { track_id: "10-A1", friend_id: 1 },
      { track_id: "11-A6", friend_id: 1 },
      { track_id: "13-A2", friend_id: 1 },
      { track_id: "12-A", friend_id: 1 },
      { track_id: "13-B5", friend_id: 1 },
    ]);
    expect(ask.asked.at(-1)).toContain("Write this to playlist 176? [y/N]");
    expect(io.lines).toContain("✓ Playlist 176 updated: 3 change(s).");
    expect(io.lines.join("\n")).toContain("[2/5] ⇄ 0:06:40  Artist — Lovetripper [11-A6]");
    // Changed lines are marked in the summary.
    expect(io.lines).toContain("  *  2  Artist — Lovetripper [11-A6]");
  });

  it("reads the live set's playlist when given one", async () => {
    const c = client();
    await runReview(c as unknown as ReviewClient, "d1", { liveSet: 3 }, scripted("y", "n"), capture());
    expect(c.getSetDerivation).toHaveBeenCalledWith("d1", { playlist_id: undefined, live_set_id: 3 });
  });

  it("stops asking on q, keeping what was accepted so far", async () => {
    const c = client();
    await runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted("y", "q", "y"), capture());
    expect(c.setPlaylistTracks.mock.calls[0][1].map((r: { track_id: string }) => r.track_id)[0]).toBe("99-A1");
    expect(c.setPlaylistTracks.mock.calls[0][1]).toHaveLength(6);
  });

  it("asks again after an answer it does not understand", async () => {
    const io = capture();
    const ask = scripted("maybe", "n", "n", "n", "n", "n");
    await runReview(client() as unknown as ReviewClient, "d1", { playlist: 176 }, ask, io);
    expect(io.lines).toContain("    y to accept, n (or Enter) to skip, q to stop reviewing");
    expect(ask.asked).toHaveLength(6);
  });

  it("writes nothing when nothing is accepted", async () => {
    const c = client();
    const io = capture();
    await runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted(), io);
    expect(c.setPlaylistTracks).not.toHaveBeenCalled();
    expect(io.lines).toContain("No changes accepted. The playlist is unchanged.");
  });

  it("shows the result but writes nothing on --dry-run", async () => {
    const c = client();
    const io = capture();
    const code = await runReview(c as unknown as ReviewClient, "d1", { playlist: 176, dryRun: true }, scripted("y"), io);
    expect(code).toBe(0);
    expect(c.getPlaylistTracks).not.toHaveBeenCalled();
    expect(c.setPlaylistTracks).not.toHaveBeenCalled();
    expect(io.lines.join("\n")).toContain("--dry-run: nothing written.");
  });

  it("writes nothing when the final confirm is declined", async () => {
    const c = client();
    const io = capture();
    await runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted("y", "n", "n", "n", "n", "n"), io);
    expect(c.setPlaylistTracks).not.toHaveBeenCalled();
    expect(io.lines).toContain("Not written. The playlist is unchanged.");
  });

  it("refuses to write over a playlist edited since the diff", async () => {
    const c = client({
      getPlaylistTracks: vi.fn().mockResolvedValue({ track_refs: [{ track_id: "10-A1", friend_id: 1 }] }),
    });
    const io = capture();
    const code = await runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted("y", "n", "n", "n", "n", "y"), io);
    expect(code).toBe(1);
    expect(c.setPlaylistTracks).not.toHaveBeenCalled();
    expect(io.lines.join("\n")).toContain("has changed since this diff was computed");
  });

  it("detects an edit that kept the length but changed a track", async () => {
    const edited = PLAN.map((p, i) => ({ track_id: i === 2 ? "77-X1" : p.track_id, friend_id: 1 }));
    const c = client({ getPlaylistTracks: vi.fn().mockResolvedValue({ track_refs: edited }) });
    expect(await runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted("y", "n", "n", "n", "n", "y"), capture())).toBe(1);
  });

  it("says so when the playlist already matches", async () => {
    const matched = view();
    matched.diff = { ...matched.diff!, played_instead_of: [], played_not_planned: [], planned_not_played: [] };
    const io = capture();
    expect(await runReview(client({ getSetDerivation: vi.fn().mockResolvedValue(matched) }) as unknown as ReviewClient, "d1", { playlist: 176 }, scripted(), io)).toBe(0);
    expect(io.lines).toContain("Playlist 176 already matches what was played. Nothing to review.");
  });

  it("needs exactly one plan", async () => {
    const c = client() as unknown as ReviewClient;
    await expect(runReview(c, "d1", {}, scripted(), capture())).rejects.toThrow("--playlist <id> or --live-set <id>");
    await expect(runReview(c, "d1", { playlist: 1, liveSet: 2 }, scripted(), capture())).rejects.toThrow("not both");
  });

  it("refuses a derivation that has not finished", async () => {
    const pending = view();
    pending.derivation = { ...pending.derivation, status: "processing" };
    const c = client({ getSetDerivation: vi.fn().mockResolvedValue(pending) });
    await expect(runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted(), capture())).rejects.toThrow(
      "is processing; there is nothing to review yet"
    );
  });

  it("refuses a derivation read without a diff", async () => {
    const c = client({ getSetDerivation: vi.fn().mockResolvedValue(view({ diff: null })) });
    await expect(runReview(c as unknown as ReviewClient, "d1", { playlist: 176 }, scripted(), capture())).rejects.toThrow(
      "nothing to review yet"
    );
  });

  it("names a track it cannot resolve by its id in the summary", async () => {
    const unresolved = view();
    unresolved.tracklist = unresolved.tracklist.map((p) => (p.track_id === "99-A1" ? { ...p, track: null } : p));
    const io = capture();
    await runReview(client({ getSetDerivation: vi.fn().mockResolvedValue(unresolved) }) as unknown as ReviewClient, "d1", { playlist: 176, dryRun: true }, scripted("y"), io);
    expect(io.lines).toContain("  *  1  99-A1 (no longer in the library)");
  });
});

describe("readlineAsk()", () => {
  beforeEach(() => {
    question.mockReset();
    close.mockReset();
  });

  it("asks on the terminal and closes the interface", async () => {
    question.mockResolvedValue("y");
    expect(await readlineAsk()("Continue? ")).toBe("y");
    expect(question).toHaveBeenCalledWith("Continue? ");
    expect(close).toHaveBeenCalled();
  });

  it("closes the interface even when asking fails", async () => {
    question.mockRejectedValue(new Error("stdin closed"));
    await expect(readlineAsk()("Continue? ")).rejects.toThrow("stdin closed");
    expect(close).toHaveBeenCalled();
  });
});
