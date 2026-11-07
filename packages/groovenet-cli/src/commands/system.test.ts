import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({ loadConfig, GroovenetClient: GroovenetClientMock }));

import { Command } from "commander";
import type { OrphansResponse } from "@groovenet/client";
import { addSystemCommands, consoleIO, formatOrphans, runOrphans } from "./system.js";

const page = <T>(items: T[], total = items.length) => ({ items, total, limit: 10, offset: 0 });
function orphans(patch: Partial<OrphansResponse> = {}): OrphansResponse {
  return {
    running: false,
    last_error: null,
    last_scan: {
      scanned_at: "2026-11-06T12:00:00.000Z",
      duration_ms: 2500,
      orphan_file_count: 3,
      orphan_file_bytes: 2048,
      missing_track_count: 2,
    },
    files: page([{ path: "a.mp3", size_bytes: 1024, modified_at: "x" }], 3),
    tracks: page(
      [
        {
          track_id: "t",
          username: null,
          title: "Gone",
          artist: "Ghost",
          local_audio_url: "g.mp3",
        },
      ],
      2,
    ),
    ...patch,
  };
}
const text = (lines: string[]) => lines.join("\n");

describe("formatOrphans()", () => {
  it("summarises both lists and what is not shown", () => {
    const out = text(formatOrphans(orphans()));
    expect(out).toContain("took 2.5s");
    expect(out).toContain("Files with no track: 3 (2.0 KB)");
    expect(out).toContain("a.mp3");
    expect(out).toContain("… 2 more");
    expect(out).toContain("Tracks pointing at missing files: 2");
    expect(out).toContain("Ghost — Gone");
    expect(out).toContain("… 1 more");
  });

  it("shows no 'more' lines when everything is listed, and a failed scan", () => {
    const out = text(
      formatOrphans(
        orphans({
          last_error: "disk gone",
          files: page([]),
          tracks: page([]),
        }),
      ),
    );
    expect(out).not.toContain("more");
    expect(out).toContain("last scan failed: disk gone");
  });

  it("asks for a scan when there is none", () => {
    expect(text(formatOrphans(orphans({ last_scan: null })))).toContain("Run with --scan");
  });
});

describe("runOrphans()", () => {
  const io = () => ({ log: vi.fn(), write: vi.fn() });

  it("prints the latest result without scanning", async () => {
    const client = {
      getStorageOrphans: vi.fn().mockResolvedValue(orphans()),
      startStorageOrphanScan: vi.fn(),
    };
    const out = io();
    expect(await runOrphans(client, { limit: 5 }, out)).toBe(0);
    expect(client.startStorageOrphanScan).not.toHaveBeenCalled();
    expect(client.getStorageOrphans).toHaveBeenCalledWith({ limit: 5 });
    expect(out.log).toHaveBeenCalled();
  });

  it("--scan starts a scan and polls until it finishes", async () => {
    const client = {
      getStorageOrphans: vi
        .fn()
        .mockResolvedValueOnce(orphans({ running: true }))
        .mockResolvedValueOnce(orphans({ running: true }))
        .mockResolvedValue(orphans()),
      startStorageOrphanScan: vi.fn().mockResolvedValue({ started: true, running: true }),
    };
    await runOrphans(client, { scan: true, pollInterval: 1 }, io());
    expect(client.startStorageOrphanScan).toHaveBeenCalledOnce();
    expect(client.getStorageOrphans).toHaveBeenCalledTimes(3);
  });

  it("--scan polls at one second by default", async () => {
    vi.useFakeTimers();
    try {
      const client = {
        getStorageOrphans: vi
          .fn()
          .mockResolvedValueOnce(orphans({ running: true }))
          .mockResolvedValue(orphans()),
        startStorageOrphanScan: vi.fn().mockResolvedValue({ started: false, running: true }),
      };
      const done = runOrphans(client, { scan: true }, io());
      await vi.advanceTimersByTimeAsync(1000);
      await done;
      expect(client.getStorageOrphans).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("--json prints the raw response", async () => {
    const client = {
      getStorageOrphans: vi.fn().mockResolvedValue(orphans()),
      startStorageOrphanScan: vi.fn(),
    };
    const out = io();
    await runOrphans(client, { json: true }, out);
    expect(JSON.parse(out.write.mock.calls[0][0])).toEqual(orphans());
    expect(out.log).not.toHaveBeenCalled();
  });
});

describe("consoleIO", () => {
  afterEach(() => vi.restoreAllMocks());
  it("writes to the console and stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    consoleIO.log("hi");
    consoleIO.write("raw");
    expect(log).toHaveBeenCalledWith("hi");
    expect(write).toHaveBeenCalledWith("raw");
  });
});

describe("addSystemCommands()", () => {
  const getStorageOrphans = vi.fn();
  const startStorageOrphanScan = vi.fn();

  beforeEach(() => {
    getStorageOrphans.mockReset().mockResolvedValue(orphans());
    startStorageOrphanScan.mockReset().mockResolvedValue({ started: true, running: true });
    loadConfig.mockReturnValue({ api_base: "http://localhost:3000/api" });
    GroovenetClientMock.mockImplementation(function () {
      return { getStorageOrphans, startStorageOrphanScan };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function parse(...args: string[]) {
    const program = new Command();
    program.exitOverride();
    addSystemCommands(program);
    return program.parseAsync(["node", "groovenet", "system", ...args]);
  }

  it("lists orphans with the default page size", async () => {
    await parse("orphans");
    expect(getStorageOrphans).toHaveBeenCalledWith({ limit: 10 });
    expect(startStorageOrphanScan).not.toHaveBeenCalled();
  });

  it("scans first with --scan", async () => {
    await parse("orphans", "--scan", "--limit", "3", "--poll-interval", "1");
    expect(startStorageOrphanScan).toHaveBeenCalled();
    expect(getStorageOrphans).toHaveBeenCalledWith({ limit: 3 });
  });

  it("reports an error and exits 1", async () => {
    getStorageOrphans.mockRejectedValue(new Error("unreachable"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await parse("orphans");
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("unreachable"));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("reports a non-Error failure", async () => {
    getStorageOrphans.mockRejectedValue("plain");
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await parse("orphans");
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("plain"));
  });
});
