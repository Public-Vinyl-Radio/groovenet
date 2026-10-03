import { settingsRepository } from "@/server/repositories/settingsRepository";
import type { EmbeddingModelKind, EmbeddingModelSettings } from "@/types/embeddings";
import { createOpenAiEmbeddingProvider } from "./openaiProvider";
import type { EmbeddingProvider } from "./provider";

/**
 * A model switch (#386) is two settings, not one: `target` is what new jobs
 * embed with, `serving` is what similarity queries filter to. Flipping
 * `target` alone lets a backfill build the new model's set without touching
 * what's served; flipping `serving` afterwards is the actual cutover. Kept
 * in `embedding_model_settings` (global — this is an infra choice, not a
 * per-friend preference) and cached briefly, same shape as the prompt
 * template cache in `track-embedding.ts`.
 */

const CACHE_TTL_MS = 60_000;

type CacheEntry = { settings: EmbeddingModelSettings; expiresAt: number };

const cache = new Map<EmbeddingModelKind, CacheEntry>();

export function invalidateEmbeddingModelCache(kind?: EmbeddingModelKind): void {
  if (kind) cache.delete(kind);
  else cache.clear();
}

async function getSettings(kind: EmbeddingModelKind): Promise<EmbeddingModelSettings> {
  const now = Date.now();
  const cached = cache.get(kind);
  if (cached && cached.expiresAt > now) return cached.settings;

  const settings = await settingsRepository.findEmbeddingModelSettings(kind);
  if (!settings) {
    throw new Error(`No embedding_model_settings row for "${kind}"`);
  }

  cache.set(kind, { settings, expiresAt: now + CACHE_TTL_MS });
  return settings;
}

/** What identity/audio_vibe generation should embed with right now. */
export async function getTargetProvider(kind: EmbeddingModelKind): Promise<EmbeddingProvider> {
  const settings = await getSettings(kind);
  return createOpenAiEmbeddingProvider(settings.target_model, settings.target_dims);
}

/** What identity/audio_vibe similarity queries should filter to right now. */
export async function getServingModel(
  kind: EmbeddingModelKind
): Promise<{ model: string; dims: number }> {
  const settings = await getSettings(kind);
  return { model: settings.serving_model, dims: settings.serving_dims };
}

export async function setTargetModel(
  kind: EmbeddingModelKind,
  model: string,
  dims: number
): Promise<EmbeddingModelSettings> {
  const updated = await settingsRepository.updateTargetModel(kind, model, dims);
  if (!updated) throw new Error(`No embedding_model_settings row for "${kind}"`);
  invalidateEmbeddingModelCache(kind);
  return updated;
}

export async function setServingModel(
  kind: EmbeddingModelKind,
  model: string,
  dims: number
): Promise<EmbeddingModelSettings> {
  const updated = await settingsRepository.updateServingModel(kind, model, dims);
  if (!updated) throw new Error(`No embedding_model_settings row for "${kind}"`);
  invalidateEmbeddingModelCache(kind);
  return updated;
}

export async function listEmbeddingModelSettings(): Promise<EmbeddingModelSettings[]> {
  return settingsRepository.listEmbeddingModelSettings();
}
