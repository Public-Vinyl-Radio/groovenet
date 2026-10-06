import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  client: { searchAlbums: vi.fn() },
  Client: vi.fn(),
}));

vi.mock("@groovenet/client", () => ({
  loadConfig: mocks.loadConfig,
  GroovenetClient: mocks.Client,
}));
vi.mock("../output.js", () => ({
  printJson: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
  printTracks: vi.fn(),
}));

import { Command } from "commander";
import { addAlbumsCommands } from "./albums.js";

function run(...args: string[]) {
  const program = new Command().exitOverride();
  addAlbumsCommands(program);
  return program.parseAsync(["node", "test", "albums", "list", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadConfig.mockReturnValue({ api_base: "http://example.test/api" });
  mocks.Client.mockImplementation(function () { return mocks.client; });
  mocks.client.searchAlbums.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => { vi.restoreAllMocks(); });

describe("albums list --genre (#375)", () => {
  it("collects repeated genres", async () => {
    await run("--genre", "latin", "--genre", "jazz");
    expect(mocks.client.searchAlbums).toHaveBeenCalledWith(
      expect.objectContaining({ q: "", genre: ["latin", "jazz"] })
    );
  });

  it("sends no genre without the option", async () => {
    await run("blue");
    expect(mocks.client.searchAlbums).toHaveBeenCalledWith(
      expect.objectContaining({ q: "blue", genre: undefined })
    );
  });
});
