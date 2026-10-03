import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  client: { logPlaylistSpins: vi.fn() },
  Client: vi.fn(),
  printJson: vi.fn(),
  printSuccess: vi.fn(),
  printError: vi.fn(),
}));

vi.mock("@groovenet/client", () => ({
  loadConfig: mocks.loadConfig,
  GroovenetClient: mocks.Client,
}));
vi.mock("../output.js", () => ({
  printPlaylists: vi.fn(),
  printTracks: vi.fn(),
  printJson: mocks.printJson,
  printSuccess: mocks.printSuccess,
  printError: mocks.printError,
}));

import { Command } from "commander";
import { addPlaylistsCommands } from "./playlists.js";

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  mocks.loadConfig.mockReturnValue({ api_base: "http://example.test/api" });
  mocks.Client.mockImplementation(function () { return mocks.client; });
  mocks.client.logPlaylistSpins.mockResolvedValue({
    playlist_id: 9,
    performance_id: 4,
    performed_at: "2026-10-01T20:00:00.000Z",
    created: 2,
    skipped: 0,
  });
});

afterEach(() => { process.exitCode = undefined; });

describe("playlists log-spins", () => {
  it("forwards performance and derivation options and supports JSON", async () => {
    const program = new Command().exitOverride();
    addPlaylistsCommands(program);
    await program.parseAsync([
      "node", "test", "playlists", "log-spins", "9",
      "--performance", "4", "--derivation", "11111111-1111-4111-8111-111111111111", "--json",
    ]);
    expect(mocks.client.logPlaylistSpins).toHaveBeenCalledWith("9", {
      performance_id: 4,
      derivation_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(mocks.printJson).toHaveBeenCalledWith(expect.objectContaining({ created: 2 }));
  });

  it("normalizes a supplied timestamp", async () => {
    const program = new Command().exitOverride();
    addPlaylistsCommands(program);
    await program.parseAsync(["node", "test", "playlists", "log-spins", "9", "--at", "2026-10-01T20:00:00Z"]);
    expect(mocks.client.logPlaylistSpins).toHaveBeenCalledWith("9", {
      performed_at: "2026-10-01T20:00:00.000Z",
    });
    expect(mocks.printSuccess).toHaveBeenCalledWith("Logged 2 spins.");
  });

  it("rejects timestamp and performance together before calling the API", async () => {
    const program = new Command().exitOverride();
    addPlaylistsCommands(program);
    await program.parseAsync([
      "node", "test", "playlists", "log-spins", "9", "--at", "2026-10-01", "--performance", "4",
    ]);
    expect(mocks.client.logPlaylistSpins).not.toHaveBeenCalled();
    expect(mocks.printError).toHaveBeenCalledWith("Provide either --at or --performance, not both.");
    expect(process.exitCode).toBe(1);
  });
});
