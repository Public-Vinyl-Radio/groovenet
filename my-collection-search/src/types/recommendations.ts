/**
 * Where track suggestions (related tracks, similar tracks, playlist
 * recommendations) look for candidates: only the library being viewed, or
 * every library. Stored per library in `recommendation_settings`.
 */
import type { RecommendationScope } from "@groovenet/contracts";

export { RECOMMENDATION_SCOPES } from "@groovenet/contracts";
export type { RecommendationScope };

/** What a library gets before anyone chooses: suggestions stay in that library. */
export const DEFAULT_RECOMMENDATION_SCOPE: RecommendationScope = "library";
