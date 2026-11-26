import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getHouseholdOwner: vi.fn() }));
const forTracks = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/currentUser", () => auth);
vi.mock("@/server/repositories/trackRatingRepository", () => ({
  ratingKey: (trackId: string, friendId: number) => `${friendId}:${trackId}`,
  trackRatingRepository: { forTracks },
}));
import { resolveRatingViewer, withRequestRatings, withViewerRatings } from "../trackRatingService";

const owner = {
  id: "owner",
  name: "Owner",
  is_owner: true,
  discogs_username: "dj",
  tailscale_login: null,
};
const sam = { ...owner, id: "sam", name: "Sam", is_owner: false };
const req = new Request("http://lan/api/tracks");

beforeEach(() => {
  vi.resetAllMocks();
  forTracks.mockResolvedValue(new Map());
});

describe("resolveRatingViewer (#1283)", () => {
  it("is the current profile", async () => {
    auth.getCurrentUser.mockResolvedValue(sam);
    expect(await resolveRatingViewer(req)).toBe(sam);
    expect(auth.getCurrentUser).toHaveBeenCalledWith(req);
    expect(auth.getHouseholdOwner).not.toHaveBeenCalled();
  });

  it("falls back to the owner when no profile is chosen", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    auth.getHouseholdOwner.mockResolvedValue(owner);
    expect(await resolveRatingViewer(req)).toBe(owner);
  });

  it("fails loudly if the household has no profile at all", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    auth.getHouseholdOwner.mockResolvedValue(null);
    await expect(resolveRatingViewer()).rejects.toThrow("No household profile");
  });
});

describe("withViewerRatings", () => {
  it("replaces star_rating with the viewer's and adds the others' read-only", async () => {
    forTracks.mockResolvedValue(
      new Map([["6:t1", { rating: 2, others: [{ user_id: "owner", name: "Owner", rating: 5 }] }]]),
    );
    const rows = [
      // A deprecated tracks.star_rating from `t.*` is overwritten, never passed on.
      { track_id: "t1", friend_id: 6, star_rating: 5 },
      { track_id: "t2", friend_id: 6, star_rating: 4 },
    ];
    expect(await withViewerRatings(rows, sam)).toEqual([
      {
        track_id: "t1",
        friend_id: 6,
        star_rating: 2,
        other_ratings: [{ user_id: "owner", name: "Owner", rating: 5 }],
      },
      { track_id: "t2", friend_id: 6, star_rating: 0, other_ratings: [] },
    ]);
    expect(forTracks).toHaveBeenCalledWith(rows, "sam");
  });

  it("resolves the viewer for a request, and skips both lookups for no rows", async () => {
    expect(await withRequestRatings(req, [])).toEqual([]);
    expect(auth.getCurrentUser).not.toHaveBeenCalled();

    auth.getCurrentUser.mockResolvedValue(sam);
    const rated = await withRequestRatings(req, [{ track_id: "t1", friend_id: 6 }]);
    expect(rated[0]).toMatchObject({ star_rating: 0, other_ratings: [] });
    expect(forTracks).toHaveBeenCalledWith([{ track_id: "t1", friend_id: 6 }], "sam");
  });
});
