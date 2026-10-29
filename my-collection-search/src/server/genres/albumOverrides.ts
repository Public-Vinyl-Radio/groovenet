import { z } from "zod";
import { albumTaxonomyOverrideFields, type AlbumTaxonomyOverrides } from "@/api-contract/schemas";
import { trackGenreRepository } from "@/server/repositories/trackGenreRepository";

export type { AlbumTaxonomyOverrides } from "@/api-contract/schemas";

export class AlbumOverrideError extends Error {}

/** Also interpret legacy edit requests' names as replacements, never source
 * writes. Explicit ids (including null reset) take precedence over names. */
export async function resolveAlbumOverrides(input: unknown): Promise<AlbumTaxonomyOverrides> {
  const parsed = albumTaxonomyOverrideFields
    .extend({
      genres: z.array(z.string()).optional(),
      styles: z.array(z.string()).optional(),
    })
    .safeParse(input);
  if (!parsed.success) throw new AlbumOverrideError("Invalid album taxonomy overrides");
  const result: AlbumTaxonomyOverrides = {};
  for (const [kind, field] of [
    ["genres", "genre_override_ids"],
    ["styles", "style_override_ids"],
  ] as const) {
    const refs = parsed.data[field] !== undefined ? parsed.data[field] : parsed.data[kind];
    if (refs === undefined) continue;
    if (refs === null) {
      result[field] = null;
      continue;
    }
    const resolved = await trackGenreRepository.resolveGenreRefs(refs);
    if (resolved.unknown.length)
      throw new AlbumOverrideError(`Unknown genre: ${resolved.unknown.join(", ")}`);
    result[field] = resolved.ids;
  }
  return result;
}
