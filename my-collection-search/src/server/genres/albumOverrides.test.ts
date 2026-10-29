import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAlbumOverrides } from "./albumOverrides";

const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/server/repositories/trackGenreRepository", () => ({
  trackGenreRepository: { resolveGenreRefs: resolve },
}));
const ID = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  resolve.mockReset();
  resolve.mockImplementation(async (refs: string[]) => ({ ids: [...new Set(refs)], unknown: [] }));
});

describe("album replacement validation", () => {
  it("leaves omitted fields alone and resolves both legacy name lists", async () => {
    expect(await resolveAlbumOverrides({ title: "Album" })).toEqual({});
    expect(await resolveAlbumOverrides({ genres: ["Jazz"], styles: ["Fusion"] })).toEqual({
      genre_override_ids: ["Jazz"],
      style_override_ids: ["Fusion"],
    });
  });
  it("distinguishes reset, empty and ids, with explicit fields taking precedence", async () => {
    expect(
      await resolveAlbumOverrides({
        genre_override_ids: null,
        genres: ["bad"],
        style_override_ids: [],
      }),
    ).toEqual({
      genre_override_ids: null,
      style_override_ids: [],
    });
    expect(resolve).toHaveBeenCalledWith([]);
    expect(await resolveAlbumOverrides({ genre_override_ids: [ID, ID] })).toEqual({
      genre_override_ids: [ID],
    });
  });
  it.each([
    null,
    { genre_override_ids: ["Jazz"] },
    { style_override_ids: "Fusion" },
    { genres: [42] },
    { style_override_ids: Array(101).fill(ID) },
  ])("rejects malformed replacements %j", async (input) => {
    await expect(resolveAlbumOverrides(input)).rejects.toThrow("Invalid album taxonomy overrides");
  });
  it("rejects missing taxonomy ids or names rather than silently dropping them", async () => {
    resolve.mockResolvedValueOnce({ ids: [], unknown: [ID] });
    await expect(resolveAlbumOverrides({ style_override_ids: [ID] })).rejects.toThrow(
      `Unknown genre: ${ID}`,
    );
  });
});
