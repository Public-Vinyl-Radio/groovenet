import { z } from "zod";
import {
  embeddingQueueStatusSchema,
  embeddingQueueRetryResponseSchema,
} from "@/api-contract/schemas";
import { http } from "@/services/http";

export type EmbeddingQueueStatusResponse = z.infer<typeof embeddingQueueStatusSchema>;
export type EmbeddingQueueRetryResponse = z.infer<typeof embeddingQueueRetryResponseSchema>;

export async function fetchEmbeddingQueueStatus(): Promise<EmbeddingQueueStatusResponse> {
  return await http<EmbeddingQueueStatusResponse>("/api/embeddings/queue", {
    method: "GET",
    cache: "no-store",
  });
}

export async function retryFailedEmbeddingJobs(
  ids: string[]
): Promise<EmbeddingQueueRetryResponse> {
  return await http<EmbeddingQueueRetryResponse>("/api/embeddings/queue/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}
