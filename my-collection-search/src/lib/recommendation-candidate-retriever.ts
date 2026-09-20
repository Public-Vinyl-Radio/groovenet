/**
 * Recommendation Candidate Retriever - Phase 1
 *
 * Retrieves candidate tracks from multiple embedding indexes (identity, audio_vibe)
 * and unions them into a deduplicated candidate set with similarity scores preserved.
 *
 * This is Phase 1 of the multi-vector recommendation system.
 * Reranking and scoring will be implemented in Phase 2.
 */

import {
  recommendationRepository,
  type RecommendationCandidateRow,
} from "@/server/repositories/recommendationRepository";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";

/**
 * Options for candidate retrieval
 */
export interface RetrieveCandidatesOptions {
  /** Limit for identity similarity query (default: 200) */
  limitIdentity?: number;

  /** Limit for audio vibe similarity query (default: 200) */
  limitAudio?: number;

  /** Optional filters (not implemented in Phase 1) */
  filters?: {
    minBpm?: number;
    maxBpm?: number;
    keys?: string[];
    minRating?: number;
    // Add more filters as needed
  };

  /** IVFFlat probes for accuracy/speed tradeoff (default: 10) */
  ivfflatProbes?: number;
}

export interface SeedTrackRef {
  trackId: string;
  friendId: number;
}

/**
 * Candidate track with similarity scores and metadata
 */
export interface CandidateTrackMetadata {
  bpm: number | null;
  key: string | null;
  keyConfidence: number | null;
  tempoConfidence: number | null;
  eraBucket: string | null;
  tags: string[];
  styles: string[];
  energy: number | null;
  danceability: number | null;
  title: string;
  artist: string;
  album: string;
  albumThumbnail: string | null;
  year: string | null;
  genres: string[];
  starRating: number | null;
  moodHappy: number | null;
  moodSad: number | null;
  moodRelaxed: number | null;
  moodAggressive: number | null;
}

export interface CandidateTrack {
  trackId: string;
  friendId: number;

  /** Identity similarity [0..1], null if not in identity results */
  simIdentity: number | null;

  /** Audio vibe similarity [0..1], null if not in audio results */
  simAudio: number | null;

  /** Track metadata for reranking */
  metadata: CandidateTrackMetadata;
}

/**
 * Result of candidate retrieval
 */
export interface RetrieveCandidatesResult {
  seedTrackId: string;
  seedFriendId: number;
  candidates: CandidateTrack[];
  stats: {
    identityCount: number;
    audioCount: number;
    unionCount: number;
    timingMs: {
      identityQuery: number;
      audioQuery: number;
      total: number;
    };
  };
}

/**
 * Internal: Result from a single embedding query
 */
type EmbeddingQueryResult = RecommendationCandidateRow;

/**
 * Convert cosine distance [0..2] to similarity [0..1]
 * pgvector cosine distance: 0 = identical, 2 = opposite
 * similarity: 1 = identical, 0 = opposite
 */
function distanceToSimilarity(distance: number): number {
  return 1 - (distance / 2);
}

/**
 * Compute era bucket from year
 */
function computeEraBucket(year: string | null): string | null {
  if (!year) return null;

  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum) || yearNum < 1900) return null;

  if (yearNum >= 2020) return "2020s";
  if (yearNum >= 2010) return "2010s";
  if (yearNum >= 2000) return "2000s";
  if (yearNum >= 1990) return "1990s";
  if (yearNum >= 1980) return "1980s";
  if (yearNum >= 1970) return "1970s";
  if (yearNum >= 1960) return "1960s";
  if (yearNum >= 1950) return "1950s";
  return "pre-1950s";
}

/**
 * Calculate energy from danceability and aggressive mood
 */
function calculateEnergy(danceability: number | null, moodAggressive: number | null): number | null {
  if (danceability === null && moodAggressive === null) return null;

  const dance = danceability ?? 0.5;
  const aggression = moodAggressive ?? 0.5;

  // Simple energy calculation (can be refined)
  return (dance * 0.6 + aggression * 0.4);
}

/**
 * Parse tags from comma-separated string
 */
function parseTags(localTags: string): string[] {
  if (!localTags) return [];
  return localTags.split(",").map(tag => tag.trim()).filter(Boolean);
}

async function queryIdentitySimilar(
  seedTrackId: string,
  seedFriendId: number,
  limit: number,
  ivfflatProbes: number
): Promise<EmbeddingQueryResult[]> {
  const rows = await recommendationRepository.findIdentitySimilar({
    seedTrackId,
    seedFriendId,
    limit,
    ivfflatProbes,
  });
  if (rows.length === 0) {
    console.warn(
      `[RecommendationCandidateRetriever] No identity embedding for seed track ${seedTrackId}`
    );
  }
  return rows;
}

async function queryIdentitySimilarByCentroid(
  seedTracks: SeedTrackRef[],
  limit: number,
  ivfflatProbes: number
): Promise<EmbeddingQueryResult[]> {
  return recommendationRepository.findIdentitySimilarByCentroid({
    seedTracks,
    limit,
    ivfflatProbes,
  });
}

async function queryAudioSimilar(
  seedTrackId: string,
  seedFriendId: number,
  limit: number,
  ivfflatProbes: number
): Promise<EmbeddingQueryResult[]> {
  const rows = await recommendationRepository.findAudioSimilar({
    seedTrackId,
    seedFriendId,
    limit,
    ivfflatProbes,
  });
  if (rows.length === 0) {
    console.warn(
      `[RecommendationCandidateRetriever] No audio_vibe embedding for seed track ${seedTrackId}`
    );
  }
  return rows;
}

async function queryAudioSimilarByCentroid(
  seedTracks: SeedTrackRef[],
  limit: number,
  ivfflatProbes: number
): Promise<EmbeddingQueryResult[]> {
  return recommendationRepository.findAudioSimilarByCentroid({
    seedTracks,
    limit,
    ivfflatProbes,
  });
}

/**
 * Convert query result to candidate track metadata
 */
function buildCandidateMetadata(row: EmbeddingQueryResult): CandidateTrackMetadata {
  return {
    bpm: row.bpm,
    key: row.key,
    keyConfidence: null, // Not available in current schema
    tempoConfidence: null, // Not available in current schema
    eraBucket: computeEraBucket(row.year),
    tags: parseTags(row.local_tags),
    styles: row.styles || [],
    energy: calculateEnergy(row.danceability, row.mood_aggressive),
    danceability: row.danceability,
    title: row.title,
    artist: row.artist,
    album: row.album,
    year: row.year,
    genres: row.genres || [],
    starRating: row.star_rating,
    albumThumbnail: row.album_thumbnail,
    moodHappy: row.mood_happy,
    moodSad: row.mood_sad,
    moodRelaxed: row.mood_relaxed,
    moodAggressive: row.mood_aggressive,
  };
}

/**
 * Retrieve candidate tracks from multiple embedding indexes
 *
 * @param seedTrackId - The track ID to find recommendations for
 * @param seedFriendId - The friend ID of the seed track
 * @param options - Retrieval options (limits, filters, etc.)
 * @returns Deduplicated union of candidates with similarity scores
 */
export async function retrieveCandidates(
  seedTrackId: string,
  seedFriendId: number,
  options: RetrieveCandidatesOptions = {}
): Promise<RetrieveCandidatesResult> {
  const startTime = Date.now();

  const {
    limitIdentity = 200,
    limitAudio = 200,
    ivfflatProbes = 10,
  } = options;

  console.log(`[RecommendationCandidateRetriever] Retrieving candidates for track ${seedTrackId}`);
  console.log(`[RecommendationCandidateRetriever] Options:`, { limitIdentity, limitAudio, ivfflatProbes });

  // Query identity similar tracks
  const identityStartTime = Date.now();
  const identityResults = await queryIdentitySimilar(
    seedTrackId,
    seedFriendId,
    limitIdentity,
    ivfflatProbes
  );
  const identityTime = Date.now() - identityStartTime;
  console.log(`[RecommendationCandidateRetriever] Identity query returned ${identityResults.length} tracks in ${identityTime}ms`);

  // Query audio vibe similar tracks
  const audioStartTime = Date.now();
  const audioResults = await queryAudioSimilar(
    seedTrackId,
    seedFriendId,
    limitAudio,
    ivfflatProbes
  );
  const audioTime = Date.now() - audioStartTime;
  console.log(`[RecommendationCandidateRetriever] Audio query returned ${audioResults.length} tracks in ${audioTime}ms`);

  // Build union with deduplication
  // Use Map to track unique tracks by composite key
  const candidateMap = new Map<string, CandidateTrack>();

  // Add identity results
  for (const row of identityResults) {
    const key = `${row.track_id}:${row.friend_id}`;
    candidateMap.set(key, {
      trackId: row.track_id,
      friendId: row.friend_id,
      simIdentity: distanceToSimilarity(row.distance),
      simAudio: null, // Will be filled if also in audio results
      metadata: buildCandidateMetadata(row),
    });
  }

  // Merge audio results
  for (const row of audioResults) {
    const key = `${row.track_id}:${row.friend_id}`;
    const existing = candidateMap.get(key);

    if (existing) {
      // Track is in both results - add audio similarity
      existing.simAudio = distanceToSimilarity(row.distance);
    } else {
      // Track only in audio results
      candidateMap.set(key, {
        trackId: row.track_id,
        friendId: row.friend_id,
        simIdentity: null,
        simAudio: distanceToSimilarity(row.distance),
        metadata: buildCandidateMetadata(row),
      });
    }
  }

  const candidates = Array.from(candidateMap.values());
  const totalTime = Date.now() - startTime;

  console.log(`[RecommendationCandidateRetriever] Union produced ${candidates.length} unique candidates`);
  console.log(`[RecommendationCandidateRetriever] Total time: ${totalTime}ms`);

  return {
    seedTrackId,
    seedFriendId,
    candidates,
    stats: {
      identityCount: identityResults.length,
      audioCount: audioResults.length,
      unionCount: candidates.length,
      timingMs: {
        identityQuery: identityTime,
        audioQuery: audioTime,
        total: totalTime,
      },
    },
  };
}

export async function retrieveCandidatesForSeedTracks(
  seedTracks: SeedTrackRef[],
  options: RetrieveCandidatesOptions = {}
): Promise<RetrieveCandidatesResult> {
  if (!Array.isArray(seedTracks) || seedTracks.length === 0) {
    throw new Error("At least one seed track is required");
  }

  const dedupedSeedTracks = Array.from(
    new Map(
      seedTracks
        .filter((seed) => seed.trackId && Number.isFinite(seed.friendId))
        .map((seed) => [`${seed.trackId}:${seed.friendId}`, seed] as const)
    ).values()
  );

  if (dedupedSeedTracks.length === 0) {
    throw new Error("No valid seed tracks provided");
  }

  const startTime = Date.now();
  const { limitIdentity = 200, limitAudio = 200, ivfflatProbes = 10 } = options;

  const identityStartTime = Date.now();
  const identityResults = await queryIdentitySimilarByCentroid(
    dedupedSeedTracks,
    limitIdentity,
    ivfflatProbes
  );
  const identityTime = Date.now() - identityStartTime;

  const audioStartTime = Date.now();
  const audioResults = await queryAudioSimilarByCentroid(
    dedupedSeedTracks,
    limitAudio,
    ivfflatProbes
  );
  const audioTime = Date.now() - audioStartTime;

  const candidateMap = new Map<string, CandidateTrack>();

  for (const row of identityResults) {
    const key = `${row.track_id}:${row.friend_id}`;
    candidateMap.set(key, {
      trackId: row.track_id,
      friendId: row.friend_id,
      simIdentity: distanceToSimilarity(row.distance),
      simAudio: null,
      metadata: buildCandidateMetadata(row),
    });
  }

  for (const row of audioResults) {
    const key = `${row.track_id}:${row.friend_id}`;
    const existing = candidateMap.get(key);
    if (existing) {
      existing.simAudio = distanceToSimilarity(row.distance);
    } else {
      candidateMap.set(key, {
        trackId: row.track_id,
        friendId: row.friend_id,
        simIdentity: null,
        simAudio: distanceToSimilarity(row.distance),
        metadata: buildCandidateMetadata(row),
      });
    }
  }

  const totalTime = Date.now() - startTime;
  const seed0 = dedupedSeedTracks[0];

  return {
    seedTrackId: seed0.trackId,
    seedFriendId: seed0.friendId,
    candidates: Array.from(candidateMap.values()),
    stats: {
      identityCount: identityResults.length,
      audioCount: audioResults.length,
      unionCount: candidateMap.size,
      timingMs: {
        identityQuery: identityTime,
        audioQuery: audioTime,
        total: totalTime,
      },
    },
  };
}

/**
 * Helper: Check if a track has embeddings
 */
export async function hasEmbeddings(
  trackId: string,
  friendId: number
): Promise<{ identity: boolean; audio: boolean }> {
  const types = new Set(
    await embeddingsRepository.listEmbeddingTypesForTrack(trackId, friendId)
  );

  return {
    identity: types.has("identity"),
    audio: types.has("audio_vibe"),
  };
}

export async function hasEmbeddingsForSeedTracks(
  seedTracks: SeedTrackRef[]
): Promise<{ identity: boolean; audio: boolean }> {
  const dedupedSeedTracks = Array.from(
    new Map(
      seedTracks
        .filter((seed) => seed.trackId && Number.isFinite(seed.friendId))
        .map((seed) => [`${seed.trackId}:${seed.friendId}`, seed] as const)
    ).values()
  );

  if (dedupedSeedTracks.length === 0) {
    return { identity: false, audio: false };
  }

  const types = new Set(
    await embeddingsRepository.listEmbeddingTypesForTrackPairs(dedupedSeedTracks)
  );
  return {
    identity: types.has("identity"),
    audio: types.has("audio_vibe"),
  };
}
