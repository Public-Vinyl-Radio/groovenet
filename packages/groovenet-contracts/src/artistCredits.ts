import { z } from "zod";

export const artistCreditRoleSchema = z.enum(["primary", "featured", "remixer", "composer"]);

/**
 * One artist credited on an album or a track (#710). `artist` on the entity
 * stays the display string; this is the structured credit behind it, in
 * credit order, with the slug that links to the artist page.
 */
export const artistCreditRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  is_placeholder: z.boolean().meta({
    description: "Placeholders such as Various have no page; clients go to the album search",
  }),
  role: artistCreditRoleSchema,
  position: z.number().int().nonnegative(),
  credited_as: z.string().meta({ description: "The spelling this release credits them as" }),
});
/**
 * An artist a search is filtered on (#709): enough to name its removable chip
 * and link to the page. Merged artists come back as their survivor.
 */
export const artistFilterRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
});
export type ArtistFilterRef = z.infer<typeof artistFilterRefSchema>;

/** `artist` on track and album search: slugs or numeric ids, ORed (#709). */
export const artistFilterQueryShape = {
  artist: z.array(z.string()).max(20).optional(),
};

/** Echoed on a search response whenever `artist` was given, in request order. */
export const artistFilterResponseShape = {
  filter_artists: z.array(artistFilterRefSchema).optional().meta({
    description:
      "The artists an artist filter resolved to, for its chips; omitted without an artist filter.",
  }),
};
export type ArtistCreditRole = z.infer<typeof artistCreditRoleSchema>;
export type ArtistCreditRef = z.infer<typeof artistCreditRefSchema>;

export const artistCreditsFieldSchema = z
  .array(artistCreditRefSchema)
  .optional()
  .meta({
    description:
      "Structured artist credits in order; omitted where a response does not load them. " +
      "A track with no credits of its own carries its album's.",
  });
