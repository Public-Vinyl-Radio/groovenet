/**
 * Stored ranking profiles and the profile chosen per surface (#1192). Rows
 * come back unvalidated: `rankingProfileService` parses them, and a row that
 * no longer parses ranks as Default.
 */
import type { RankingSurface } from "@groovenet/contracts";
import { dbQuery } from "@/lib/serverDb";
import type { StoredRankingProfile } from "@/lib/ranking/profiles";

export type RankingProfileRow = StoredRankingProfile & { friend_id: number };

/** The columns a profile is written as. */
export type RankingProfileWrite = {
  name: string;
  description: string;
  surfaces: RankingSurface[];
  version: number;
  config: unknown;
};

export type RankingSelectionRow = {
  surface: string;
  preset_id: string | null;
  profile_id: number | null;
};

/** A selection names a preset or a stored profile, never both. */
export type RankingSelection = { presetId: string } | { profileId: number };

const COLUMNS = "id, friend_id, name, description, surfaces, version, config";

export class RankingProfileRepository {
  async listByFriend(friendId: number): Promise<RankingProfileRow[]> {
    const { rows } = await dbQuery<RankingProfileRow>(
      `SELECT ${COLUMNS} FROM ranking_profiles WHERE friend_id = $1 ORDER BY id`,
      [friendId],
    );
    return rows;
  }

  async findById(id: number): Promise<RankingProfileRow | null> {
    const { rows } = await dbQuery<RankingProfileRow>(
      `SELECT ${COLUMNS} FROM ranking_profiles WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Null when the friend already has `limit` profiles; the count and insert are one statement. */
  async insert(
    friendId: number,
    profile: RankingProfileWrite,
    limit: number,
  ): Promise<RankingProfileRow | null> {
    const { rows } = await dbQuery<RankingProfileRow>(
      `
      INSERT INTO ranking_profiles (friend_id, name, description, surfaces, version, config)
      SELECT $1, $2, $3, $4::text[], $5, $6::jsonb
      WHERE (SELECT count(*) FROM ranking_profiles WHERE friend_id = $1) < $7
      RETURNING ${COLUMNS}
      `,
      [
        friendId,
        profile.name,
        profile.description,
        profile.surfaces,
        profile.version,
        JSON.stringify(profile.config),
        limit,
      ],
    );
    return rows[0] ?? null;
  }

  async update(id: number, profile: RankingProfileWrite): Promise<RankingProfileRow | null> {
    const { rows } = await dbQuery<RankingProfileRow>(
      `
      UPDATE ranking_profiles
      SET name = $2, description = $3, surfaces = $4::text[], version = $5,
          config = $6::jsonb, updated_at = current_timestamp
      WHERE id = $1
      RETURNING ${COLUMNS}
      `,
      [
        id,
        profile.name,
        profile.description,
        profile.surfaces,
        profile.version,
        JSON.stringify(profile.config),
      ],
    );
    return rows[0] ?? null;
  }

  /**
   * Drops the selections of surfaces the profile no longer applies to, so a
   * narrowed profile never stays chosen where it can't be.
   */
  async dropSelectionsOutside(profileId: number, surfaces: RankingSurface[]): Promise<void> {
    await dbQuery(
      `DELETE FROM ranking_profile_selections
       WHERE profile_id = $1 AND NOT (surface = ANY($2::text[]))`,
      [profileId, surfaces],
    );
  }

  /** True when a row was deleted. Its selections go with it (ON DELETE CASCADE). */
  async delete(id: number): Promise<boolean> {
    const { rowCount } = await dbQuery(`DELETE FROM ranking_profiles WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }

  async listSelections(friendId: number): Promise<RankingSelectionRow[]> {
    const { rows } = await dbQuery<RankingSelectionRow>(
      `SELECT surface, preset_id, profile_id FROM ranking_profile_selections
       WHERE friend_id = $1 ORDER BY surface`,
      [friendId],
    );
    return rows;
  }

  /** Choose one profile for each of `surfaces`, in one statement. */
  async setSelections(
    friendId: number,
    surfaces: RankingSurface[],
    selection: RankingSelection,
  ): Promise<void> {
    const presetId = "presetId" in selection ? selection.presetId : null;
    const profileId = "profileId" in selection ? selection.profileId : null;
    await dbQuery(
      `
      INSERT INTO ranking_profile_selections (friend_id, surface, preset_id, profile_id, updated_at)
      SELECT $1, surface, $3, $4, current_timestamp FROM unnest($2::text[]) AS surface
      ON CONFLICT (friend_id, surface)
      DO UPDATE SET preset_id = EXCLUDED.preset_id, profile_id = EXCLUDED.profile_id,
                    updated_at = current_timestamp
      `,
      [friendId, surfaces, presetId, profileId],
    );
  }
}

export const rankingProfileRepository = new RankingProfileRepository();
