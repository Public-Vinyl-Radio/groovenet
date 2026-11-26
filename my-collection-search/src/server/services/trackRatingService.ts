import { getCurrentUser, getHouseholdOwner } from "@/server/auth/currentUser";
import {
  ratingKey,
  trackRatingRepository,
  type TrackRatingRef,
} from "@/server/repositories/trackRatingRepository";
import type { TrackOtherRating } from "@groovenet/contracts";
import type { User } from "@/types/user";

/**
 * Whose ratings a request reads and writes (#1283): the current profile
 * (token, device, mapped tailnet login or the sole profile), else the owner.
 * The fallback is for machine clients without a token on a household with
 * several profiles; a browser in that state is shown the picker first.
 */
export async function resolveRatingViewer(req?: Request): Promise<User> {
  const viewer = (await getCurrentUser(req)) ?? (await getHouseholdOwner());
  // ensureOwner (run by both helpers) always leaves an owner row.
  if (!viewer) throw new Error("No household profile to rate as");
  return viewer;
}

export type WithViewerRatings<T> = T & { star_rating: number; other_ratings: TrackOtherRating[] };

/**
 * Overwrites each row's `star_rating` with the viewer's rating (0 unrated) and
 * adds `other_ratings`, every other profile's, read-only. One query for the
 * whole list. Every response that carries tracks goes through this, so the
 * deprecated `tracks.star_rating` a `t.*` select brings along never reaches
 * a client.
 */
export async function withViewerRatings<T extends TrackRatingRef>(
  rows: T[],
  viewer: Pick<User, "id">,
): Promise<WithViewerRatings<T>[]> {
  const ratings = await trackRatingRepository.forTracks(rows, viewer.id);
  return rows.map((row) => {
    const entry = ratings.get(ratingKey(row.track_id, row.friend_id));
    return { ...row, star_rating: entry?.rating ?? 0, other_ratings: entry?.others ?? [] };
  });
}

/** `withViewerRatings` for a request: resolves the viewer first. */
export async function withRequestRatings<T extends TrackRatingRef>(
  req: Request | undefined,
  rows: T[],
): Promise<WithViewerRatings<T>[]> {
  if (rows.length === 0) return [];
  return withViewerRatings(rows, await resolveRatingViewer(req));
}
