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
