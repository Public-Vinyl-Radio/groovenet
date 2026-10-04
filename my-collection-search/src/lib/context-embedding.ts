/**
 * Context embeddings for natural-language retrieval (#408).
 *
 * Same normalized inputs as the identity embedding, rendered differently:
 * descriptors first as one sentence, then the identifiers. On #382's frozen
 * query set this text ("F") beat the identity text on 16 of 24 queries
 * (precision@10 0.89–0.90 vs 0.77), while doing worse on the playlist-mate
 * proxy — so it sits beside `identity`, which keeps serving similar tracks.
 */

import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";
import { getTargetModel, getTargetProvider } from "@/lib/embeddings/config";
import { CURRENT_TEMPLATE_VERSIONS } from "@/lib/embeddings/templateVersions";
import {
  buildIdentityData,
  computeSourceHash,
  fetchTrackWithAlbum,
  type IdentityData,
} from "@/lib/identity-embedding";
import { formatList } from "@/lib/identity-normalization";

/** Bump in `templateVersions.ts` when the context text changes for the same track. */
export const CONTEXT_TEMPLATE_VERSION = CURRENT_TEMPLATE_VERSIONS.context;

/**
 * `<styles and tags>. <genres> music from the <era>.` then the identifier
 * lines. Release country is left out: it is where a pressing was released,
 * not where the music is from (229 of 409 albums in the #382 snapshot were
 * `US` pressings), and composer was never populated in that snapshot.
 */
export function buildContextText(data: IdentityData): string {
  const descriptors = [...new Set([...data.styles, ...data.tags])];
  const genres = data.genres.length > 0 ? `${formatList(data.genres)} music` : "music";
  const era = data.era === "unknown-era" ? "" : ` from the ${data.era}`;
  const summary = `${genres}${era}.`;

  return [
    descriptors.length > 0 ? `${formatList(descriptors)}. ${summary}` : summary,
    `Track: ${data.title} — ${data.artist}`,
    `Release: ${data.album}`,
    `Labels: ${data.labels.length > 0 ? formatList(data.labels) : "none"}`,
  ].join("\n");
}

/** True when there is no row at the target model and current template, or the data changed. */
export async function needsContextUpdate(
  track_id: string,
  friend_id: number,
  newSourceHash: string
): Promise<boolean> {
  const { model } = await getTargetModel("context");
  const sourceHash = await embeddingsRepository.findEmbeddingSourceHash(
    track_id,
    friend_id,
    "context",
    model,
    CONTEXT_TEMPLATE_VERSION
  );
  return !sourceHash || sourceHash !== newSourceHash;
}

/** Generate and store the context embedding for a track (the queue worker's entry point). */
export async function generateAndStoreContextEmbedding(
  track_id: string,
  friend_id: number,
  forceUpdate = false
): Promise<{ updated: boolean; reason: string }> {
  const track = await fetchTrackWithAlbum(track_id, friend_id);
  if (!track) {
    throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
  }

  const data = buildIdentityData(track);
  // The context text is a function of the identity data, so the identity
  // hash detects every input change that matters here.
  const sourceHash = computeSourceHash(data);
  if (!forceUpdate && !(await needsContextUpdate(track_id, friend_id, sourceHash))) {
    return { updated: false, reason: "Source hash unchanged" };
  }

  const contextText = buildContextText(data);
  const provider = await getTargetProvider("context");
  const [embedding] = await provider.embed([contextText]);

  await embeddingsRepository.upsertTrackEmbedding({
    trackId: track_id,
    friendId: friend_id,
    embeddingType: "context",
    model: provider.model,
    dims: provider.dims,
    embedding,
    sourceHash,
    identityText: contextText,
    templateVersion: CONTEXT_TEMPLATE_VERSION,
  });

  return { updated: true, reason: "Embedding generated and stored" };
}

/** The exact text the pipeline embeds, for `/api/tracks/{id}/embedding-preview`. */
export async function getContextPreview(
  track_id: string,
  friend_id: number
): Promise<{ contextText: string; contextData: IdentityData }> {
  const track = await fetchTrackWithAlbum(track_id, friend_id);
  if (!track) {
    throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
  }

  const contextData = buildIdentityData(track);
  return { contextText: buildContextText(contextData), contextData };
}
