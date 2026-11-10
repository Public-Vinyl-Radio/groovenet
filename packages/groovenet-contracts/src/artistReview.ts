import { z } from "zod";

const id = z.number().int().positive();
const name = z.string().trim().min(1).max(255);
const creditFields = {
  role: z.enum(["primary", "featured", "remixer", "composer"]),
  position: z.number().int().nonnegative(),
  credited_as: name,
};
export const artistReviewCreditSchema = z.union([
  z.object({ artist_id: id, ...creditFields }).strict(),
  z.object({ name, sort_name: name.optional(), ...creditFields }).strict(),
]);
export const artistSplitProposalSchema = z.object({ credits: z.array(artistReviewCreditSchema) });
export type ArtistSplitProposal = z.infer<typeof artistSplitProposalSchema>;
export const artistReviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), artist_id: id }).strict(),
  z
    .object({ action: z.literal("placeholder"), artist_id: id, is_placeholder: z.boolean() })
    .strict(),
  z.object({ action: z.literal("rename"), artist_id: id, name, sort_name: name }).strict(),
  z.object({ action: z.literal("merge"), artist_id: id, target_id: id }).strict(),
  z.object({ action: z.literal("unmerge"), merge_id: id }).strict(),
  z
    .object({
      action: z.literal("split"),
      artist_id: id,
      credits: z.array(artistReviewCreditSchema).min(2).max(50),
    })
    .strict(),
]);
export const artistReviewBodySchema = z
  .object({
    decision: artistReviewActionSchema,
    dry_run: z.boolean().default(false),
  })
  .strict();
export const artistReviewQuerySchema = z.object({
  artist_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});
const evidence = z.record(z.string(), z.unknown());
export const artistReviewDetailSchema = z.object({
  id,
  name,
  sort_name: z.string(),
  is_placeholder: z.boolean(),
  reviewed: z.boolean(),
  aliases: z.array(z.string()),
  albums: z.array(evidence),
  tracks: z.array(evidence),
  merges: z.array(z.object({ id, source_id: id, target_id: id })),
});
export const artistReviewListSchema = z.object({ items: z.array(artistReviewDetailSchema) });
export const artistReviewResultSchema = z.object({
  dry_run: z.boolean(),
  decision: artistReviewActionSchema,
  merge_id: id.optional(),
});
export type ArtistReviewAction = z.infer<typeof artistReviewActionSchema>;
export type ArtistReviewQuery = z.infer<typeof artistReviewQuerySchema>;
export type ArtistReviewDetail = z.infer<typeof artistReviewDetailSchema>;
export type ArtistReviewResult = z.infer<typeof artistReviewResultSchema>;
export type ArtistReviewCredit = z.infer<typeof artistReviewCreditSchema>;
export const artistReviewJsonSchemas = {
  ArtistSplitProposal: z.toJSONSchema(artistSplitProposalSchema),
  ArtistReviewList: z.toJSONSchema(artistReviewListSchema),
  ArtistReviewBody: z.toJSONSchema(artistReviewBodySchema),
  ArtistReviewResult: z.toJSONSchema(artistReviewResultSchema),
} as const;
