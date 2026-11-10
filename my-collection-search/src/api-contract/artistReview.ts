import { z } from "zod";
import type { ApiContractRoute } from "./routes";

import {
  artistSplitProposalSchema,
  artistReviewBodySchema,
  artistReviewListSchema,
  artistReviewQuerySchema,
  artistReviewResultSchema,
} from "@groovenet/contracts";
export {
  artistReviewBodySchema,
  artistReviewListSchema,
  artistReviewQuerySchema,
  artistReviewResultSchema,
} from "@groovenet/contracts";
export type {
  ArtistReviewAction,
  ArtistReviewQuery,
  ArtistReviewDetail,
  ArtistReviewResult,
} from "@groovenet/contracts";
const error = z.object({ error: z.string() });
export const artistReviewContracts: ApiContractRoute[] = [
  {
    operationId: "getArtistSplitProposal",
    method: "get",
    path: "/api/artists/review/{id}/split-proposal",
    summary: "Suggest ordered credits for an artist review",
    tags: ["Artists"],
    successSchema: artistSplitProposalSchema,
    errorSchema: error,
    openapi: {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: {
        "200": {
          description: "Proposed split",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ArtistSplitProposal" } },
          },
        },
        "404": { description: "Artist not found" },
      },
    },
  },
  {
    operationId: "listArtistReview",
    method: "get",
    path: "/api/artists/review",
    summary:
      "Unresolved legacy artist strings with collection credit evidence; artist_id also finds reviewed artists",
    tags: ["Artists"],
    querySchema: artistReviewQuerySchema,
    successSchema: artistReviewListSchema,
    errorSchema: error,
    openapi: {
      parameters: Object.entries(artistReviewQuerySchema.shape).map(([name, schema]) => ({
        name,
        in: "query",
        required: false,
        schema: z.toJSONSchema(schema),
      })),
      responses: {
        "200": {
          description: "Review queue",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ArtistReviewList" } },
          },
        },
      },
    },
  },
  {
    operationId: "reviewArtist",
    method: "post",
    path: "/api/artists/review",
    summary:
      "Accept, split, merge, undo a merge, rename, or mark a placeholder; dry_run validates and rolls back",
    tags: ["Artists"],
    bodySchema: artistReviewBodySchema,
    successSchema: artistReviewResultSchema,
    errorSchema: error,
    openapi: {
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ArtistReviewBody" } },
        },
      },
      responses: {
        "200": {
          description: "Review decision",
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ArtistReviewResult" } },
          },
        },
        "400": { description: "Invalid decision" },
        "404": { description: "Artist or merge not found" },
        "409": { description: "Decision conflicts with current state" },
      },
    },
  },
];
