import type { EmbeddingProvider } from "./provider";
import { createOpenAiEmbeddingProvider } from "./openaiProvider";
import { LocalEmbeddingProvider } from "./localProvider";
import { LOCAL_EMBEDDING_MODEL, LOCAL_EMBEDDING_DIMS } from "./localModel";

export function createEmbeddingProvider(model: string, dims: number): EmbeddingProvider {
  if (model === LOCAL_EMBEDDING_MODEL) {
    if (dims !== LOCAL_EMBEDDING_DIMS) throw new Error(`Invalid dimensions for ${model}: ${dims}`);
    return new LocalEmbeddingProvider();
  }
  return createOpenAiEmbeddingProvider(model, dims);
}
