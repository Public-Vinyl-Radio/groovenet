import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import { Command } from "commander";
import {
  addVinylCommands,
  formatDetection,
  formatOffset,
  formatStats,
  makeClient,
} from "./vinyl.js";
import type { DetectionWindow, IngestPipelineStats } from "@groovenet/client";

function window(overrides: Partial<DetectionWindow> = {}): DetectionWindow {
  return {
    id: "d1", ingest_id: "i1", source_id: "aswitch", session_id: "s1",
    window_start_at: "2026-09-21T02:00:00.000Z",
    matched: true, track_id: "t1", friend_id: 1,
    title: "Power", artist: "Ray Barretto", album: "Power",
    confidence: 0.94, offset_seconds: 47.2,
    fingerprint_type: "chromaprint", fingerprint_version: "1",
    created_at: "2026-09-21T02:00:05.000Z",
    ...overrides,
  };
}

function stats(overrides: Partial<IngestPipelineStats> = {}): IngestPipelineStats {
  return {
    since: "2026-09-21T01:00:00Z", window_minutes: 60, source_id: null,
    ingest_writable: true,
    index: { engine_registered: true, fingerprint_type: "chromaprint",
             fingerprint_version: "1", indexed_tracks: 3783, empty: false,
             missing_fingerprint_tracks: 0 },
    queue_depth: 0,
    ingests: { by_status: { processed: 10 }, failures: [], oldest_in_flight: null },
    detections: { windows: 10, matched: 8, no_match: 2, match_rate: 0.8,
                  confidence_bands: [{ band: "0.90-1.00", count: 8 }] },
    ...overrides,
  };
}

const plain = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

describe("formatOffset()", () => {
  it("renders seconds as a position in the track", () => {
    expect(formatOffset(47.2)).toBe("0:47");
    expect(formatOffset(125)).toBe("2:05");
  });

  it("handles the very start", () => {
    expect(formatOffset(0)).toBe("0:00");
  });

  it("shows a dash when there is no offset", () => {
    expect(formatOffset(null)).toBe("—");
  });
});

describe("formatDetection() — timestamps", () => {
  it("shows a dash when a window has no start time", () => {
    // captured_at is optional on upload (#275), so this really happens.
    const row = formatDetection(window({ window_start_at: null }));
    expect(plain(row[0])).toBe("—");
  });

  it("renders a time when it has one", () => {
    const row = formatDetection(window());
    expect(plain(row[0])).not.toBe("—");
  });
});

describe("formatDetection()", () => {
  it("shows artist, title, confidence and position", () => {
    const [, track, conf, at] = formatDetection(window()).map(plain);
    expect(track).toBe("Ray Barretto — Power");
    expect(conf).toBe("0.940");
    expect(at).toBe("0:47");
  });

  it("renders a no-match plainly, not as an error", () => {
    // It is the expected state between tracks; colouring it red would train
    // you to ignore red.
    const row = formatDetection(window({ matched: false, artist: null, title: null,
                                         confidence: null, offset_seconds: null }));
    expect(plain(row[1])).toBe("no match");
    expect(row[1]).not.toContain("\u001b[31m");
  });

  it("copes with a match whose track metadata is missing", async () => {
    const row = formatDetection(window({ artist: null, title: null }));
    expect(plain(row[1])).toBe("? — ?");
  });

  it("treats a match with no confidence as zero rather than crashing", () => {
    const row = formatDetection(window({ confidence: null }));
    expect(plain(row[2])).toBe("0.000");
  });

  it("paints a low-confidence match differently from a high one", () => {
    // A cluster just above the threshold is the shape that says something is
    // wrong, so it should not look identical to a confident match.
    const high = formatDetection(window({ confidence: 0.94 }))[2];
    const low = formatDetection(window({ confidence: 0.78 }))[2];
    expect(high).not.toBe(low);
  });
});

describe("formatStats() — the volume", () => {
  it("leads with an unwritable volume, above everything else", () => {
    // It has already happened once: the volume was root-owned, every upload
    // failed with EACCES, and every other number looked perfectly healthy.
    const out = plain(formatStats(stats({ ingest_writable: false })));

    expect(out.split("\n")[0]).toContain("ingest volume is NOT writable");
    expect(out).toContain("AUDIO_INGEST_DIR");
  });

  it("says nothing about the volume when it is fine", () => {
    expect(plain(formatStats(stats()))).not.toContain("NOT writable");
  });
});

describe("formatStats()", () => {
  it("leads with the index when it is healthy", () => {
    expect(plain(formatStats(stats()))).toContain("✓ index: 3783 tracks");
  });

  it("shouts when the index is empty", () => {
    // The failure that otherwise looks like success.
    const out = plain(formatStats(stats({
      index: { engine_registered: true, fingerprint_type: "chromaprint",
               fingerprint_version: "1", indexed_tracks: 0, empty: true,
               missing_fingerprint_tracks: 0 },
    })));

    expect(out).toContain("reference index is EMPTY");
    expect(out).toContain("fingerprint-library");
  });

  it("distinguishes a missing engine from an empty index", () => {
    const out = plain(formatStats(stats({
      index: { engine_registered: false, fingerprint_type: null,
               fingerprint_version: null, indexed_tracks: 0, empty: true,
               missing_fingerprint_tracks: 0 },
    })));

    expect(out).toContain("no fingerprint engine registered");
    expect(out).toContain("fingerprint-service");
  });

  it("flags tracks with audio but no fingerprint", () => {
    const out = plain(formatStats(stats({
      index: { engine_registered: true, fingerprint_type: "chromaprint",
               fingerprint_version: "1", indexed_tracks: 3783, empty: false,
               missing_fingerprint_tracks: 29 },
    })));
    expect(out).toContain("29 track(s) have audio but no fingerprint");
  });

  it("says nothing about a fingerprint backlog when there is none", () => {
    expect(plain(formatStats(stats()))).not.toContain("no fingerprint");
  });

  it("reports the match rate", () => {
    expect(plain(formatStats(stats()))).toContain("8 matched, 2 no-match (80.0%)");
  });

  it("shows a dash for the rate when there were windows but no rate", () => {
    const out = plain(formatStats(stats({
      detections: { windows: 3, matched: 0, no_match: 3, match_rate: null,
                    confidence_bands: [] },
    })));
    expect(out).toContain("(—)");
  });

  it("says so when there were no windows at all", () => {
    const out = plain(formatStats(stats({
      detections: { windows: 0, matched: 0, no_match: 0, match_rate: null,
                    confidence_bands: [] },
    })));
    expect(out).toContain("detections: none in this window");
  });

  it("lists failure reasons", () => {
    const out = plain(formatStats(stats({
      ingests: { by_status: { failed: 3 },
                 failures: [{ error: "decode failed", count: 3 }],
                 oldest_in_flight: null },
    })));
    expect(out).toContain("3× decode failed");
  });

  it("flags an unreachable queue rather than showing zero", () => {
    // Zero depth and "cannot tell" are different, and one is a problem.
    const out = plain(formatStats(stats({ queue_depth: null })));
    expect(out).toContain("queue depth unavailable");
  });

  it("warns about a chunk stuck in flight", () => {
    const out = plain(formatStats(stats({
      ingests: { by_status: {}, failures: [],
                 oldest_in_flight: { ingest_id: "i9", status: "processing",
                                     received_at: "2026-09-21T02:00:00.000Z" } },
    })));
    expect(out).toContain("oldest in flight: processing");
  });

  it("says 'none' rather than nothing for a quiet hour", () => {
    const out = plain(formatStats(stats({
      ingests: { by_status: {}, failures: [], oldest_in_flight: null },
    })));
    expect(out).toContain("ingests (60m): none");
  });
});

// ─── command wiring ───────────────────────────────────────────────────────────

describe("addVinylCommands()", () => {
  const getIngestStats = vi.fn();
  const listDetections = vi.fn();
  const listIngests = vi.fn();
  let out: string[];

  beforeEach(() => {
    out = [];
    getIngestStats.mockReset().mockResolvedValue(stats());
    listDetections.mockReset().mockResolvedValue({ detections: [window()], count: 1 });
    listIngests.mockReset().mockResolvedValue({
      ingests: [{
        ingest_id: "i1", source_id: "aswitch", session_id: "s1", sequence: 42,
        status: "processed", error: null, duration_seconds: 15.02,
        sample_rate: 44100, channels: 1, codec: "pcm_s16le", file_path: null,
        captured_at: null, received_at: "2026-09-21T02:00:00.000Z",
        updated_at: "2026-09-21T02:00:05.000Z",
      }],
      count: 1,
    });
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockReset().mockImplementation(function () {
      // Not an arrow: makeClient calls this with `new`.
      return { getIngestStats, listDetections, listIngests };
    });
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      out.push(String(line));
    });
    vi.spyOn(process.stdout, "write").mockImplementation(((t: string) => {
      out.push(String(t));
      return true;
    }) as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function parse(...args: string[]) {
    const program = new Command();
    program.exitOverride();
    addVinylCommands(program);
    return program.parseAsync(["node", "groovenet", "vinyl", ...args]);
  }

  it("registers the three subcommands", () => {
    const program = new Command();
    addVinylCommands(program);
    const vinyl = program.commands.find((c) => c.name() === "vinyl")!;
    expect(vinyl.commands.map((c) => c.name()).sort()).toEqual([
      "detections", "ingests", "status",
    ]);
  });

  // ── status ──

  it("status prints the health summary", async () => {
    await parse("status");
    expect(out.join("\n")).toContain("index: 3783 tracks");
  });

  it("status exits non-zero when the index is empty", async () => {
    // So it composes as a health check.
    getIngestStats.mockResolvedValue(stats({
      index: { engine_registered: true, fingerprint_type: "chromaprint",
               fingerprint_version: "1", indexed_tracks: 0, empty: true },
    }));

    await parse("status");

    expect(process.exitCode).toBe(1);
  });

  it("status exits non-zero when no engine is registered", async () => {
    getIngestStats.mockResolvedValue(stats({
      index: { engine_registered: false, fingerprint_type: null,
               fingerprint_version: null, indexed_tracks: 0, empty: true },
    }));

    await parse("status");

    expect(process.exitCode).toBe(1);
  });

  it("status exits non-zero when the volume is not writable", async () => {
    getIngestStats.mockResolvedValue(stats({ ingest_writable: false }));

    await parse("status");

    expect(process.exitCode).toBe(1);
  });

  it("status leaves the exit code clean when healthy", async () => {
    await parse("status");
    expect(process.exitCode).toBeUndefined();
  });

  it("status passes the window and source through", async () => {
    await parse("status", "--minutes", "15", "--source", "aswitch");
    expect(getIngestStats).toHaveBeenCalledWith({ minutes: 15, source_id: "aswitch" });
  });

  it("status --json emits the raw shape", async () => {
    await parse("status", "--json");
    expect(JSON.parse(out.join(""))).toMatchObject({ window_minutes: 60 });
  });

  // ── detections ──

  it("detections prints a table", async () => {
    await parse("detections");
    expect(out.join("\n")).toContain("Ray Barretto");
  });

  it("detections says so when there are none", async () => {
    listDetections.mockResolvedValue({ detections: [], count: 0 });
    await parse("detections");
    expect(out.join("\n")).toContain("No detections yet");
  });

  it("detections --matched filters to matches", async () => {
    await parse("detections", "--matched");
    expect(listDetections.mock.calls[0][0].matched).toBe(true);
  });

  it("detections --no-match filters to the empty windows", async () => {
    await parse("detections", "--no-match");
    expect(listDetections.mock.calls[0][0].matched).toBe(false);
  });

  it("detections shows both kinds by default", async () => {
    await parse("detections");
    expect(listDetections.mock.calls[0][0].matched).toBeUndefined();
  });

  it("detections passes source, session and limit", async () => {
    await parse("detections", "--source", "aswitch", "--session", "s1", "--limit", "5");
    expect(listDetections.mock.calls[0][0]).toMatchObject({
      source_id: "aswitch", session_id: "s1", limit: 5,
    });
  });

  it("detections --json emits the raw shape", async () => {
    await parse("detections", "--json");
    expect(JSON.parse(out.join("")).count).toBe(1);
  });

  // ── ingests ──

  it("ingests prints a table", async () => {
    await parse("ingests");
    expect(out.join("\n")).toContain("aswitch");
  });

  it("ingests says so when the listener has sent nothing", async () => {
    listIngests.mockResolvedValue({ ingests: [], count: 0 });
    await parse("ingests");
    expect(out.join("\n")).toContain("is the listener posting?");
  });

  it("ingests filters by status", async () => {
    await parse("ingests", "--status", "failed");
    expect(listIngests.mock.calls[0][0].status).toBe("failed");
  });

  it("ingests --json emits the raw shape", async () => {
    await parse("ingests", "--json");
    expect(JSON.parse(out.join("")).count).toBe(1);
  });

  it("ingests renders an in-flight chunk distinctly", async () => {
    listIngests.mockResolvedValue({
      ingests: [{
        ingest_id: "i3", source_id: "aswitch", session_id: null, sequence: null,
        status: "processing", error: null, duration_seconds: null,
        sample_rate: null, channels: null, codec: null, file_path: null,
        captured_at: null, received_at: "2026-09-21T02:00:00.000Z",
        updated_at: "2026-09-21T02:00:00.000Z",
      }],
      count: 1,
    });

    await parse("ingests");

    expect(out.join("\n")).toContain("processing");
  });

  it("ingests renders a failure with its reason", async () => {
    listIngests.mockResolvedValue({
      ingests: [{
        ingest_id: "i2", source_id: "aswitch", session_id: null, sequence: null,
        status: "failed", error: "decode failed", duration_seconds: null,
        sample_rate: null, channels: null, codec: null, file_path: null,
        captured_at: null, received_at: "2026-09-21T02:00:00.000Z",
        updated_at: "2026-09-21T02:00:00.000Z",
      }],
      count: 1,
    });

    await parse("ingests");

    expect(out.join("\n")).toContain("decode failed");
  });

  // ── failures ──

  it.each(["status", "detections", "ingests"])(
    "%s reports a non-Error rejection rather than swallowing it",
    async (sub) => {
      getIngestStats.mockRejectedValue("driver exploded");
      listDetections.mockRejectedValue("driver exploded");
      listIngests.mockRejectedValue("driver exploded");
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation((() => undefined) as never);

      await parse(sub);

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining("driver exploded")
      );
      expect(exit).toHaveBeenCalledWith(1);
    }
  );

  it.each(["status", "detections", "ingests"])(
    "%s reports an API failure on stderr and exits 1",
    async (sub) => {
      const boom = new Error("API Error: connection refused");
      getIngestStats.mockRejectedValue(boom);
      listDetections.mockRejectedValue(boom);
      listIngests.mockRejectedValue(boom);
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation((() => undefined) as never);

      await parse(sub);

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining("connection refused")
      );
      expect(exit).toHaveBeenCalledWith(1);
    }
  );
});

describe("makeClient()", () => {
  afterEach(() => vi.clearAllMocks());

  it("builds a client from the stored config", () => {
    loadConfig.mockReturnValue({
      api_base: "https://groovenet.home.arpa/api",
      api_key: "secret",
      insecure_tls: true,
    });

    makeClient();

    expect(GroovenetClientMock).toHaveBeenCalledWith({
      baseUrl: "https://groovenet.home.arpa/api",
      apiKey: "secret",
      insecureTls: true,
    });
  });
});
