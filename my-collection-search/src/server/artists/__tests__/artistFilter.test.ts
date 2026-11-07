import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/server/repositories/artistFilterRepository", () => ({ artistFilterRepository: repo }));

import { resolveArtistFilter, unknownArtistsError } from "../artistFilter";

const meridian = { id: 9, name: "Meridian Brothers", slug: "meridian-brothers" };
const mis = { id: 4, name: "Mexican Institute of Sound", slug: "mexican-institute-of-sound" };

describe("resolveArtistFilter (#709)", () => {
  beforeEach(() => {
    repo.resolve.mockReset();
  });

  it("is no filter for no values, and asks nothing", async () => {
    await expect(resolveArtistFilter([" ", ""])).resolves.toEqual({ ids: undefined, artists: [] });
    expect(repo.resolve).not.toHaveBeenCalled();
  });

  it("keeps request order and lists an artist named twice once", async () => {
    repo.resolve.mockResolvedValue([
      { requested: "4", ...mis },
      { requested: "meridian-brothers", ...meridian },
      { requested: "meridian-brothers-old", ...meridian },
    ]);
    await expect(
      resolveArtistFilter([" meridian-brothers ", "4", "meridian-brothers-old", "4"]),
    ).resolves.toEqual({ ids: [9, 4], artists: [meridian, mis] });
    expect(repo.resolve).toHaveBeenCalledWith(["meridian-brothers", "4", "meridian-brothers-old"]);
  });

  it("names the values that match no artist", async () => {
    repo.resolve.mockResolvedValue([{ requested: "meridian-brothers", ...meridian }]);
    await expect(resolveArtistFilter(["meridian-brothers", "nobody"])).resolves.toEqual({
      unknown: ["nobody"],
    });
    expect(unknownArtistsError(["nobody"])).toEqual({
      error: "Unknown artist: nobody",
      unknown: ["nobody"],
    });
  });
});
