import { expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ search: vi.fn(), count: vi.fn(), letterCounts: vi.fn() }));
vi.mock("@/server/repositories/artistListRepository", () => ({ artistListRepository: repo }));

import { listArtistLetters, listArtists } from "../artistListService";

it("returns the page and the total for the same filter", async () => {
  repo.search.mockResolvedValue([{ id: 1 }]);
  repo.count.mockResolvedValue(12);
  await expect(
    listArtists({ q: "mir", friend_id: 6, include_placeholders: false, limit: 5, offset: 10 }),
  ).resolves.toEqual({ items: [{ id: 1 }], total: 12, limit: 5, offset: 10, query: "mir" });
  const filter = { q: "mir", friendId: 6, includePlaceholders: false };
  expect(repo.search).toHaveBeenCalledWith(filter, 5, 10);
  expect(repo.count).toHaveBeenCalledWith(filter);
});

it("passes the index letter through", async () => {
  repo.search.mockResolvedValue([]);
  repo.count.mockResolvedValue(0);
  await listArtists({ q: "", include_placeholders: false, letter: "M", limit: 50, offset: 0 });
  expect(repo.count).toHaveBeenCalledWith({
    q: "",
    friendId: undefined,
    includePlaceholders: false,
    letter: "M",
  });
});

it("totals the letter counts for the friend's scope (#1116)", async () => {
  repo.letterCounts.mockResolvedValue([
    { letter: "A", count: 2 },
    { letter: "#", count: 1 },
  ]);
  await expect(listArtistLetters({ friend_id: 6, include_placeholders: false })).resolves.toEqual({
    letters: [
      { letter: "A", count: 2 },
      { letter: "#", count: 1 },
    ],
    total: 3,
  });
  expect(repo.letterCounts).toHaveBeenCalledWith({ friendId: 6, includePlaceholders: false });
});
