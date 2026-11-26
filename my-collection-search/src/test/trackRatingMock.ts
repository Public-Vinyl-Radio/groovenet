/**
 * A pass-through stand-in for `@/server/services/trackRatingService` in route
 * tests that mock the database: the viewer is `VIEWER`, and rows come back as
 * given, so a route's own assertions stay about the route. Ratings themselves
 * are covered by `trackRatingService.test.ts`.
 *
 *   vi.mock("@/server/services/trackRatingService", async () =>
 *     (await import("@/test/trackRatingMock")).trackRatingServiceMock);
 */
import { vi } from "vitest";

export const VIEWER = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Owner",
  is_owner: true,
  discogs_username: "owner",
  tailscale_login: null,
};

export const trackRatingServiceMock = {
  resolveRatingViewer: vi.fn(async () => VIEWER),
  withViewerRatings: vi.fn(async <T>(rows: T[]) => rows),
  withRequestRatings: vi.fn(async <T>(_req: unknown, rows: T[]) => rows),
};

/**
 * `@/server/repositories/trackRatingRepository` with no ratings stored:
 *
 *   vi.mock("@/server/repositories/trackRatingRepository", async () =>
 *     (await import("@/test/trackRatingMock")).trackRatingRepositoryMock);
 */
export const trackRatingRepositoryMock = {
  ratingKey: (trackId: string, friendId: number) => `${friendId}:${trackId}`,
  trackRatingRepository: {
    set: vi.fn(async () => undefined),
    forTracks: vi.fn(async () => new Map()),
  },
};
