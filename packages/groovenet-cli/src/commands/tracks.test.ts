import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  client: { searchTracks: vi.fn() },
  Client: vi.fn(),
  printTracks: vi.fn(),
  printJson: vi.fn(),
  printError: vi.fn(),
}));

vi.mock("@groovenet/client", () => ({
  loadConfig: mocks.loadConfig,
  GroovenetClient: mocks.Client,
}));
vi.mock("../output.js", () => ({
  printTracks: mocks.printTracks,
  printTrack: vi.fn(),
  printJson: mocks.printJson,
  printSuccess: vi.fn(),
  printError: mocks.printError,
}));

import { Command } from "commander";
import { addTracksCommands } from "./tracks.js";

const result = (extra: Record<string, unknown> = {}) => ({
  tracks: [{ track_id: "t1" }],
  estimatedTotalHits: 1,
  offset: 0,
  limit: 20,
  processingTimeMs: 3,
  ...extra,
});

function run(...args: string[]) {
  const program = new Command().exitOverride();
  addTracksCommands(program);
  return program.parseAsync(["node", "test", "tracks", "search", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadConfig.mockReturnValue({ api_base: "http://example.test/api" });
  mocks.Client.mockImplementation(function () { return mocks.client; });
  mocks.client.searchTracks.mockResolvedValue(result());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

describe("tracks search --mode", () => {
  it("forwards the mode", async () => {
    await run("dusty 70s cumbia", "--mode", "semantic", "--limit", "10");
    expect(mocks.client.searchTracks).toHaveBeenCalledWith({
      query: "dusty 70s cumbia",
      limit: 10,
      mode: "semantic",
      filters: undefined,
    });
    expect(mocks.printTracks).toHaveBeenCalledWith([{ track_id: "t1" }], false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("leaves the mode unset by default", async () => {
    await run("blue", "--json");
    expect(mocks.client.searchTracks).toHaveBeenCalledWith(expect.objectContaining({ mode: undefined }));
    expect(mocks.printJson).toHaveBeenCalledWith(result());
  });

  it("warns when hybrid fell back to keyword results", async () => {
    mocks.client.searchTracks.mockResolvedValue(result({ mode: "hybrid", degraded: true }));
    await run("x", "--mode", "hybrid");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("keyword results only"));
  });

  it("rejects an unknown mode before calling the API", async () => {
    await expect(run("x", "--mode", "vibes")).rejects.toThrow(/lexical, semantic, hybrid/);
    expect(mocks.client.searchTracks).not.toHaveBeenCalled();
  });
});

describe("tracks search filters (#412)", () => {
  it("forwards BPM, key and minimum rating", async () => {
    await run("house", "--bpm-min", "120", "--bpm-max", "126.5", "--key", "A minor", "--rating", "4");
    expect(mocks.client.searchTracks).toHaveBeenCalledWith({
      query: "house",
      limit: 20,
      mode: undefined,
      filters: { bpm_min: 120, bpm_max: 126.5, key: "A minor", star_rating: 4 },
    });
  });

  it("rejects a non-numeric rating before calling the API", async () => {
    await expect(run("x", "--rating", "abc")).rejects.toThrow(/expected a number/);
    expect(mocks.client.searchTracks).not.toHaveBeenCalled();
  });
});
