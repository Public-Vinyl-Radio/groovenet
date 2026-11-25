import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { EmbeddingProvider } from "./provider";
import { LOCAL_EMBEDDING_MODEL, LOCAL_EMBEDDING_DIMS, LOCAL_MODEL_PATH } from "./localModel";

let extractor: Promise<FeatureExtractionPipeline> | undefined;
let pending: Promise<unknown> = Promise.resolve();

function getExtractor(): Promise<FeatureExtractionPipeline> {
  extractor ??= (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    // The image contains every required file. Never reach the network or
    // write a cache, including on read-only production filesystems.
    env.allowRemoteModels = false;
    env.useFSCache = false;
    return pipeline("feature-extraction", LOCAL_MODEL_PATH, {
      local_files_only: true,
      dtype: "q8",
      device: "cpu",
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    });
  })().catch((error) => {
    extractor = undefined;
    throw error;
  });
  return extractor;
}

/** One lazy shared CPU session; bounded batches and serialized inference keep RAM bounded. */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly model = LOCAL_EMBEDDING_MODEL;
  readonly dims = LOCAL_EMBEDDING_DIMS;

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const run = pending.then(async () => {
      const pipe = await getExtractor();
      const vectors: number[][] = [];
      for (let offset = 0; offset < texts.length; offset += 8) {
        const result = await pipe(texts.slice(offset, offset + 8), {
          pooling: "cls",
          normalize: true,
        });
        vectors.push(...(result.tolist() as number[][]));
      }
      return vectors;
    });
    pending = run.catch(() => undefined);
    return run;
  }
}
