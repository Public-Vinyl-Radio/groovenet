import { getTargetProvider } from "@/lib/embeddings/config";

const CACHE_MS = 60_000;

let cached: { checkedAt: number; error: string | null } | null = null;

/**
 * Probes the embedding provider with the same key and model identity's
 * embedding code currently targets (#386), and throws with the provider's
 * own message when it refuses — an `invalid_organization` or revoked key
 * otherwise only reaches a console.error inside a PATCH, and tracks silently
 * stay without embeddings. Both kinds share one OpenAI account/key today, so
 * probing identity's target model is enough; the result is cached so the
 * About page polling it costs one request a minute.
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
    const provider = await getTargetProvider("identity");
    await provider.embed(["ping"]);
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
