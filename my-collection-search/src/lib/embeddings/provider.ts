/**
 * One interface every embedding generator (identity, audio_vibe, the legacy
 * prompt column) calls through, instead of each constructing its own OpenAI
 * client and hardcoding a model name (#386). `model`/`dims` are read off the
 * provider rather than passed around separately, so a caller can't drift
 * from what it actually generated.
 */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dims: number;
  embed(texts: string[]): Promise<number[][]>;
}
