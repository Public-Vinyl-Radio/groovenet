import { z } from "zod";
import {
  recommendationsBatchBodySchema,
  recommendationsResponseSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type RecommendationCandidatesBatchBody = z.input<typeof recommendationsBatchBodySchema>;
export type RecommendationCandidatesResponse = z.infer<typeof recommendationsResponseSchema>;

export async function fetchRecommendationCandidates(
  body: RecommendationCandidatesBatchBody,
): Promise<RecommendationCandidatesResponse> {
  return await http<RecommendationCandidatesResponse>("/api/recommendations/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
