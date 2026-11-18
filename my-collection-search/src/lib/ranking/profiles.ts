/**
 * Ranking profiles (#1192): a `RankingConfig` plus a name, description, the
 * surfaces it can be chosen for and whether it is a built-in preset. Pure, so
 * the suggestion panels (browser) and the API (server) resolve a profile the
 * same way.
 *
 * The rule everything here keeps: a profile that can't be read is Default,
 * never an error. A stored row that no longer parses, an active choice naming
 * a deleted or unknown profile, a preset id this build doesn't know: each
 * ranks as Default and says so with `fallback`.
 */
import {
  RANKING_SURFACES,
  rankingProfileSchema,
  toRankingConfig,
  type RankingActiveProfiles,
  type RankingConfig,
  type RankingPresetId,
  type RankingProfile,
  type RankingProfileDraft,
  type RankingProfileEntry,
  type RankingSurface,
} from "@groovenet/contracts";
import {
  BEATMATCHER_RANKING_CONFIG,
  DEFAULT_RANKING_CONFIG,
  SELECTOR_RANKING_CONFIG,
} from "./configs";

const preset = (
  config: RankingConfig,
  meta: { id: RankingPresetId; name: string; description: string },
): RankingProfile =>
  rankingProfileSchema.parse({
    ...config,
    ...meta,
    surfaces: [...RANKING_SURFACES],
    kind: "preset",
  });

export const DEFAULT_PROFILE = preset(DEFAULT_RANKING_CONFIG, {
  id: "default",
  name: "Default",
  description: "The closest identity or vibe match, with a small boost for key and tempo.",
});

export const RANKING_PRESETS: Record<RankingPresetId, RankingProfile> = {
  default: DEFAULT_PROFILE,
  beatmatcher: preset(BEATMATCHER_RANKING_CONFIG, {
    id: "beatmatcher",
    name: "Beatmatcher",
    description:
      "Mixable, then genre: ±6% BPM with half and double time and compatible keys, then the seed's genre, era and energy.",
  }),
  selector: preset(SELECTOR_RANKING_CONFIG, {
    id: "selector",
    name: "Selector",
    description: "Vibe and genre first: any key, tempo barely counts, era and energy pull gently.",
  }),
};

export const PRESET_LIST: RankingProfile[] = Object.values(RANKING_PRESETS);

export function isPresetId(id: string): id is RankingPresetId {
  return Object.hasOwn(RANKING_PRESETS, id);
}

/** What a stored row holds; `config` and `surfaces` are unvalidated. */
export type StoredRankingProfile = {
  id: number;
  name: string;
  description: string;
  surfaces: unknown;
  version: number;
  config: unknown;
  author?: string | null;
  source_handle?: string | null;
  origin?: "file" | "friend" | null;
};

/** A stored row as a profile, or null when it doesn't parse. */
export function parseStoredProfile(row: StoredRankingProfile): RankingProfile | null {
  const config =
    row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {};
  const parsed = rankingProfileSchema.safeParse({
    ...config,
    ...(row.author == null ? {} : { author: row.author }),
    version: row.version,
    id: String(row.id),
    name: row.name,
    description: row.description,
    surfaces: row.surfaces,
    kind: "custom",
  });
  return parsed.success ? parsed.data : null;
}

/** A stored row for listing: parsed, or Default's config under its own name, marked invalid. */
export function storedProfileEntry(row: StoredRankingProfile): RankingProfileEntry {
  const parsed = parseStoredProfile(row);
  if (parsed)
    return {
      ...parsed,
      ...(row.origin == null ? {} : { origin: row.origin }),
      ...(row.source_handle == null ? {} : { source_handle: row.source_handle }),
    };
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "Unreadable";
  return {
    ...DEFAULT_PROFILE,
    id: String(row.id),
    name: name.slice(0, 80),
    description: "",
    kind: "custom",
    invalid: true,
  };
}

/** The config columns a draft is stored as. */
export function draftToStored(draft: RankingProfileDraft): {
  name: string;
  description: string;
  surfaces: RankingSurface[];
  version: number;
  author?: string;
  config: Pick<RankingConfig, "weights" | "base" | "usePrior" | "constraints">;
} {
  const { name, description, surfaces, version, weights, base, usePrior, constraints } = draft;
  return {
    name,
    description,
    ...(draft.author === undefined ? {} : { author: draft.author }),
    surfaces,
    version,
    config: { weights, ...(base ? { base } : {}), usePrior, constraints },
  };
}

/**
 * A profile as a draft: what a copy starts from and what the editor edits.
 * Only the draft's own fields, so a listed entry's `invalid` never rides along.
 */
export function profileToDraft(
  profile: RankingProfile | RankingProfileEntry,
  name = profile.name,
): RankingProfileDraft {
  const { version, weights, base, usePrior, constraints, description, surfaces } = profile;
  return {
    version,
    name,
    ...(profile.author === undefined ? {} : { author: profile.author }),
    description,
    surfaces,
    weights,
    ...(base ? { base } : {}),
    usePrior,
    constraints,
  };
}

/** The name a copy gets when none is given, kept within the 80-character limit. */
export function copyName(name: string): string {
  return `${name.slice(0, 75)} copy`;
}

export type ResolvedProfile = {
  profile: RankingProfile;
  config: RankingConfig;
  /** True when the id asked for couldn't be used, so Default stands in. */
  fallback: boolean;
};

const resolved = (profile: RankingProfile, fallback = false): ResolvedProfile => ({
  profile,
  config: toRankingConfig(profile),
  fallback,
});

/**
 * The profile an id names, among presets and the given listed profiles.
 * Unknown, invalid, or not meant for this surface: Default, with `fallback`.
 */
export function resolveProfile(
  id: string | null | undefined,
  profiles: readonly RankingProfileEntry[],
  surface?: RankingSurface,
): ResolvedProfile {
  if (!id || id === "default") return resolved(DEFAULT_PROFILE);
  const found = isPresetId(id) ? RANKING_PRESETS[id] : profiles.find((p) => p.id === id);
  if (!found || ("invalid" in found && found.invalid)) return resolved(DEFAULT_PROFILE, true);
  if (surface && !found.surfaces.includes(surface)) return resolved(DEFAULT_PROFILE, true);
  return resolved(found);
}

/** Every surface on Default: what a friend with no choices has. */
export const DEFAULT_ACTIVE_PROFILES: RankingActiveProfiles = {
  suggestions: "default",
  related: "default",
  recommendations: "default",
  playlists: "default",
};

/** What analytics may say about a profile: the preset id, or `custom`. Never a name. */
export function profileAnalyticsId(profile: Pick<RankingProfile, "id" | "kind">) {
  return profile.kind === "preset" && isPresetId(profile.id) ? profile.id : "custom";
}
