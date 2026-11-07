import { expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({ search: vi.fn(), count: vi.fn() }));
vi.mock("@/server/repositories/artistListRepository", () => ({ artistListRepository: repo }));

import { listArtists } from "../artistListService";

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
