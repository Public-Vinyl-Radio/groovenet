import OpenAI from "openai";

const CACHE_MS = 60_000;

let cached: { checkedAt: number; error: string | null } | null = null;

/**
 * Probes the embedding provider with the same key and model the embedding
 * code uses, and throws with the provider's own message when it refuses —
 * an `invalid_organization` or revoked key otherwise only reaches a
 * console.error inside a PATCH, and tracks silently stay without embeddings.
 * The result is cached so the About page polling it costs one request a
 * minute.
 */
export async function checkEmbeddingProvider(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  if (cached && Date.now() - cached.checkedAt < CACHE_MS) {
    if (cached.error) throw new Error(cached.error);
    return;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: "ping",
    });
    cached = { checkedAt: Date.now(), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cached = { checkedAt: Date.now(), error: message };
    throw new Error(message);
  }
}

export function resetEmbeddingHealthCache(): void {
  cached = null;
}
