import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  client: { searchAlbums: vi.fn(), deleteAlbum: vi.fn() },
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
import { printError, printSuccess } from "../output.js";
import { addAlbumsCommands, runDeleteAlbum } from "./albums.js";

function run(...args: string[]) {
  const program = new Command().exitOverride();
  addAlbumsCommands(program);
  return program.parseAsync(["node", "test", "albums", "list", ...args]);
}

function runDelete(...args: string[]) {
  const program = new Command().exitOverride();
  addAlbumsCommands(program);
  return program.parseAsync(["node", "test", "albums", "delete", ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadConfig.mockReturnValue({ api_base: "http://example.test/api", default_friend_id: 1 });
  mocks.Client.mockImplementation(function () {
    return mocks.client;
  });
  mocks.client.searchAlbums.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
  mocks.client.deleteAlbum.mockResolvedValue({ success: true });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("albums list --genre (#375)", () => {
  it("collects repeated genres", async () => {
    await run("--genre", "latin", "--genre", "jazz");
    expect(mocks.client.searchAlbums).toHaveBeenCalledWith(
      expect.objectContaining({ q: "", genre: ["latin", "jazz"] }),
    );
  });

  it("sends no genre without the option", async () => {
    await run("blue");
    expect(mocks.client.searchAlbums).toHaveBeenCalledWith(
      expect.objectContaining({ q: "blue", genre: undefined }),
    );
  });
});

describe("runDeleteAlbum (#511)", () => {
  it("deletes without asking when --yes is passed", async () => {
    const ask = vi.fn();
    await runDeleteAlbum(mocks.client, "r1", { friendId: 2, yes: true }, false, ask);

    expect(ask).not.toHaveBeenCalled();
    expect(mocks.client.deleteAlbum).toHaveBeenCalledWith("r1", 2);
    expect(printSuccess).toHaveBeenCalledWith(expect.stringContaining("r1"));
  });

  it("falls back to the configured default friend id", async () => {
    await runDeleteAlbum(mocks.client, "r1", { yes: true }, false, vi.fn());
    expect(mocks.client.deleteAlbum).toHaveBeenCalledWith("r1", 1);
  });

  it("asks for confirmation, mentioning the Discogs resurrection caveat, and deletes on yes", async () => {
    const ask = vi.fn().mockResolvedValue("y");
    await runDeleteAlbum(mocks.client, "r1", { friendId: 2 }, true, ask);

    expect(ask).toHaveBeenCalledWith(expect.stringMatching(/Discogs/));
    expect(mocks.client.deleteAlbum).toHaveBeenCalledWith("r1", 2);
  });

  it("accepts a full 'yes' answer too", async () => {
    const ask = vi.fn().mockResolvedValue("Yes");
    await runDeleteAlbum(mocks.client, "r1", { friendId: 2 }, true, ask);
    expect(mocks.client.deleteAlbum).toHaveBeenCalledWith("r1", 2);
  });

  it("does nothing when the answer isn't yes", async () => {
    const ask = vi.fn().mockResolvedValue("n");
    await runDeleteAlbum(mocks.client, "r1", { friendId: 2 }, true, ask);

    expect(mocks.client.deleteAlbum).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Not deleted."));
  });

  it("refuses to guess without a terminal to ask on", async () => {
    await expect(
      runDeleteAlbum(mocks.client, "r1", { friendId: 2 }, false, vi.fn()),
    ).rejects.toThrow(/--yes/);
    expect(mocks.client.deleteAlbum).not.toHaveBeenCalled();
  });
});

describe("albums delete command wiring", () => {
  it("passes --friend-id and --yes through to the client", async () => {
    await runDelete("r1", "--friend-id", "9", "--yes");
    expect(mocks.client.deleteAlbum).toHaveBeenCalledWith("r1", 9);
  });

  it("prints and exits 1 when the client rejects", async () => {
    mocks.client.deleteAlbum.mockRejectedValue(new Error("boom"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runDelete("r1", "--yes");

    expect(printError).toHaveBeenCalledWith("boom");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    mocks.client.deleteAlbum.mockRejectedValue("boom");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await runDelete("r1", "--yes");

    expect(printError).toHaveBeenCalledWith("boom");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
