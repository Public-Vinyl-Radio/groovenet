/**
 * Ranking profiles (#1192): presets, a friend's stored profiles and the one
 * chosen per surface. Every read goes through the zod schema, and a stored
 * profile that no longer parses ranks as Default: listing marks it `invalid`,
 * resolving it reports `fallback`, and neither is an error.
 */
import {
  MAX_RANKING_PROFILES_PER_FRIEND,
  RANKING_CONFIG_IDS,
  RANKING_SURFACES,
  storedRankingProfileIdSchema,
  type RankingActiveProfiles,
  type RankingConfigId,
  type RankingProfileDraft,
  type RankingProfileEntry,
  type RankingProfilesResponse,
  type RankingSurface,
} from "@groovenet/contracts";
import { RANKING_CONFIGS } from "@/lib/ranking/configs";
import {
  copyName,
  DEFAULT_ACTIVE_PROFILES,
  draftToStored,
  isPresetId,
  PRESET_LIST,
  profileToDraft,
  RANKING_PRESETS,
  resolveProfile,
  storedProfileEntry,
  type ResolvedProfile,
} from "@/lib/ranking/profiles";
import {
  rankingProfileRepository,
  type RankingProfileRepository,
  type RankingSelectionRow,
} from "@/server/repositories/rankingProfileRepository";

export class RankingProfileError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
    this.name = "RankingProfileError";
  }
}

/** A Postgres foreign key violation: the friend doesn't exist. */
const isMissingFriend = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "23503";

const storedId = (id: string): number | null =>
  storedRankingProfileIdSchema.safeParse(id).success ? Number(id) : null;

const READ_ONLY = "Presets are read-only; copy one to change it";

/** A ranking for the recommendations breakdown: the id it answers to and what it ranks with. */
export type ResolvedRanker = ResolvedProfile & { id: string };

export class RankingProfileService {
  constructor(private readonly repo: RankingProfileRepository = rankingProfileRepository) {}

  private async storedEntries(friendId: number): Promise<RankingProfileEntry[]> {
    return (await this.repo.listByFriend(friendId)).map(storedProfileEntry);
  }

  /** The profile each surface ranks with; a choice that can't be used reads as `default`. */
  private activeFrom(
    selections: RankingSelectionRow[],
    profiles: readonly RankingProfileEntry[],
  ): RankingActiveProfiles {
    const active = { ...DEFAULT_ACTIVE_PROFILES };
    for (const row of selections) {
      const surface = row.surface as RankingSurface;
      if (!RANKING_SURFACES.includes(surface)) continue;
      const id = row.profile_id !== null ? String(row.profile_id) : row.preset_id;
      const { profile, fallback } = resolveProfile(id, profiles, surface);
      active[surface] = fallback ? "default" : profile.id;
    }
    return active;
  }

  async list(friendId: number): Promise<RankingProfilesResponse> {
    const [stored, selections] = await Promise.all([
      this.storedEntries(friendId),
      this.repo.listSelections(friendId),
    ]);
    return {
      friend_id: friendId,
      profiles: [...PRESET_LIST, ...stored],
      active: this.activeFrom(selections, stored),
    };
  }

  async get(id: string): Promise<RankingProfileEntry> {
    if (isPresetId(id)) return RANKING_PRESETS[id];
    const numeric = storedId(id);
    const row = numeric === null ? null : await this.repo.findById(numeric);
    if (!row) throw new RankingProfileError(`Ranking profile ${id} not found`, 404);
    return storedProfileEntry(row);
  }

  async create(friendId: number, draft: RankingProfileDraft): Promise<RankingProfileEntry> {
    let row;
    try {
      row = await this.repo.insert(friendId, draftToStored(draft), MAX_RANKING_PROFILES_PER_FRIEND);
    } catch (error) {
      if (isMissingFriend(error)) {
        throw new RankingProfileError(`Library ${friendId} does not exist`, 404);
      }
      throw error;
    }
    if (!row) {
      throw new RankingProfileError(
        `A library can keep ${MAX_RANKING_PROFILES_PER_FRIEND} ranking profiles; delete one first`,
        409,
      );
    }
    return storedProfileEntry(row);
  }

  /** A copy of a preset or a stored profile, as the friend's own. */
  async copy(id: string, friendId: number, name?: string): Promise<RankingProfileEntry> {
    const source = await this.get(id);
    return this.create(friendId, profileToDraft(source, name ?? copyName(source.name)));
  }

  async update(id: string, draft: RankingProfileDraft): Promise<RankingProfileEntry> {
    if (isPresetId(id)) throw new RankingProfileError(READ_ONLY, 403);
    const numeric = storedId(id);
    const row = numeric === null ? null : await this.repo.update(numeric, draftToStored(draft));
    if (!row) throw new RankingProfileError(`Ranking profile ${id} not found`, 404);
    await this.repo.dropSelectionsOutside(row.id, draft.surfaces);
    return storedProfileEntry(row);
  }

  async remove(id: string): Promise<RankingProfileEntry> {
    const profile = await this.get(id);
    if (profile.kind === "preset") throw new RankingProfileError(READ_ONLY, 403);
    await this.repo.delete(Number(profile.id));
    return profile;
  }

  /**
   * Choose a profile for some surfaces, by default every surface it applies
   * to. A surface it doesn't apply to, or a stored profile that can't be
   * read, is a 400: the choice would silently rank as Default.
   */
  async setActive(
    friendId: number,
    profileId: string,
    surfaces?: RankingSurface[],
  ): Promise<{ friend_id: number; active: RankingActiveProfiles; profile: RankingProfileEntry }> {
    const profile = await this.get(profileId);
    if (profile.invalid) {
      throw new RankingProfileError(
        `Ranking profile ${profileId} can't be read; save it again first`,
        400,
      );
    }
    const targets = surfaces ?? profile.surfaces;
    const outside = targets.filter((surface) => !profile.surfaces.includes(surface));
    if (outside.length > 0) {
      throw new RankingProfileError(
        `Ranking profile ${profileId} doesn't apply to ${outside.join(", ")}`,
        400,
      );
    }
    try {
      await this.repo.setSelections(
        friendId,
        targets,
        profile.kind === "preset" ? { presetId: profile.id } : { profileId: Number(profile.id) },
      );
    } catch (error) {
      if (isMissingFriend(error)) {
        throw new RankingProfileError(`Library ${friendId} does not exist`, 404);
      }
      throw error;
    }
    const { active } = await this.list(friendId);
    return { friend_id: friendId, active, profile };
  }

  /**
   * What a recommendations breakdown ranks with. `ref` omitted: the friend's
   * active profile for the surface. A built-in config (`strict`) or preset is
   * used as is; a stored id is loaded, and Default stands in (with
   * `fallback`) when it no longer parses. An id that names nothing is a 400.
   */
  async resolveRanker(
    ref: string | undefined,
    friendId: number,
    surface: RankingSurface,
  ): Promise<ResolvedRanker> {
    if (ref === undefined) {
      const selection = (await this.repo.listSelections(friendId)).find(
        (row) => row.surface === surface,
      );
      if (!selection) return { id: "default", ...resolveProfile("default", []) };
      if (selection.profile_id === null) {
        const resolved = resolveProfile(selection.preset_id, [], surface);
        return { id: resolved.profile.id, ...resolved };
      }
      const row = await this.repo.findById(selection.profile_id);
      const entries = row ? [storedProfileEntry(row)] : [];
      const resolved = resolveProfile(String(selection.profile_id), entries, surface);
      return { id: String(selection.profile_id), ...resolved };
    }
    if (isPresetId(ref)) return { id: ref, ...resolveProfile(ref, []) };
    if ((RANKING_CONFIG_IDS as readonly string[]).includes(ref)) {
      const config = RANKING_CONFIGS[ref as RankingConfigId];
      return { id: ref, ...resolveProfile("default", []), config };
    }
    const numeric = storedId(ref);
    const row = numeric === null ? null : await this.repo.findById(numeric);
    if (!row) throw new RankingProfileError(`Unknown ranker ${ref}`, 400);
    return { id: ref, ...resolveProfile(ref, [storedProfileEntry(row)]) };
  }
}

export const rankingProfileService = new RankingProfileService();
