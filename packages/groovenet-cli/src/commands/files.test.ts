import { afterEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({ loadConfig, GroovenetClient: GroovenetClientMock }));

import { Command } from "commander";
import type { AudioMetadataBackfillRun } from "@groovenet/client";
import {
  addFilesCommands,
  formatProgress,
  formatReport,
  runFilesBackfill,
  settled,
} from "./files.js";

function run(overrides: Partial<AudioMetadataBackfillRun> = {}): AudioMetadataBackfillRun {
  return {
    run_id: "run-1",
    total: 10,
    probed: 0,
    skipped: 0,
    missing_files: 0,
    probe_failures: 0,
    sources: { apple_music: 0, youtube: 0, soundcloud: 0, upload: 0, unknown: 0 },
    weak_youtube_hints: 0,
    errors: [],
    started_at: 1,
    updated_at: 1,
    complete: false,
    ...overrides,
  };
}

function io() {
  const lines: string[] = [];
  const writes: string[] = [];
  return { lines, writes, log: (l: string) => lines.push(l), write: (t: string) => writes.push(t) };
}

afterEach(() => vi.restoreAllMocks());

describe("files backfill formatting", () => {
  it("counts settled outcomes", () => {
    expect(settled(run({ probed: 1, skipped: 2, missing_files: 3, probe_failures: 4 }))).toBe(10);
  });

  it("draws progress, and a full bar for an empty library", () => {
    expect(formatProgress(run({ probed: 5 }), 10)).toContain("5/10  █████░░░░░");
    expect(formatProgress(run({ total: 0 }), 4)).toContain("0/0  ████");
  });

  it("reports outcomes and sources, flagging problems", () => {
    const text = formatReport(
      run({
        probed: 5,
        missing_files: 2,
        probe_failures: 1,
        sources: { apple_music: 3, youtube: 1, soundcloud: 0, upload: 0, unknown: 1 },
        weak_youtube_hints: 1,
      }),
    ).join("\n");
    expect(text).toContain("5 probed");
    expect(text).toContain("2 missing files");
    expect(text).toContain("1 probe failures");
    expect(text).toContain("apple_music 3");
    expect(text).toContain("unknown 1");
    expect(formatReport(run()).join("\n")).toContain("0 missing files");
  });
});

describe("runFilesBackfill", () => {
  it("passes options through, polls to completion and prints the report", async () => {
    const out = io();
    const client = {
      startAudioMetadataBackfill: vi.fn().mockResolvedValue(run()),
      getAudioMetadataBackfillRun: vi
        .fn()
        .mockResolvedValueOnce(run({ probed: 5, errors: ["t1: boom"] }))
        .mockResolvedValueOnce(
          run({ probed: 9, probe_failures: 1, errors: ["t1: boom"], complete: true }),
        ),
    };

    const code = await runFilesBackfill(client, { force: true, friendId: 3, pollInterval: 0 }, out);

    expect(client.startAudioMetadataBackfill).toHaveBeenCalledWith({ force: true, friend_id: 3 });
    expect(code).toBe(1);
    expect(out.lines.filter((l) => l.includes("boom"))).toHaveLength(1);
    expect(out.lines.join("\n")).toContain("9 probed");
  });

  it("polls once a second by default", async () => {
    vi.useFakeTimers();
    const client = {
      startAudioMetadataBackfill: vi.fn().mockResolvedValue(run()),
      getAudioMetadataBackfillRun: vi.fn().mockResolvedValue(run({ probed: 10, complete: true })),
    };
    const pending = runFilesBackfill(client, {}, io());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(0);
    vi.useRealTimers();
  });

  it("exits 0 when nothing failed and sends an empty request by default", async () => {
    const client = {
      startAudioMetadataBackfill: vi.fn().mockResolvedValue(run({ total: 0, complete: true })),
      getAudioMetadataBackfillRun: vi.fn(),
    };
    expect(await runFilesBackfill(client, {}, io())).toBe(0);
    expect(client.startAudioMetadataBackfill).toHaveBeenCalledWith({});
    expect(client.getAudioMetadataBackfillRun).not.toHaveBeenCalled();
  });

  it("returns right after starting with --no-wait", async () => {
    const out = io();
    const client = {
      startAudioMetadataBackfill: vi.fn().mockResolvedValue(run()),
      getAudioMetadataBackfillRun: vi.fn(),
    };
    expect(await runFilesBackfill(client, { wait: false }, out)).toBe(0);
    expect(out.lines.join("\n")).toContain("run run-1");

    const jsonOut = io();
    await runFilesBackfill(client, { wait: false, json: true }, jsonOut);
    expect(JSON.parse(jsonOut.writes.join(""))).toMatchObject({ run_id: "run-1" });
  });

  it("prints only JSON when asked", async () => {
    const out = io();
    const client = {
      startAudioMetadataBackfill: vi.fn().mockResolvedValue(run()),
      getAudioMetadataBackfillRun: vi.fn().mockResolvedValue(run({ probed: 10, complete: true })),
    };
    expect(await runFilesBackfill(client, { json: true, pollInterval: 0 }, out)).toBe(0);
    expect(out.lines).toEqual([]);
    expect(JSON.parse(out.writes.join(""))).toMatchObject({ probed: 10 });
  });
});

describe("files command wiring", () => {
  function program() {
    const p = new Command();
    p.exitOverride();
    addFilesCommands(p);
    return p;
  }

  it("runs backfill against a client built from config", async () => {
    loadConfig.mockReturnValue({ api_base: "http://x", api_key: "k", insecure_tls: false });
    const instance = {
      startAudioMetadataBackfill: vi.fn().mockResolvedValue(run({ total: 0, complete: true })),
    };
    GroovenetClientMock.mockImplementation(function () {
      return instance;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program().parseAsync([
      "node",
      "groovenet",
      "files",
      "backfill",
      "--force",
      "--no-wait",
      "--poll-interval",
      "5",
    ]);

    expect(instance.startAudioMetadataBackfill).toHaveBeenCalledWith({ force: true });
    process.exitCode = undefined;
  });

  it("prints the error and exits 1 on failure", async () => {
    loadConfig.mockReturnValue({ api_base: "http://x" });
    GroovenetClientMock.mockImplementation(function () {
      return { startAudioMetadataBackfill: vi.fn().mockRejectedValue(new Error("down")) };
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await program().parseAsync(["node", "groovenet", "files", "backfill"]);

    expect(exit).toHaveBeenCalledWith(1);

    GroovenetClientMock.mockImplementation(function () {
      return { startAudioMetadataBackfill: vi.fn().mockRejectedValue("plain") };
    });
    await program().parseAsync(["node", "groovenet", "files", "backfill"]);
    expect(exit).toHaveBeenCalledTimes(2);
  });
});
