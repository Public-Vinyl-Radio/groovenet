import { dbQuery } from "@/lib/serverDb";

/**
 * The household owner's profile id, for integration tests against a migrated
 * database: the migrations create the owner if the app hasn't yet. Playlists
 * created without an owner belong to it (#1284).
 */
export async function householdOwnerId(): Promise<string> {
  return (await dbQuery<{ id: string }>("SELECT household_owner_id() AS id")).rows[0].id;
}
