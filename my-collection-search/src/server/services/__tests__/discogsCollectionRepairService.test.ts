import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findIdByUsername: vi.fn(),
  repairDiscogsCollectionFields: vi.fn(),
  getReleasePath: vi.fn(),
  getReleaseWritePath: vi.fn(),
  loadAlbum: vi.fn(),
}));

vi.mock("@/lib/serverDb", () => ({
  withDbTransaction: (fn: (client: unknown) => unknown) => fn("client"),
}));
vi.mock("@/server/repositories/friendRepository", () => ({
  friendRepository: { findIdByUsername: mocks.findIdByUsername },
}));
vi.mock("@/server/repositories/albumRepository", () => ({
  albumRepository: { repairDiscogsCollectionFields: mocks.repairDiscogsCollectionFields },
}));
vi.mock("@/server/services/discogsManifestService", () => ({
  getReleasePath: mocks.getReleasePath,
  getReleaseWritePath: mocks.getReleaseWritePath,
  loadAlbum: mocks.loadAlbum,
}));

import { repairDiscogsCollectionFields } from "../discogsCollectionRepairService";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findIdByUsername.mockResolvedValue(6);
  mocks.repairDiscogsCollectionFields.mockResolvedValue({ albums: ["1"], tracks: 3 });
  mocks.getReleaseWritePath.mockImplementation((_user: string, id: string) => `/exports/release_${id}.json`);
});

describe("repairDiscogsCollectionFields()", () => {
  it("sends one entry per numeric release, preferring the listing's date and the saved uri", async () => {
    mocks.getReleasePath.mockImplementation((_user: string, id: string) =>
      id === "3" ? null : `/exports/release_${id}.json`
    );
    mocks.loadAlbum.mockImplementation((path: string) =>
      path.endsWith("_1.json")
        ? { date_added: "2020-01-01T00:00:00-08:00", uri: "https://www.discogs.com/release/1-Jazz-Samba" }
        : { date_added: "2021-06-01T00:00:00-07:00", uri: "" }
    );

    const result = await repairDiscogsCollectionFields(
      "dj",
      ["1", "1", "2", "3", "local-abc"],
      new Map([["1", "2024-01-01T00:00:00-08:00"]])
    );

    expect(result).toEqual({ albums: ["1"], tracks: 3 });
    expect(mocks.findIdByUsername).toHaveBeenCalledWith("dj");
    expect(mocks.repairDiscogsCollectionFields).toHaveBeenCalledWith("client", 6, [
      { release_id: "1", date_added: "2024-01-01T00:00:00-08:00", discogs_url: "https://www.discogs.com/release/1-Jazz-Samba" },
      // No listing date: the user's own saved JSON is the fallback.
      { release_id: "2", date_added: "2021-06-01T00:00:00-07:00", discogs_url: "https://www.discogs.com/release/2" },
      // No saved JSON at all: the URL is rebuilt from the ID, the date left alone.
      { release_id: "3", date_added: null, discogs_url: "https://www.discogs.com/release/3" },
    ]);
  });

  it("never takes another collection's date from a fallback file", async () => {
    mocks.getReleasePath.mockReturnValue("/exports/release_9.json");
    mocks.getReleaseWritePath.mockReturnValue("/exports/friend_release_9.json");
    mocks.loadAlbum.mockReturnValue({ date_added: "2019-01-01T00:00:00Z", uri: "https://www.discogs.com/release/9-X" });

    await repairDiscogsCollectionFields("friend", ["9"], new Map());

    expect(mocks.repairDiscogsCollectionFields).toHaveBeenCalledWith("client", 6, [
      { release_id: "9", date_added: null, discogs_url: "https://www.discogs.com/release/9-X" },
    ]);
  });

  it("does nothing without any Discogs release IDs", async () => {
    expect(await repairDiscogsCollectionFields("dj", ["local-1"], new Map())).toEqual({ albums: [], tracks: 0 });
    expect(mocks.findIdByUsername).not.toHaveBeenCalled();
    expect(mocks.repairDiscogsCollectionFields).not.toHaveBeenCalled();
  });

  it("does nothing for a username that was never imported", async () => {
    mocks.findIdByUsername.mockResolvedValue(null);

    expect(await repairDiscogsCollectionFields("nobody", ["1"], new Map())).toEqual({ albums: [], tracks: 0 });
    expect(mocks.repairDiscogsCollectionFields).not.toHaveBeenCalled();
  });
});
