import { afterEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());
vi.mock("@groovenet/client", () => ({ loadConfig, GroovenetClient: GroovenetClientMock }));

import { Command } from "commander";
import type {
  AudioMetadataBackfillRun,
  EmbeddedTagsBackfillRun,
  IsrcBackfillRun,
} from "@groovenet/client";
import {
  addFilesCommands,
  formatProgress,
  formatReport,
  formatIsrcProgress,
  formatIsrcReport,
  formatTagsProgress,
  formatTagsReport,
  isrcSettled,
  runFilesBackfill,
  runFilesIsrc,
  runFilesTags,
  settled,
  tagsSettled,
} from "./files.js";

function tagsRun(overrides: Partial<EmbeddedTagsBackfillRun> = {}): EmbeddedTagsBackfillRun {
  return {
    run_id: "tags-1",
    total: 10,
    read: 0,
    skipped: 0,
    missing_files: 0,
    read_failures: 0,
    with_composer: 0,
    with_genre: 0,
    with_lyrics: 0,
    queued_embeddings: 0,
    errors: [],
    started_at: 1,
    updated_at: 1,
    complete: false,
    ...overrides,
  };
}

function isrcRun(overrides: Partial<IsrcBackfillRun> = {}): IsrcBackfillRun {
  return {
    run_id: "isrc-1",
    total: 10,
    filled: 0,
    skipped: 0,
    no_link: 0,
    not_found: 0,
    failed: 0,
    dry_run: false,
    errors: [],
    started_at: 1,
    updated_at: 1,
    complete: false,
    ...overrides,
  };
}

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

describe("files tags", () => {
  it("formats progress and the report", () => {
    expect(tagsSettled(tagsRun({ read: 1, skipped: 2, missing_files: 3, read_failures: 4 }))).toBe(
      10,
    );
    expect(formatTagsProgress(tagsRun({ read: 5 }), 10)).toContain("5/10  █████░░░░░");
    expect(formatTagsProgress(tagsRun({ total: 0 }), 4)).toContain("0/0  ████");
    const text = formatTagsReport(
      tagsRun({
        read: 5,
        missing_files: 2,
        read_failures: 1,
        with_composer: 4,
        with_genre: 5,
        with_lyrics: 0,
        queued_embeddings: 0,
      }),
    ).join("\n");
    expect(text).toContain("5 read");
    expect(text).toContain("2 missing files");
    expect(text).toContain("1 failures");
    expect(text).toContain("composer 4   genre 5   lyrics 0");
    expect(formatTagsReport(tagsRun()).join("\n")).toContain("0 missing files");
    expect(text).not.toContain("queued for new embeddings");
    expect(formatTagsReport(tagsRun({ queued_embeddings: 3 })).join("\n")).toContain(
      "3 track(s) queued for new embeddings",
    );
  });

  it("passes options through, polls to completion and exits 1 on failures", async () => {
    const out = io();
    const client = {
      startEmbeddedTagsBackfill: vi.fn().mockResolvedValue(tagsRun()),
      getEmbeddedTagsBackfillRun: vi
        .fn()
        .mockResolvedValueOnce(tagsRun({ read: 5, errors: ["t1: boom"] }))
        .mockResolvedValueOnce(
          tagsRun({ read: 9, read_failures: 1, errors: ["t1: boom"], complete: true }),
        ),
    };
    const code = await runFilesTags(client, { force: true, friendId: 3, pollInterval: 0 }, out);
    expect(client.startEmbeddedTagsBackfill).toHaveBeenCalledWith({ force: true, friend_id: 3 });
    expect(code).toBe(1);
    expect(out.lines.filter((l) => l.includes("boom"))).toHaveLength(1);
    expect(out.lines.join("\n")).toContain("9 read");
  });

  it("polls once a second by default and sends an empty request", async () => {
    vi.useFakeTimers();
    const client = {
      startEmbeddedTagsBackfill: vi.fn().mockResolvedValue(tagsRun()),
      getEmbeddedTagsBackfillRun: vi.fn().mockResolvedValue(tagsRun({ read: 10, complete: true })),
    };
    const pending = runFilesTags(client, {}, io());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(0);
    expect(client.startEmbeddedTagsBackfill).toHaveBeenCalledWith({});
    vi.useRealTimers();
  });

  it("returns right after starting with --no-wait, as text or JSON", async () => {
    const client = {
      startEmbeddedTagsBackfill: vi.fn().mockResolvedValue(tagsRun()),
      getEmbeddedTagsBackfillRun: vi.fn(),
    };
    const out = io();
    expect(await runFilesTags(client, { wait: false }, out)).toBe(0);
    expect(out.lines.join("\n")).toContain("run tags-1");
    const jsonOut = io();
    await runFilesTags(client, { wait: false, json: true }, jsonOut);
    expect(JSON.parse(jsonOut.writes.join(""))).toMatchObject({ run_id: "tags-1" });
    expect(client.getEmbeddedTagsBackfillRun).not.toHaveBeenCalled();
  });

  it("prints only JSON when asked", async () => {
    const out = io();
    const client = {
      startEmbeddedTagsBackfill: vi.fn().mockResolvedValue(tagsRun()),
      getEmbeddedTagsBackfillRun: vi.fn().mockResolvedValue(tagsRun({ read: 10, complete: true })),
    };
    expect(await runFilesTags(client, { json: true, pollInterval: 0 }, out)).toBe(0);
    expect(out.lines).toEqual([]);
    expect(JSON.parse(out.writes.join(""))).toMatchObject({ read: 10 });
  });

  it("is wired as `files tags`, and reports errors with exit 1", async () => {
    const p = () => {
      const c = new Command();
      c.exitOverride();
      addFilesCommands(c);
      return c;
    };
    loadConfig.mockReturnValue({ api_base: "http://x", api_key: "k", insecure_tls: false });
    const instance = {
      startEmbeddedTagsBackfill: vi.fn().mockResolvedValue(tagsRun({ total: 0, complete: true })),
    };
    GroovenetClientMock.mockImplementation(function () {
      return instance;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await p().parseAsync(["node", "groovenet", "files", "tags", "--force", "--no-wait"]);
    expect(instance.startEmbeddedTagsBackfill).toHaveBeenCalledWith({ force: true });
    process.exitCode = undefined;

    GroovenetClientMock.mockImplementation(function () {
      return { startEmbeddedTagsBackfill: vi.fn().mockRejectedValue(new Error("down")) };
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await p().parseAsync(["node", "groovenet", "files", "tags"]);
    GroovenetClientMock.mockImplementation(function () {
      return { startEmbeddedTagsBackfill: vi.fn().mockRejectedValue("plain") };
    });
    await p().parseAsync(["node", "groovenet", "files", "tags"]);
    expect(exit).toHaveBeenCalledTimes(2);
  });
});

describe("files isrc (#1156)", () => {
  it("counts settled outcomes and draws progress", () => {
    const r = isrcRun({ filled: 1, skipped: 2, no_link: 3, not_found: 1, failed: 1, total: 16 });
    expect(isrcSettled(r)).toBe(8);
    expect(formatIsrcProgress(r)).toContain("8/16");
    expect(formatIsrcProgress(isrcRun({ total: 0 }))).toContain("0/0");
  });

  it("reports every outcome, and says so on a dry run", () => {
    const text = formatIsrcReport(
      isrcRun({ filled: 5, no_link: 2, not_found: 1, failed: 1, dry_run: true }),
    ).join("\n");
    expect(text).toContain("5 would be filled");
    expect(text).toContain("2 no Apple Music link");
    expect(text).toContain("1 no ISRC returned");
    expect(text).toContain("1 failed");
    expect(text).toContain("nothing was stored");
    const quiet = formatIsrcReport(isrcRun({ filled: 1 })).join("\n");
    expect(quiet).toContain("1 filled");
    expect(quiet).toContain("0 no ISRC returned");
    expect(quiet).toContain("0 failed");
    expect(quiet).not.toContain("Dry run");
  });

  it("passes options through, polls to completion and exits 1 on failures", async () => {
    const out = io();
    const client = {
      startIsrcBackfill: vi.fn().mockResolvedValue(isrcRun()),
      getIsrcBackfillRun: vi
        .fn()
        .mockResolvedValueOnce(isrcRun({ filled: 5, errors: ["t1+1: boom"] }))
        .mockResolvedValueOnce(
          isrcRun({ filled: 8, failed: 2, errors: ["t1+1: boom"], complete: true }),
        ),
    };
    const code = await runFilesIsrc(
      client,
      { force: true, friendId: 3, limit: 20, dryRun: true, pollInterval: 0 },
      out,
    );
    expect(client.startIsrcBackfill).toHaveBeenCalledWith({
      force: true,
      friend_id: 3,
      limit: 20,
      dry_run: true,
    });
    expect(code).toBe(1);
    expect(out.lines.filter((l) => l.includes("boom"))).toHaveLength(1);
    expect(out.lines.join("\n")).toContain("8 filled");
  });

  it("polls once a second by default and sends an empty request", async () => {
    vi.useFakeTimers();
    const client = {
      startIsrcBackfill: vi.fn().mockResolvedValue(isrcRun()),
      getIsrcBackfillRun: vi.fn().mockResolvedValue(isrcRun({ filled: 10, complete: true })),
    };
    const pending = runFilesIsrc(client, {}, io());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe(0);
    expect(client.startIsrcBackfill).toHaveBeenCalledWith({});
    vi.useRealTimers();
  });

  it("returns right after starting with --no-wait, as text or JSON", async () => {
    const client = {
      startIsrcBackfill: vi.fn().mockResolvedValue(isrcRun()),
      getIsrcBackfillRun: vi.fn(),
    };
    const out = io();
    expect(await runFilesIsrc(client, { wait: false }, out)).toBe(0);
    expect(out.lines.join("\n")).toContain("run isrc-1");
    const jsonOut = io();
    await runFilesIsrc(client, { wait: false, json: true }, jsonOut);
    expect(JSON.parse(jsonOut.writes.join(""))).toMatchObject({ run_id: "isrc-1" });
    expect(client.getIsrcBackfillRun).not.toHaveBeenCalled();
  });

  it("prints only JSON when asked", async () => {
    const out = io();
    const client = {
      startIsrcBackfill: vi.fn().mockResolvedValue(isrcRun()),
      getIsrcBackfillRun: vi.fn().mockResolvedValue(isrcRun({ filled: 10, complete: true })),
    };
    expect(await runFilesIsrc(client, { json: true, pollInterval: 0 }, out)).toBe(0);
    expect(out.lines).toEqual([]);
    expect(JSON.parse(out.writes.join(""))).toMatchObject({ filled: 10 });
  });
});

describe("files isrc wiring (#1156)", () => {
  it("is wired as `files isrc`, and reports errors with exit 1", async () => {
    const p = () => {
      const c = new Command();
      c.exitOverride();
      addFilesCommands(c);
      return c;
    };
    loadConfig.mockReturnValue({ api_base: "http://x", api_key: "k", insecure_tls: false });
    const instance = {
      startIsrcBackfill: vi.fn().mockResolvedValue(isrcRun({ total: 0, complete: true })),
    };
    GroovenetClientMock.mockImplementation(function () {
      return instance;
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await p().parseAsync([
      "node",
      "groovenet",
      "files",
      "isrc",
      "--limit",
      "5",
      "--dry-run",
      "--no-wait",
    ]);
    expect(instance.startIsrcBackfill).toHaveBeenCalledWith({ limit: 5, dry_run: true });
    process.exitCode = undefined;

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
    GroovenetClientMock.mockImplementation(function () {
      return { startIsrcBackfill: vi.fn().mockRejectedValue(new Error("down")) };
    });
    await p().parseAsync(["node", "groovenet", "files", "isrc"]);
    GroovenetClientMock.mockImplementation(function () {
      return { startIsrcBackfill: vi.fn().mockRejectedValue("plain") };
    });
    await p().parseAsync(["node", "groovenet", "files", "isrc"]);
    expect(exit).toHaveBeenCalledTimes(2);
  });
});
