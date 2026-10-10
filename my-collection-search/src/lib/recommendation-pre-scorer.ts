/**
 * Recommendation PreScorer - Phase 2
 *
 * Applies hard constraints and computes soft bonus/penalty signals
 * prior to final scoring.
 *
 * This is Phase 2 of the multi-vector recommendation system.
 * Phase 3 will implement final weighted scoring.
 */

import { CandidateTrack, GenreRef } from "./recommendation-candidate-retriever";
import { getCamelotCode } from "./audio-vibe-normalization";

/**
 * Mode for constraint application
 */
export type RecommendationMode = "blend" | "mixable" | "strict";

/**
 * Bonuses computed for each candidate
 */
export interface CandidateBonuses {
  bpmBonus: number;
  keyBonus: number;
  tagBonus: number;
  eraBonus: number;
}

/**
 * Penalties computed for each candidate
 */
export interface CandidatePenalties {
  energyPenalty: number;
}

/**
 * Candidate with bonuses and penalties
 */
export interface ScoredCandidate extends CandidateTrack {
  bonuses: CandidateBonuses;
  penalties: CandidatePenalties;
}

/**
 * Seed track info (same structure as candidate metadata)
 */
export interface SeedTrack {
  bpm: number | null;
  key: string | null;
  keyConfidence?: number | null;
  tempoConfidence?: number | null;
  eraBucket: string | null;
  /** Taxonomy genres (direct links plus styles resolved onto the taxonomy), for scoring. */
  genres: GenreRef[];
  energy: number | null;
  danceability: number | null;
}

/**
 * Parse Camelot code to position on wheel (1-12) and type (A/B)
 */
function parseCamelotCode(camelot: string): { position: number; type: string } | null {
  if (!camelot) return null;

  const match = camelot.match(/^(\d+)([AB])$/);
  if (!match) return null;

  return {
    position: parseInt(match[1], 10),
    type: match[2],
  };
}

/**
 * Calculate Camelot distance (wheel positions + type difference)
 * Returns null if either key is invalid/missing
 *
 * Distance logic:
 * - Same code: distance = 0
 * - Same position, different type (relative major/minor): distance = 0.5
 * - Adjacent positions, same type: distance = 1
 * - Adjacent positions, different type: distance = 1.5
 * - etc.
 */
export function calculateCamelotDistance(
  key1: string | null,
  key2: string | null
): number | null {
  if (!key1 || !key2) return null;

  const camelot1 = getCamelotCode(key1);
  const camelot2 = getCamelotCode(key2);

  if (!camelot1 || !camelot2) return null;

  const parsed1 = parseCamelotCode(camelot1);
  const parsed2 = parseCamelotCode(camelot2);

  if (!parsed1 || !parsed2) return null;

  // Same camelot code
  if (camelot1 === camelot2) return 0;

  // Relative major/minor (same position, different type)
  if (parsed1.position === parsed2.position) {
    return 0.5;
  }

  // Calculate wheel distance (circular, so min of forward/backward)
  const forward = (parsed2.position - parsed1.position + 12) % 12;
  const backward = (parsed1.position - parsed2.position + 12) % 12;
  const wheelDistance = Math.min(forward, backward);

  // Type penalty (0 if same, 0.5 if different)
  const typePenalty = parsed1.type === parsed2.type ? 0 : 0.5;

  return wheelDistance + typePenalty;
}

/**
 * Check if two keys are relative major/minor
 */
function isRelativeMajorMinor(key1: string | null, key2: string | null): boolean {
  if (!key1 || !key2) return false;

  const camelot1 = getCamelotCode(key1);
  const camelot2 = getCamelotCode(key2);

  if (!camelot1 || !camelot2) return false;

  const parsed1 = parseCamelotCode(camelot1);
  const parsed2 = parseCamelotCode(camelot2);

  if (!parsed1 || !parsed2) return false;

  // Same position, different type
  return parsed1.position === parsed2.position && parsed1.type !== parsed2.type;
}

/**
 * Calculate BPM bonus based on delta
 * Scaled by tempo confidence
 */
export function calculateBpmBonus(
  seedBpm: number | null,
  candBpm: number | null,
  tempoConfidence: number | null = null
): number {
  if (seedBpm === null || candBpm === null) return 0;

  const delta = Math.abs(seedBpm - candBpm);
  let bonus = 0;

  if (delta <= 1) {
    bonus = 0.06;
  } else if (delta <= 2) {
    bonus = 0.04;
  } else if (delta <= 4) {
    bonus = 0.02;
  } else if (delta <= 6) {
    bonus = 0.01;
  } else if (delta > 8) {
    bonus = -0.03;
  }

  // Scale by tempo confidence (default to 1.0 if not provided)
  const confidence = Math.min(1, tempoConfidence ?? 1.0);
  return bonus * confidence;
}

/**
 * Calculate key bonus based on Camelot compatibility
 * Scaled by key confidence
 */
export function calculateKeyBonus(
  seedKey: string | null,
  candKey: string | null,
  keyConfidence: number | null = null
): number {
  if (!seedKey || !candKey) return 0;

  const seedCamelot = getCamelotCode(seedKey);
  const candCamelot = getCamelotCode(candKey);

  if (!seedCamelot || !candCamelot) return 0;

  let bonus = 0;

  // Same camelot code
  if (seedCamelot === candCamelot) {
    bonus = 0.06;
  } else {
    const distance = calculateCamelotDistance(seedKey, candKey);

    if (distance === null) {
      bonus = 0;
    } else if (distance <= 1) {
      // Adjacent positions, same type OR relative major/minor
      if (isRelativeMajorMinor(seedKey, candKey)) {
        bonus = 0.03;
      } else {
        bonus = 0.04; // Adjacent on wheel
      }
    } else if (isRelativeMajorMinor(seedKey, candKey)) {
      // Just relative major/minor
      bonus = 0.03;
    }
  }

  // Scale by key confidence (default to 1.0 if not provided)
  const confidence = Math.min(1, keyConfidence ?? 1.0);
  return bonus * confidence;
}

/**
 * Calculate Jaccard overlap between two arrays
 */
export function calculateJaccardOverlap(arr1: string[], arr2: string[]): number {
  if (arr1.length === 0 && arr2.length === 0) return 0;

  const set1 = new Set(arr1.map(s => s.toLowerCase()));
  const set2 = new Set(arr2.map(s => s.toLowerCase()));

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
}

/**
 * Expand each genre to itself plus its immediate parent id, so a seed in a
 * parent genre and a candidate in one of its children (or vice versa) show
 * up as overlapping rather than disjoint (#486) — cheap, since each track's
 * own `track_genres` rows already carry that parent id.
 */
function expandWithParent(genres: GenreRef[]): string[] {
  const ids: string[] = [];
  for (const genre of genres) {
    ids.push(genre.id);
    if (genre.parentId) ids.push(genre.parentId);
  }
  return ids;
}

/**
 * Jaccard overlap of two tracks' taxonomy genres (direct links plus styles
 * already resolved onto the taxonomy), hierarchy-aware via `expandWithParent`.
 * Replaces comparing raw `local_tags`/`styles` strings (#486): spelling
 * variants and aliases resolve to the same id upstream, so they no longer
 * understate overlap.
 */
export function calculateGenreOverlap(seedGenres: GenreRef[], candidateGenres: GenreRef[]): number {
  return calculateJaccardOverlap(expandWithParent(seedGenres), expandWithParent(candidateGenres));
}

/**
 * Calculate genre overlap bonus
 */
export function calculateTagBonus(seedGenres: GenreRef[], candidateGenres: GenreRef[]): number {
  return 0.08 * calculateGenreOverlap(seedGenres, candidateGenres);
}

/**
 * Define era ordering for adjacency
 */
const ERA_ORDER = [
  "pre-1950s",
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s",
];

/**
 * Check if two eras are adjacent
 */
export function areErasAdjacent(era1: string | null, era2: string | null): boolean {
  if (!era1 || !era2) return false;

  const idx1 = ERA_ORDER.indexOf(era1);
  const idx2 = ERA_ORDER.indexOf(era2);

  if (idx1 === -1 || idx2 === -1) return false;

  return Math.abs(idx1 - idx2) === 1;
}

/**
 * Calculate era bonus
 */
export function calculateEraBonus(
  seedEra: string | null,
  candEra: string | null
): number {
  if (!seedEra || !candEra) return 0;

  if (seedEra === candEra) {
    return 0.02;
  } else if (areErasAdjacent(seedEra, candEra)) {
    return 0.01;
  }

  return 0;
}

/**
 * Calculate energy penalty for large differences
 */
export function calculateEnergyPenalty(
  seedEnergy: number | null,
  candEnergy: number | null
): number {
  if (seedEnergy === null || candEnergy === null) return 0;

  const delta = Math.abs(seedEnergy - candEnergy);

  if (delta > 0.35) {
    return 0.06 * (delta - 0.35);
  }

  return 0;
}

/**
 * Apply hard constraints based on mode
 * Returns true if candidate should be rejected
 */
function shouldRejectCandidate(
  seed: SeedTrack,
  candidate: CandidateTrack,
  mode: RecommendationMode
): boolean {
  const seedBpm = seed.bpm;
  const candBpm = candidate.metadata.bpm;
  const seedKey = seed.key;
  const candKey = candidate.metadata.key;

  // Strict mode
  if (mode === "strict") {
    // Reject if BPM delta > 4
    if (seedBpm !== null && candBpm !== null) {
      if (Math.abs(seedBpm - candBpm) > 4) {
        return true;
      }
    }

    // Reject if Camelot distance > 1
    const camelotDistance = calculateCamelotDistance(seedKey, candKey);
    if (camelotDistance !== null && camelotDistance > 1) {
      return true;
    }

    // Reject if no genre overlap
    const genreOverlap = calculateGenreOverlap(seed.genres, candidate.metadata.genreRefs);
    if (genreOverlap === 0) {
      return true;
    }
  }

  // Mixable mode
  if (mode === "mixable") {
    // Reject if BPM delta > 6
    if (seedBpm !== null && candBpm !== null) {
      if (Math.abs(seedBpm - candBpm) > 6) {
        return true;
      }
    }

    // Reject if Camelot distance > 2
    const camelotDistance = calculateCamelotDistance(seedKey, candKey);
    if (camelotDistance !== null && camelotDistance > 2) {
      return true;
    }
  }

  // Blend mode (most permissive)
  if (mode === "blend") {
    // Only reject extremely large tempo mismatch
    if (seedBpm !== null && candBpm !== null) {
      if (Math.abs(seedBpm - candBpm) > 12) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Apply constraints and compute bonuses/penalties
 *
 * @param seed - Seed track
 * @param candidates - Candidates from Phase 1
 * @param mode - Constraint mode (blend, mixable, strict)
 * @returns Filtered candidates with bonuses and penalties
 */
export function applyConstraintsAndBonuses(
  seed: SeedTrack,
  candidates: CandidateTrack[],
  mode: RecommendationMode = "blend"
): ScoredCandidate[] {
  console.log(`[RecommendationPreScorer] Applying constraints and bonuses (mode: ${mode})`);
  console.log(`[RecommendationPreScorer] Input candidates: ${candidates.length}`);

  const scored: ScoredCandidate[] = [];
  let rejected = 0;

  for (const candidate of candidates) {
    // Step 1: Apply hard constraints
    if (shouldRejectCandidate(seed, candidate, mode)) {
      rejected++;
      continue;
    }

    // Step 2: Compute bonuses
    const bpmBonus = calculateBpmBonus(
      seed.bpm,
      candidate.metadata.bpm,
      candidate.metadata.tempoConfidence
    );

    const keyBonus = calculateKeyBonus(
      seed.key,
      candidate.metadata.key,
      candidate.metadata.keyConfidence
    );

    const tagBonus = calculateTagBonus(seed.genres, candidate.metadata.genreRefs);

    const eraBonus = calculateEraBonus(
      seed.eraBucket,
      candidate.metadata.eraBucket
    );

    // Step 3: Compute penalties
    const energyPenalty = calculateEnergyPenalty(
      seed.energy,
      candidate.metadata.energy
    );

    // Add to scored list
    scored.push({
      ...candidate,
      bonuses: {
        bpmBonus,
        keyBonus,
        tagBonus,
        eraBonus,
      },
      penalties: {
        energyPenalty,
      },
    });
  }

  console.log(`[RecommendationPreScorer] Rejected: ${rejected}`);
  console.log(`[RecommendationPreScorer] Scored: ${scored.length}`);

  return scored;
}
