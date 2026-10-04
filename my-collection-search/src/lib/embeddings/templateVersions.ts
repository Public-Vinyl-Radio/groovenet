import type { EmbeddingModelKind } from "@/types/embeddings";

/**
 * The template version each builder produces today. Bump one whenever its
 * `build*Text` output changes for the same input — including a change in how
 * inputs are normalized — so every row written by the old template counts as
 * stale (#407). Kept apart from the builders so repositories can read it
 * without importing them.
 */
export const CURRENT_TEMPLATE_VERSIONS: Record<EmbeddingModelKind, number> = {
  // 2: Unicode-aware normalization — accents folded, not deleted (#407).
  identity: 2,
  audio_vibe: 1,
  context: 1,
};
