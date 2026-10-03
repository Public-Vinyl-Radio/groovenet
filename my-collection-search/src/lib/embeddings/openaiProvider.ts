import OpenAI from "openai";
import type { EmbeddingProvider } from "./provider";

/** Native output size for a model with no `dims` override. */
const DEFAULT_DIMS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "My API Key",
    });
  }
  return client;
}

/**
 * `dims`, when given, is passed as OpenAI's `dimensions` param — v3 models
 * accept it and return a shortened vector (little quality loss per OpenAI's
 * own docs); omitted, the model's native size is used. Older models
 * (`text-embedding-ada-002`) don't support the param — don't pass `dims` for
 * them.
 */
export function createOpenAiEmbeddingProvider(
  model: string,
  dims?: number
): EmbeddingProvider {
  const resolvedDims = dims ?? DEFAULT_DIMS[model];
  if (!resolvedDims) {
    throw new Error(
      `Unknown dims for OpenAI embedding model "${model}" — pass dims explicitly`
    );
  }

  return {
    model,
    dims: resolvedDims,
    async embed(texts: string[]): Promise<number[][]> {
      const response = await getClient().embeddings.create({
        model,
        input: texts,
        ...(dims ? { dimensions: dims } : {}),
      });
      return response.data.map((item) => item.embedding);
    },
  };
}

/** Test helper: force a fresh client (e.g. after changing OPENAI_API_KEY). */
export function resetOpenAiClient(): void {
  client = null;
}
