/**
 * Where track suggestions (related tracks, similar tracks, playlist
 * recommendations) look for candidates: only the library being viewed, or
 * every library. Stored per library in `recommendation_settings`.
 */
export const RECOMMENDATION_SCOPES = ["library", "all"] as const;
export type RecommendationScope = (typeof RECOMMENDATION_SCOPES)[number];

/** What a library gets before anyone chooses: suggestions stay in that library. */
export const DEFAULT_RECOMMENDATION_SCOPE: RecommendationScope = "library";
