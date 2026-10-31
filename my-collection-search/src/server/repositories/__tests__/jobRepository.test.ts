import { beforeEach, expect, it, vi } from "vitest";
import { dbQuery } from "@/lib/serverDb";
import { JobRepository } from "../jobRepository";
import { coverUrlSql } from "../coverUrlSql";
vi.mock("@/lib/serverDb", () => ({ dbQuery: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it("does not query for an empty job page", async () => {
  expect(await new JobRepository().findTracksByTrackAndFriendPairs([])).toEqual([]);
  expect(dbQuery).not.toHaveBeenCalled();
});
it("keeps the thumbnail contract while selecting the chosen cover for each job track", async () => {
  const rows = [{ track_id: "t", album_thumbnail: "/chosen.jpg" }];
  vi.mocked(dbQuery).mockResolvedValueOnce({ rows } as never);
  expect(
    await new JobRepository().findTracksByTrackAndFriendPairs([
      { trackId: "t", friendId: 7 },
      { trackId: "u", friendId: 8 },
    ]),
  ).toBe(rows);
  expect(dbQuery).toHaveBeenCalledWith(
    expect.stringContaining(`${coverUrlSql("t")} AS album_thumbnail`),
    ["t", 7, "u", 8],
  );
});
