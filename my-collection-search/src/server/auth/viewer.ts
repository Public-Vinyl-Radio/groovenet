import { getCurrentUser, getHouseholdOwner } from "@/server/auth/currentUser";
import type { User } from "@/types/user";

/**
 * Whose view a request gets: the current profile (token, device, mapped
 * tailnet login or the sole profile), else the owner. Ratings (#1283) and
 * playlist visibility (#1284) both use it. The fallback is for machine clients
 * without a token on a household with several profiles; a browser in that
 * state is shown the picker first.
 */
export async function resolveViewer(req?: Request): Promise<User> {
  const viewer = (await getCurrentUser(req)) ?? (await getHouseholdOwner());
  // ensureOwner (run by both helpers) always leaves an owner row.
  if (!viewer) throw new Error("No household profile to act as");
  return viewer;
}
