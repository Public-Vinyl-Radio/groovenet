import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const GroovenetClientMock = vi.hoisted(() => vi.fn());

vi.mock("@groovenet/client", () => ({
  loadConfig,
  GroovenetClient: GroovenetClientMock,
}));

import chalk from "chalk";
import { Command } from "commander";
import type { ArtistReconcileResponse } from "@groovenet/client";
import { addArtistsCommands, formatArtistReconcile, runArtistReconcile } from "./artists.js";

chalk.level = 0;

function report(overrides: Partial<ArtistReconcileResponse> = {}): ArtistReconcileResponse {
  return {
    dry_run: true,
    friend_id: null,
    baseline: {
      albums: 2275,
      distinct_strings: 1517,
      spelling_groups: 7,
      inversions: 99,
      various: 174,
      unknown_artist: 13,
    },
    albums: { pending: 2275, linked: 0, failed: 0 },
    tracks: { pending: 20000, linked: 0, failed: 0 },
    credits: { discogs: 21000, legacy: 1500 },
    artists: { matched_by_discogs_id: 12000, matched_by_name: 8000, created: 2500 },
    sort_names: { pending: 99, updated: 0 },
    review_queue: [{ credited_as: "Earth, Wind & Fire", albums: 2, tracks: 20 }],
    errors: [],
    ...overrides,
  };
}

describe("formatArtistReconcile", () => {
  it("prints the baseline, the plan and the review queue on a dry run", () => {
    const text = formatArtistReconcile(report()).join("\n");
    expect(text).toContain("Artist reconcile (dry run) — all friends");
    expect(text).toContain(
      "2,275 albums, 1,517 distinct strings, 7 spelling groups, 99 inversions, 174 Various, 13 Unknown Artist",
    );
    expect(text).toContain("Albums: 2,275 to link");
    expect(text).toContain("Tracks: 20,000 to link");
    expect(text).toContain("21,000 from Discogs, 1,500 from the artist string");
    expect(text).toContain("12,000 matched by Discogs id, 8,000 by name or alias, 2,500 new");
    expect(text).toContain('Sort names: 99 to file as "X, The"');
    expect(text).toContain("Review queue: 1");

    expect(text.replace(/\x1b\[[0-9;]*m/g, "")).toMatch(/Earth, Wind & Fire\W+2\W+20/);
    expect(text).toContain("Nothing written.");
  });

  it("prints what a run linked, its failures and an empty queue", () => {
    const text = formatArtistReconcile(
      report({
        dry_run: false,
        friend_id: 6,
        albums: { pending: 2, linked: 2, failed: 0 },
        tracks: { pending: 3, linked: 2, failed: 1 },
        review_queue: [],
        errors: [{ kind: "track", id: "6:1-A1", message: "locked" }],
      }),
    ).join("\n");
    expect(text).toContain("Artist reconcile — friend 6");
    expect(text).toContain("Albums: 2 linked of 2");
    expect(text).toContain("Tracks: 2 linked of 3, 1 failed");
    expect(text).toContain('Sort names: 0 filed as "X, The" of 99');
    expect(text).toContain("Review queue: empty");
    expect(text).toContain("track 6:1-A1: locked");
    expect(text).not.toContain("Nothing");
  });

  it("says when a run had nothing to do", () => {
    const zero = { pending: 0, linked: 0, failed: 0 };
    const lines = formatArtistReconcile(report({ dry_run: false, albums: zero, tracks: zero }));
    expect(lines.at(-1)).toBe("Nothing to do.");
  });
});

describe("runArtistReconcile", () => {
  const io = { log: vi.fn(), write: vi.fn() };
  beforeEach(() => {
    io.log.mockReset();
    io.write.mockReset();
    loadConfig.mockReturnValue({ default_friend_id: 6 });
  });

  it("sends a dry run scoped to the default friend", async () => {
    const client = { reconcileArtists: vi.fn().mockResolvedValue(report()) };
    expect(await runArtistReconcile(client, { dryRun: true }, io)).toBe(0);
    expect(client.reconcileArtists).toHaveBeenCalledWith({ dry_run: true, friend_id: 6 });
    expect(io.log).toHaveBeenCalled();
  });

  it("sends a full run for everyone and prints JSON", async () => {
    const result = report({ dry_run: false });
    const client = { reconcileArtists: vi.fn().mockResolvedValue(result) };
    expect(await runArtistReconcile(client, { allFriends: true, json: true }, io)).toBe(0);
    expect(client.reconcileArtists).toHaveBeenCalledWith({});
    expect(io.write).toHaveBeenCalledWith(JSON.stringify(result, null, 2) + "\n");
    expect(io.log).not.toHaveBeenCalled();
  });

  it("exits 1 when any row failed", async () => {
    const client = {
      reconcileArtists: vi
        .fn()
        .mockResolvedValue(
          report({ dry_run: false, albums: { pending: 1, linked: 0, failed: 1 } }),
        ),
    };
    expect(await runArtistReconcile(client, {}, io)).toBe(1);
  });
});

describe("artists command", () => {
  const methods = { reconcileArtists: vi.fn() };

  beforeEach(() => {
    methods.reconcileArtists.mockReset().mockResolvedValue(report());
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
    addArtistsCommands(program);
    return program.parseAsync(["node", "groovenet", "artists", ...args]);
  }

  it("reconcile forwards its flags", async () => {
    await parse("reconcile", "--dry-run", "--friend-id", "3");
    expect(methods.reconcileArtists).toHaveBeenCalledWith({ dry_run: true, friend_id: 3 });
    expect(process.exitCode).toBe(0);
  });

  it("reconcile rejects a bad friend id", async () => {
    await expect(parse("reconcile", "--friend-id", "0")).rejects.toThrow();
    expect(methods.reconcileArtists).not.toHaveBeenCalled();
  });

  it("reconcile reports API errors and exits 1", async () => {
    methods.reconcileArtists.mockRejectedValue(new Error("API Error: Artist reconcile failed"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await parse("reconcile", "--friend-id", "3", "--all-friends");
    expect(exit).toHaveBeenCalledWith(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("--friend-id or --all-friends"),
    );
  });

  it("reconcile reports a non-Error failure", async () => {
    methods.reconcileArtists.mockRejectedValue("boom");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await parse("reconcile");
    expect(exit).toHaveBeenCalledWith(1);
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});
