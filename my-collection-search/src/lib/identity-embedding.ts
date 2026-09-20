/**
 * Music identity embedding service.
 * Generates deterministic, normalized embeddings for track identity.
 */

import OpenAI from "openai";
import crypto from "crypto";
import {
  formatList,
  yearToEra,
  normalizeCountry,
  normalizeLabels,
  combineGenres,
  normalizeStyles,
  normalizeLocalTags,
  normalizeComposer,
} from "./identity-normalization";
import {
  trackRepository,
  type TrackWithAlbumMetadataRow,
} from "@/server/repositories/trackRepository";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "My API Key",
});

/**
 * Normalized identity data for embedding
 */
interface IdentityData {
  title: string;
  artist: string;
  album: string;
  era: string;
  country: string;
  labels: string[];
  composers: string[];
  genres: string[];
  styles: string[];
  tags: string[];
}

/**
 * Fetch track with album metadata (country, label, etc.)
 */
export async function fetchTrackWithAlbum(
  track_id: string,
  friend_id: number
): Promise<TrackWithAlbumMetadataRow | null> {
  return trackRepository.findTrackWithAlbumMetadata(track_id, friend_id);
}

/**
 * Build normalized identity data from track
 */
export function buildIdentityData(track: TrackWithAlbumMetadataRow): IdentityData {
  // Normalize basic fields
  const title = (track.title || "unknown").trim();
  const artist = (track.artist || "unknown").trim();
  const album = (track.album || "unknown").trim();

  // Era bucketing
  const era = yearToEra(track.year);

  // Country from album or fallback
  const country = normalizeCountry(track.album_country);

  // Labels (from album, parse if string)
  const labelString = track.album_label || "";
  const labels = normalizeLabels(labelString ? labelString.split(",") : []);

  // Genres: prefer Discogs (album or track), fallback to track genres
  const genres = combineGenres(
    track.album_genres || track.genres,
    null, // No separate Apple genre field in Track type
    8
  );

  // Styles: prefer album styles, fallback to track styles
  const styleSource = track.album_styles || track.styles;
  const styles = normalizeStyles(styleSource, 12);

  // Local tags: filter out DJ-function tags
  const tags = normalizeLocalTags(track.local_tags, 12);

  // Composer(s): normalize if present
  const composers = normalizeComposer(track.composer);

  // Sort the list fields once, here, so identity data is canonical from the
  // start: the embedding text, the source hash and the preview all agree on
  // ordering without anyone having to re-sort (and without mutating a caller).
  return {
    title,
    artist,
    album,
    era,
    country,
    labels: [...labels].sort(),
    composers: [...composers].sort(),
    genres: [...genres].sort(),
    styles: [...styles].sort(),
    tags: [...tags].sort(),
  };
}

/**
 * Build identity embedding text from normalized data
 * Uses a strict template for stability
 */
export function buildIdentityText(data: IdentityData): string {
  const lines = [
    `Track: ${data.title} — ${data.artist}`,
    `Release: ${data.album} (${data.era})`,
    data.composers.length > 0 ? `Composer: ${formatList(data.composers)}` : null,
    `Country: ${data.country}`,
    `Labels: ${data.labels.length > 0 ? formatList(data.labels) : "none"}`,
    `Genres: ${data.genres.length > 0 ? formatList(data.genres) : "unknown"}`,
    `Styles: ${data.styles.length > 0 ? formatList(data.styles) : "unknown"}`,
    `Tags: ${data.tags.length > 0 ? formatList(data.tags) : "none"}`,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Compute SHA256 hash of identity data for change detection
 */
export function computeSourceHash(data: IdentityData): string {
  // Create a stable, sorted representation
  const canonical = JSON.stringify(
    {
      title: data.title,
      artist: data.artist,
      album: data.album,
      era: data.era,
      country: data.country,
      // Copy before sorting — Array.prototype.sort is in place, and hashing
      // must not rewrite the caller's data.
      labels: [...data.labels].sort(),
      composers: [...data.composers].sort(),
      genres: [...data.genres].sort(),
      styles: [...data.styles].sort(),
      tags: [...data.tags].sort(),
    },
    null,
    0
  );

  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Generate OpenAI embedding for identity text
 */
export async function generateIdentityEmbedding(
  identityText: string
): Promise<number[]> {
  console.log("Generating identity embedding for:\n", identityText);

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: identityText,
  });

  return response.data[0].embedding;
}

/**
 * Store identity embedding in database
 */
export async function storeIdentityEmbedding(
  track_id: string,
  friend_id: number,
  embedding: number[],
  sourceHash: string,
  identityText: string,
  model = "text-embedding-3-small",
  dims = 1536
): Promise<void> {
  await embeddingsRepository.upsertTrackEmbedding({
    trackId: track_id,
    friendId: friend_id,
    embeddingType: "identity",
    model,
    dims,
    embedding,
    sourceHash,
    identityText,
  });
}

/**
 * Check if embedding needs update (source hash changed)
 */
export async function needsEmbeddingUpdate(
  track_id: string,
  friend_id: number,
  newSourceHash: string
): Promise<boolean> {
  const sourceHash = await embeddingsRepository.findEmbeddingSourceHash(
    track_id,
    friend_id,
    "identity"
  );
  if (!sourceHash) {
    return true; // No embedding exists
  }

  return sourceHash !== newSourceHash;
}

/**
 * Generate and store identity embedding for a track (main entry point)
 */
export async function generateAndStoreIdentityEmbedding(
  track_id: string,
  friend_id: number,
  forceUpdate = false
): Promise<{ updated: boolean; reason: string }> {
  // Fetch track with album data
  const track = await fetchTrackWithAlbum(track_id, friend_id);
  if (!track) {
    throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
  }

  // Build identity data
  const identityData = buildIdentityData(track);
  const sourceHash = computeSourceHash(identityData);

  // Check if update needed
  if (!forceUpdate) {
    const needsUpdate = await needsEmbeddingUpdate(track_id, friend_id, sourceHash);
    if (!needsUpdate) {
      return { updated: false, reason: "Source hash unchanged" };
    }
  }

  // Generate embedding
  const identityText = buildIdentityText(identityData);
  const embedding = await generateIdentityEmbedding(identityText);

  // Store in database
  await storeIdentityEmbedding(
    track_id,
    friend_id,
    embedding,
    sourceHash,
    identityText
  );

  return { updated: true, reason: "Embedding generated and stored" };
}

/**
 * Get identity embedding preview (for debugging/testing)
 */
export async function getIdentityPreview(
  track_id: string,
  friend_id: number
): Promise<{ identityText: string; identityData: IdentityData }> {
  const track = await fetchTrackWithAlbum(track_id, friend_id);
  if (!track) {
    throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
  }

  const identityData = buildIdentityData(track);
  const identityText = buildIdentityText(identityData);

  return { identityText, identityData };
}
