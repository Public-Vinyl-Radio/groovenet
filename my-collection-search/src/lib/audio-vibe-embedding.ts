/**
 * Audio vibe embedding service.
 * Generates embeddings based on sonic/musical characteristics:
 * BPM, key, energy, mood, danceability.
 */

import OpenAI from "openai";
import crypto from "crypto";
import {
  normalizeBpmRange,
  normalizeBpmValue,
  normalizeKey,
  getCamelotCode,
  normalizeDanceability,
  calculateEnergy,
  getDominantMood,
  getVibeDescriptors,
  formatMoodProfile,
  normalizeAcousticElectronic,
  normalizeVocalPresence,
  normalizePercussiveness,
  normalizePartyMood,
} from "./audio-vibe-normalization";
import { Track } from "@/types/track";
import { readEssentiaAnalysis } from "./essentia-storage";
import { trackRepository } from "@/server/repositories/trackRepository";
import { embeddingsRepository } from "@/server/repositories/embeddingsRepository";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "My API Key",
});

/**
 * Essentia analysis structure (subset we care about)
 */
interface EssentiaAnalysis {
  highlevel?: {
    mood_acoustic?: { all?: { acoustic?: number } };
    mood_electronic?: { all?: { electronic?: number } };
    voice_instrumental?: { all?: { instrumental?: number; voice?: number } };
    mood_party?: { all?: { party?: number } };
  };
  rhythm?: {
    onset_rate?: number;
  };
}

/**
 * Audio vibe data for embedding
 */
export interface AudioVibeData {
  bpm: string;
  bpmRange: string;
  key: string;
  camelot: string;
  danceability: string;
  energy: string;
  dominantMood: string;
  moodProfile: string;
  vibeDescriptors: string[];
  // Enhanced features from raw Essentia file
  acoustic?: string;
  vocalPresence?: string;
  percussiveness?: string;
  partyMood?: string;
}

/**
 * Extract enhanced features from raw Essentia analysis
 */
function extractEnhancedFeatures(
  track_id: string,
  friend_id: number
): Pick<AudioVibeData, "acoustic" | "vocalPresence" | "percussiveness" | "partyMood"> {
  const defaults = {
    acoustic: undefined,
    vocalPresence: undefined,
    percussiveness: undefined,
    partyMood: undefined,
  };

  try {
    const essentiaData = readEssentiaAnalysis(track_id, friend_id);
    if (!essentiaData?.payload) return defaults;

    const analysis = essentiaData.payload as { analysis?: EssentiaAnalysis };
    const highlevel = analysis?.analysis?.highlevel;
    const rhythm = analysis?.analysis?.rhythm;

    if (!highlevel && !rhythm) return defaults;

    const acousticScore = highlevel?.mood_acoustic?.all?.acoustic;
    const electronicScore = highlevel?.mood_electronic?.all?.electronic;
    const instrumentalScore = highlevel?.voice_instrumental?.all?.instrumental;
    const voiceScore = highlevel?.voice_instrumental?.all?.voice;
    const partyScore = highlevel?.mood_party?.all?.party;
    const onsetRate = rhythm?.onset_rate;

    return {
      acoustic: normalizeAcousticElectronic(acousticScore, electronicScore),
      vocalPresence: normalizeVocalPresence(instrumentalScore, voiceScore),
      percussiveness: normalizePercussiveness(onsetRate),
      partyMood: normalizePartyMood(partyScore),
    };
  } catch {
    // Silently fall back to undefined if Essentia file doesn't exist
    return defaults;
  }
}

/**
 * Build audio vibe data from track (with optional enhanced features)
 */
export function buildAudioVibeData(
  track: Track,
  includeEnhanced = true
): AudioVibeData {
  const bpm = normalizeBpmValue(track.bpm);
  const bpmRange = normalizeBpmRange(track.bpm);
  const key = normalizeKey(track.key);
  const camelot = getCamelotCode(track.key);
  const danceability = normalizeDanceability(track.danceability);

  const energy = calculateEnergy(track.danceability, track.mood_aggressive);

  const dominantMood = getDominantMood({
    happy: track.mood_happy,
    sad: track.mood_sad,
    relaxed: track.mood_relaxed,
    aggressive: track.mood_aggressive,
  });

  const moodProfile = formatMoodProfile({
    happy: track.mood_happy,
    sad: track.mood_sad,
    relaxed: track.mood_relaxed,
    aggressive: track.mood_aggressive,
  });

  const vibeDescriptors = getVibeDescriptors(track.bpm, energy, dominantMood);

  // Base vibe data
  const baseData: AudioVibeData = {
    bpm,
    bpmRange,
    key,
    camelot,
    danceability,
    energy,
    dominantMood,
    moodProfile,
    vibeDescriptors,
  };

  // Add enhanced features from raw Essentia file if requested
  if (includeEnhanced && track.track_id && track.friend_id) {
    const enhanced = extractEnhancedFeatures(track.track_id, track.friend_id);
    return { ...baseData, ...enhanced };
  }

  return baseData;
}

/**
 * Build audio vibe embedding text from normalized data
 * Uses a strict template for stability
 */
export function buildAudioVibeText(data: AudioVibeData): string {
  const lines = [
    `BPM: ${data.bpm} (${data.bpmRange})`,
    `Key: ${data.key}${data.camelot ? ` - ${data.camelot}` : ""}`,
    `Danceability: ${data.danceability}`,
    `Energy: ${data.energy}`,
    `Dominant Mood: ${data.dominantMood}`,
    `Mood Profile: ${data.moodProfile}`,
  ];

  // Add enhanced features if available
  if (data.acoustic) {
    lines.push(`Acoustic: ${data.acoustic}`);
  }
  if (data.vocalPresence) {
    lines.push(`Vocals: ${data.vocalPresence}`);
  }
  if (data.percussiveness) {
    lines.push(`Percussiveness: ${data.percussiveness}`);
  }
  if (data.partyMood) {
    lines.push(`Party: ${data.partyMood}`);
  }

  lines.push(`Vibe: ${data.vibeDescriptors.join(", ")}`);

  return lines.join("\n");
}

/**
 * Compute SHA256 hash of audio vibe data for change detection
 */
export function computeAudioVibeHash(data: AudioVibeData): string {
  const canonical = JSON.stringify(
    {
      bpm: data.bpm,
      bpmRange: data.bpmRange,
      key: data.key,
      danceability: data.danceability,
      energy: data.energy,
      dominantMood: data.dominantMood,
      moodProfile: data.moodProfile,
      vibeDescriptors: data.vibeDescriptors.sort(),
      acoustic: data.acoustic,
      vocalPresence: data.vocalPresence,
      percussiveness: data.percussiveness,
      partyMood: data.partyMood,
    },
    null,
    0
  );

  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Generate OpenAI embedding for audio vibe text
 */
export async function generateAudioVibeEmbedding(
  vibeText: string
): Promise<number[]> {
  console.log("Generating audio vibe embedding for:\n", vibeText);

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: vibeText,
  });

  return response.data[0].embedding;
}

/**
 * Store audio vibe embedding in database
 */
export async function storeAudioVibeEmbedding(
  track_id: string,
  friend_id: number,
  embedding: number[],
  sourceHash: string,
  vibeText: string,
  model = "text-embedding-3-small",
  dims = 1536
): Promise<void> {
  await embeddingsRepository.upsertTrackEmbedding({
    trackId: track_id,
    friendId: friend_id,
    embeddingType: "audio_vibe",
    model,
    dims,
    embedding,
    sourceHash,
    identityText: vibeText,
  });
}

/**
 * Check if audio vibe embedding needs update (source hash changed)
 */
export async function needsAudioVibeUpdate(
  track_id: string,
  friend_id: number,
  newSourceHash: string
): Promise<boolean> {
  const sourceHash = await embeddingsRepository.findEmbeddingSourceHash(
    track_id,
    friend_id,
    "audio_vibe"
  );
  if (!sourceHash) {
    return true; // No embedding exists
  }

  return sourceHash !== newSourceHash;
}

/**
 * Check if track has audio analysis data
 */
export function hasAudioData(track: Track): boolean {
  return !!(
    track.bpm ||
    track.key ||
    track.danceability ||
    track.mood_happy ||
    track.mood_sad ||
    track.mood_relaxed ||
    track.mood_aggressive
  );
}

/**
 * Generate and store audio vibe embedding for a track (main entry point)
 */
export async function generateAndStoreAudioVibeEmbedding(
  track_id: string,
  friend_id: number,
  forceUpdate = false
): Promise<{ updated: boolean; reason: string }> {
  const track = await trackRepository.findTrackByTrackIdAndFriendIdRaw(
    track_id,
    friend_id
  );
  if (!track) {
    throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
  }

  // Check if track has audio analysis data
  if (!hasAudioData(track)) {
    return {
      updated: false,
      reason: "Track missing audio analysis data (BPM, key, mood, etc.)",
    };
  }

  // Build audio vibe data
  const vibeData = buildAudioVibeData(track);
  const sourceHash = computeAudioVibeHash(vibeData);

  // Check if update needed
  if (!forceUpdate) {
    const needsUpdate = await needsAudioVibeUpdate(track_id, friend_id, sourceHash);
    if (!needsUpdate) {
      return { updated: false, reason: "Source hash unchanged" };
    }
  }

  // Generate embedding
  const vibeText = buildAudioVibeText(vibeData);
  const embedding = await generateAudioVibeEmbedding(vibeText);

  // Store in database
  await storeAudioVibeEmbedding(
    track_id,
    friend_id,
    embedding,
    sourceHash,
    vibeText
  );

  return { updated: true, reason: "Audio vibe embedding generated and stored" };
}

/**
 * Get audio vibe preview (for debugging/testing)
 */
export async function getAudioVibePreview(
  track_id: string,
  friend_id: number
): Promise<{ vibeText: string; vibeData: AudioVibeData }> {
  const track = await trackRepository.findTrackByTrackIdAndFriendIdRaw(
    track_id,
    friend_id
  );
  if (!track) {
    throw new Error(`Track not found: ${track_id} (friend_id: ${friend_id})`);
  }

  if (!hasAudioData(track)) {
    throw new Error("Track missing audio analysis data");
  }

  const vibeData = buildAudioVibeData(track);
  const vibeText = buildAudioVibeText(vibeData);

  return { vibeText, vibeData };
}
