import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());

vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import { Command } from "commander";
import {
  addSetsCommands,
  consoleIO,
  describeTrack,
  formatBar,
  formatBytes,
  formatClock,
  formatSpan,
  hashFile,
  makeClient,
  marksFor,
  renderView,
  runDerive,
  runShow,
  waitForDerivation,
  type SetsClient,
  type SetsIO,
} from "./sets.js";
import type { PlannedEntry, SetDerivation, SetDerivationView, SetTrackRef } from "@groovenet/client";

// Colour codes make assertions unreadable; strip them.
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

function ref(trackId: string, title: string, artist = "Artist"): SetTrackRef {
  const [release, position] = trackId.split("-");
  return { track_id: trackId, friend_id: 1, title, artist, release_id: release, position: position ?? null };
}

function derivation(overrides: Partial<SetDerivation> = {}): SetDerivation {
  return {
    id: "d1", recording_sha256: "a".repeat(64), fingerprint_type: "chromaprint", fingerprint_version: "1",
    window_seconds: 15, step_seconds: 15, status: "processed", error: null, duration_seconds: 900,
    created_at: "", updated_at: "", completed_at: "", ...overrides,
  };
}

/** A miniature of #271: a substitution, an out-of-order pair, a gap, and a record never played. */
function view(overrides: Partial<SetDerivationView> = {}): SetDerivationView {
  const planned = (index: number, track: SetTrackRef, fingerprinted = true): PlannedEntry => ({
    ...track, index, fingerprinted,
  });
  return {
    derivation: derivation(),
    recording: {
      sha256: "a".repeat(64), file_path: "a.mp3", original_filename: "inner-signals.mp3",
      format_name: "mp3", duration_seconds: 900, size_bytes: 1000, created_at: "",
    },
    summary: { plays: 4, duration_seconds: 900, identified_seconds: 720, identified_fraction: 0.8 },
    tracklist: [
      { track_id: "10-A1", friend_id: 1, start_seconds: 15, end_seconds: 200, confidence: 0.9, windows: 12, rate: 1.0, track: ref("10-A1", "Soul Beat Momma", "Herbie Mann") },
      { track_id: "11-A6", friend_id: 1, start_seconds: 210, end_seconds: 400, confidence: 0.9, windows: 12, rate: 1.0, track: ref("11-A6", "Lovetripper", "Cuco") },
      { track_id: "14-B1", friend_id: 1, start_seconds: 580, end_seconds: 700, confidence: 0.9, windows: 8, rate: 1.0, track: ref("14-B1", "Money Yoga") },
      { track_id: "13-B1", friend_id: 1, start_seconds: 710, end_seconds: 880, confidence: 0.9, windows: 11, rate: 1.0, track: null },
    ],
    unidentified: [
      { start_seconds: 400, end_seconds: 580, unindexed_neighbours: [ref("11-A7", "Other Side")] },
    ],
    diff: {
      playlist_id: 176,
      played_as_planned: [
        { play: 0, planned: planned(0, ref("10-A1", "Soul Beat Momma")), out_of_order: false },
        { play: 2, planned: planned(4, ref("14-B1", "Money Yoga")), out_of_order: true },
        { play: 3, planned: planned(3, ref("13-B1", "Exchange")), out_of_order: false },
      ],
      played_instead_of: [{ play: 1, planned: planned(1, ref("11-A5", "Feelings", "Cuco")) }],
      played_not_planned: [],
      planned_not_played: [planned(2, ref("12-A", "El Palteado"), false)],
    },
    ...overrides,
  };
}

function capture(): SetsIO & { lines: string[]; raw: string[] } {
  const lines: string[] = [];
  const raw: string[] = [];
  return { lines, raw, log: (l) => lines.push(plain(l)), write: (t) => raw.push(t) };
}

// ─── formatting ───────────────────────────────────────────────────────────────

describe("formatting", () => {
  it.each([
    [0, "0:00:00"],
    [59.6, "0:01:00"],
    [3725, "1:02:05"],
    [11044, "3:04:04"],
    [-3, "0:00:00"],
  ])("formatClock(%d) is %s", (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });

  it("formats spans the way an unidentified stretch is read", () => {
    expect(formatSpan(150)).toBe("2m30s");
    expect(formatSpan(45)).toBe("45s");
  });

  it.each([
    [512, "512 B"],
    [2048, "2.0 KB"],
    [253 * 1024 ** 2, "253.0 MB"],
    [3 * 1024 ** 3, "3.00 GB"],
  ])("formatBytes(%d) is %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("draws a progress bar, clamped, and full for an empty total", () => {
    expect(formatBar(1, 2, 4)).toBe("██░░");
    expect(formatBar(9, 2, 4)).toBe("████");
    expect(formatBar(0, 0, 4)).toBe("████");
  });

  it("names a track by artist and title, falling back sensibly", () => {
    expect(plain(describeTrack(ref("1-A1", "Song", "Band"), "1-A1"))).toBe("Band — Song [1-A1]");
    expect(plain(describeTrack({ ...ref("1-A1", ""), artist: null, title: null }, "1-A1"))).toBe("1-A1 [1-A1]");
    expect(plain(describeTrack(null, "1-A1"))).toBe("1-A1 (no longer in the library)");
  });
});

// ─── marks and rendering ──────────────────────────────────────────────────────

describe("marksFor()", () => {
  it("marks each play by how it relates to the plan", () => {
    const marks = marksFor(view());
    expect(plain(marks.get(0)!.symbol)).toBe("✓");
    expect(plain(marks.get(1)!.note)).toBe("instead of A5 Feelings");
    expect(plain(marks.get(2)!.note)).toBe("out of order");
  });

  it("marks an unplanned play, and falls back to the id when the plan entry has no details", () => {
    const base = view();
    const marks = marksFor({
      ...base,
      diff: {
        ...base.diff!,
        played_not_planned: [{ play: 3 }],
        played_instead_of: [
          { play: 1, planned: { ...base.diff!.played_instead_of[0].planned, position: null, title: null } },
        ],
      },
    });
    expect(plain(marks.get(3)!.note)).toBe("not planned");
    expect(plain(marks.get(1)!.note)).toBe("instead of 11-A5");
  });

  it("marks nothing without a plan", () => {
    expect(marksFor(view({ diff: null })).size).toBe(0);
  });
});

describe("renderView()", () => {
  const lines = renderView(view()).map(plain);
  const text = lines.join("\n");

  it("heads with the plays, how much was identified, and the engine", () => {
    expect(lines[0]).toBe("inner-signals.mp3 — 4 plays, 80.0% of 0:15:00 identified (chromaprint 1)");
  });

  it("interleaves plays and unidentified stretches in time order", () => {
    const body = lines.filter((l) => /^\s{2}\S \d:/.test(l));
    expect(body.map((l) => l.slice(4, 11))).toEqual(["0:00:15", "0:03:30", "0:06:40", "0:09:40", "0:11:50"]);
  });

  it("says what could not be identified, and what nearby is not indexed", () => {
    expect(text).toContain(
      "? 0:06:40  0:09:40  unidentified (3m00s) — not indexed on the records either side: 11-A7 Other Side"
    );
  });

  it("marks each play against the plan", () => {
    expect(text).toContain("✓ 0:00:15  0:03:20  Herbie Mann — Soul Beat Momma [10-A1]");
    expect(text).toContain("⇄ 0:03:30  0:06:40  Cuco — Lovetripper [11-A6]  instead of A5 Feelings");
    expect(text).toContain("↕ 0:09:40  0:11:40  Artist — Money Yoga [14-B1]  out of order");
  });

  it("summarises the diff and lists what to act on", () => {
    expect(text).toContain("Against playlist 176");
    expect(text).toContain("3 as planned (1 out of order) · 1 played instead · 0 not planned · 1 planned but not played");
    expect(text).toContain("0:03:30  Cuco — Lovetripper [11-A6]  instead of  Cuco — Feelings [11-A5]");
    expect(text).toContain("Artist — El Palteado [12-A]  (not fingerprinted — may have been played)");
  });

  it("omits the diff without a plan, and handles an unknown duration", () => {
    const bare = renderView(
      view({ diff: null, summary: { plays: 0, duration_seconds: null, identified_seconds: 0, identified_fraction: null } })
    ).map(plain);
    expect(bare[0]).toContain("0 plays, ? of ? identified");
    expect(bare.join("\n")).not.toContain("Against playlist");
  });

  it("leaves out empty diff sections, and hints nothing when every neighbour is indexed", () => {
    const base = view();
    const text = renderView({
      ...base,
      unidentified: [{ ...base.unidentified[0], unindexed_neighbours: [] }],
      diff: { ...base.diff!, played_instead_of: [], planned_not_played: [], played_as_planned: [] },
    }).map(plain).join("\n");
    expect(text).not.toContain("Played instead of the plan");
    expect(text).not.toContain("Planned but not played");
    expect(text).not.toContain("not indexed on the records");
    expect(text).toContain("0 as planned · 0 played instead");
  });

  it("names an untitled neighbour by id, and does not flag a fingerprinted entry", () => {
    const base = view();
    const text = renderView({
      ...base,
      unidentified: [{ ...base.unidentified[0], unindexed_neighbours: [{ ...ref("11-A7", ""), title: null }] }],
      diff: { ...base.diff!, planned_not_played: [{ ...base.diff!.planned_not_played[0], fingerprinted: true }] },
    }).map(plain).join("\n");
    expect(text).toContain("not indexed on the records either side: 11-A7");
    expect(text).not.toContain("11-A7 null");
    expect(text).toContain("Artist — El Palteado [12-A]");
    expect(text).not.toContain("may have been played");
  });

  it("reports a failed run", () => {
    expect(renderView(view({ derivation: derivation({ status: "failed", error: "moov atom not found" }) })).map(plain)).toEqual([
      "✗ Derivation of inner-signals.mp3 failed: moov atom not found",
    ]);
    expect(plain(renderView(view({ derivation: derivation({ status: "failed" }) }))[0])).toContain("no reason given");
  });

  it("reports a run still going, by the stored name if there is no original one", () => {
    const pending = view({ derivation: derivation({ status: "processing" }), summary: null });
    pending.recording = { ...pending.recording, original_filename: null };
    expect(renderView(pending).map(plain)).toEqual(["a.mp3: processing…"]);
  });
});

// ─── work ─────────────────────────────────────────────────────────────────────

let dir: string;
let file: string;
const bytes = Buffer.from("not really a set recording");

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sets-cli-"));
  file = path.join(dir, "Carlos Díaz live.mp3");
  fs.writeFileSync(file, bytes);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("hashFile()", () => {
  it("hashes a file as a stream, reporting progress", async () => {
    const progress: number[] = [];
    expect(await hashFile(file, (n) => progress.push(n))).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(progress.at(-1)).toBe(bytes.length);
  });

  it("works without a progress callback", async () => {
    expect(await hashFile(file)).toHaveLength(64);
  });
});

describe("waitForDerivation()", () => {
  it("polls until the run is terminal", async () => {
    const getSetDerivation = vi
      .fn()
      .mockResolvedValueOnce(view({ derivation: derivation({ status: "queued" }) }))
      .mockResolvedValueOnce(view({ derivation: derivation({ status: "processing" }) }))
      .mockResolvedValueOnce(view());
    const seen: string[] = [];

    await waitForDerivation({ getSetDerivation }, "d1", { pollIntervalMs: 0, onProgress: (d) => seen.push(d.status) });

    expect(seen).toEqual(["queued", "processing", "processed"]);
  });
});

function client(overrides: Partial<Record<keyof SetsClient, ReturnType<typeof vi.fn>>> = {}) {
  return {
    hasSetRecording: vi.fn().mockResolvedValue(false),
    uploadSetRecording: vi.fn(async (_sha: string, body: NodeJS.ReadableStream, opts: { onProgress?: (n: number) => void }) => {
      for await (const _chunk of body) opts.onProgress?.(bytes.length);
      return {};
    }),
    createSetDerivation: vi.fn().mockResolvedValue({ ...derivation({ status: "queued" }), reused: false }),
    getSetDerivation: vi.fn().mockResolvedValue(view()),
    ...overrides,
  };
}

describe("runDerive()", () => {
  const sha = createHash("sha256").update(bytes).digest("hex");

  it("hashes, uploads, starts a run, waits, and prints the diff", async () => {
    const c = client();
    const io = capture();

    const code = await runDerive(c as unknown as SetsClient, file, { playlist: 176, pollInterval: 0 }, io);

    expect(code).toBe(0);
    expect(c.hasSetRecording).toHaveBeenCalledWith(sha);
    expect(c.uploadSetRecording).toHaveBeenCalledWith(sha, expect.anything(), expect.objectContaining({
      size: bytes.length, filename: "Carlos Díaz live.mp3",
    }));
    expect(c.createSetDerivation).toHaveBeenCalledWith({
      recording_sha256: sha, window_seconds: undefined, step_seconds: undefined, force: undefined, live_set_id: undefined,
    });
    expect(c.getSetDerivation).toHaveBeenLastCalledWith("d1", { playlist_id: 176, live_set_id: undefined });
    expect(io.lines).toContain(`  uploaded ${bytes.length} B`);
    expect(io.lines).toContain("  derivation d1 queued");
    expect(io.lines.join("\n")).toContain("Against playlist 176");
    expect(io.raw.some((t) => t.includes("uploading"))).toBe(true);
    expect(io.raw.some((t) => t.includes("hashing"))).toBe(true);
    expect(io.raw.some((t) => t.includes("matching   processed…"))).toBe(true);
  });

  it("polls on the default interval when none is given", async () => {
    const c = client();
    // Already processed on the first poll, so the default is never slept on.
    expect(await runDerive(c as unknown as SetsClient, file, {}, capture())).toBe(0);
    expect(c.getSetDerivation).toHaveBeenCalledTimes(2);
  });

  it("does not upload a recording the server already holds", async () => {
    const c = client({ hasSetRecording: vi.fn().mockResolvedValue(true) });
    const io = capture();

    await runDerive(c as unknown as SetsClient, file, { pollInterval: 0 }, io);

    expect(c.uploadSetRecording).not.toHaveBeenCalled();
    expect(io.lines).toContain("  already on the server — not uploading");
  });

  it("says when it is handing back an earlier run", async () => {
    const c = client({ createSetDerivation: vi.fn().mockResolvedValue({ ...derivation(), reused: true }) });
    const io = capture();
    await runDerive(c as unknown as SetsClient, file, { pollInterval: 0 }, io);
    expect(io.lines.join("\n")).toContain("reusing an earlier run — --force for a fresh one");
  });

  it("passes window, step, force and live set through", async () => {
    const c = client();
    await runDerive(c as unknown as SetsClient, file, { window: 10, step: 5, force: true, liveSet: 3, pollInterval: 0 }, capture());
    expect(c.createSetDerivation).toHaveBeenCalledWith({
      recording_sha256: sha, window_seconds: 10, step_seconds: 5, force: true, live_set_id: 3,
    });
    expect(c.getSetDerivation).toHaveBeenLastCalledWith("d1", { playlist_id: undefined, live_set_id: 3 });
  });

  it("returns straight away with --no-wait", async () => {
    const c = client();
    const io = capture();
    expect(await runDerive(c as unknown as SetsClient, file, { wait: false }, io)).toBe(0);
    expect(c.getSetDerivation).not.toHaveBeenCalled();
    expect(io.raw.some((t) => t.includes("matching"))).toBe(false);
  });

  it("prints the run as JSON with --no-wait --json", async () => {
    const io = capture();
    await runDerive(client() as unknown as SetsClient, file, { wait: false, json: true }, io);
    expect(JSON.parse(io.raw.join(""))).toMatchObject({ id: "d1", reused: false });
    expect(io.lines).toEqual([]);
  });

  it("prints only the view as JSON with --json", async () => {
    const io = capture();
    await runDerive(client() as unknown as SetsClient, file, { json: true, pollInterval: 0 }, io);
    expect(io.lines).toEqual([]);
    expect(JSON.parse(io.raw.join(""))).toMatchObject({ summary: { plays: 4 } });
  });

  it("exits 1 when the run failed", async () => {
    const failed = view({ derivation: derivation({ status: "failed", error: "boom" }) });
    const c = client({ getSetDerivation: vi.fn().mockResolvedValue(failed) });
    const io = capture();
    expect(await runDerive(c as unknown as SetsClient, file, { pollInterval: 0 }, io)).toBe(1);
    expect(io.lines.join("\n")).toContain("failed: boom");
  });

  it("refuses --playlist with --live-set before touching the file", async () => {
    const c = client();
    await expect(runDerive(c as unknown as SetsClient, file, { playlist: 1, liveSet: 2 }, capture())).rejects.toThrow(
      "Choose --playlist or --live-set, not both"
    );
    expect(c.hasSetRecording).not.toHaveBeenCalled();
  });
});

describe("runShow()", () => {
  it("renders a run against a plan", async () => {
    const c = client();
    const io = capture();
    expect(await runShow(c as unknown as SetsClient, "d1", { liveSet: 3 }, io)).toBe(0);
    expect(c.getSetDerivation).toHaveBeenCalledWith("d1", { playlist_id: undefined, live_set_id: 3 });
    expect(io.lines[0]).toContain("4 plays");
  });

  it("prints JSON, and exits 1 for a failed run", async () => {
    const failed = view({ derivation: derivation({ status: "failed" }) });
    const io = capture();
    const code = await runShow(
      client({ getSetDerivation: vi.fn().mockResolvedValue(failed) }) as unknown as SetsClient,
      "d1",
      { json: true },
      io
    );
    expect(code).toBe(1);
    expect(JSON.parse(io.raw.join("")).derivation.status).toBe("failed");
  });
});

// ─── plumbing ─────────────────────────────────────────────────────────────────

describe("makeClient()", () => {
  it("builds a client from the stored config", () => {
    loadConfig.mockReturnValue({ api_base: "https://g/api", api_key: "k", insecure_tls: true });
    makeClient();
    expect(GroovenetClientMock).toHaveBeenCalledWith({ baseUrl: "https://g/api", apiKey: "k", insecureTls: true });
  });
});

describe("consoleIO", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs lines and writes raw", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    consoleIO.log("a");
    consoleIO.write("\rb");
    expect(log).toHaveBeenCalledWith("a");
    expect(write).toHaveBeenCalledWith("\rb");
  });
});

describe("addSetsCommands()", () => {
  let fake: ReturnType<typeof client>;

  beforeEach(() => {
    fake = client();
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockImplementation(function () {
      // Not an arrow: `makeClient` calls this with `new`.
      return fake;
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
    addSetsCommands(program);
    return program.parseAsync(["node", "groovenet", "sets", ...args]);
  }

  it("derives with numeric options parsed", async () => {
    await parse("derive", file, "--playlist", "176", "--window", "10", "--poll-interval", "0");
    expect(fake.createSetDerivation).toHaveBeenCalledWith(expect.objectContaining({ window_seconds: 10 }));
    expect(fake.getSetDerivation).toHaveBeenLastCalledWith("d1", { playlist_id: 176, live_set_id: undefined });
    expect(process.exitCode).toBe(0);
  });

  it("shows a run", async () => {
    await parse("show", "d1", "--playlist", "176");
    expect(fake.getSetDerivation).toHaveBeenCalledWith("d1", { playlist_id: 176, live_set_id: undefined });
  });

  it.each([["derive"], ["show"]])("%s reports a thrown non-Error too", async (sub) => {
    fake.getSetDerivation.mockRejectedValue("socket hang up");
    fake.createSetDerivation.mockRejectedValue("socket hang up");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await parse(sub, sub === "derive" ? file : "d1");

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("socket hang up"));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it.each([["derive"], ["show"]])("%s reports a failure on stderr and exits 1", async (sub) => {
    fake.getSetDerivation.mockRejectedValue(new Error("API Error: no derivation d1"));
    fake.createSetDerivation.mockRejectedValue(new Error("API Error: no derivation d1"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    await parse(sub, sub === "derive" ? file : "d1");

    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("no derivation d1"));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
