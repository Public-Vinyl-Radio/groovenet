/**
 * Normalization utilities for audio vibe embeddings.
 * Focuses on sonic/musical characteristics: BPM, key, energy, mood, danceability.
 */

/**
 * Normalize BPM to a range descriptor
 */
export function normalizeBpmRange(bpm: string | number | null | undefined): string {
  if (!bpm) return "unknown";

  const bpmNum = typeof bpm === "string" ? parseFloat(bpm) : bpm;
  if (isNaN(bpmNum) || bpmNum <= 0) return "unknown";

  if (bpmNum < 90) return "very slow";
  if (bpmNum < 110) return "slow";
  if (bpmNum < 125) return "moderate";
  if (bpmNum < 140) return "upbeat";
  if (bpmNum < 155) return "fast";
  if (bpmNum < 170) return "very fast";
  return "extremely fast";
}

/**
 * Normalize BPM to exact value string
 */
export function normalizeBpmValue(bpm: string | number | null | undefined): string {
  if (!bpm) return "unknown";

  const bpmNum = typeof bpm === "string" ? parseFloat(bpm) : bpm;
  if (isNaN(bpmNum) || bpmNum <= 0) return "unknown";

  return Math.round(bpmNum).toString();
}

/**
 * Normalize key notation (already in format like "A Minor")
 */
export function normalizeKey(key: string | null | undefined): string {
  if (!key) return "unknown";
  return key.trim();
}

/**
 * Get Camelot code from key (using existing helper if available)
 * Fallback implementation if keyToCamelot not available
 */
export function getCamelotCode(key: string | null | undefined): string {
  if (!key) return "";

  // Simple mapping for common keys (extend as needed)
  const camelotMap: Record<string, string> = {
    "C Major": "8B",
    "A Minor": "8A",
    "G Major": "9B",
    "E Minor": "9A",
    "D Major": "10B",
    "B Minor": "10A",
    "A Major": "11B",
    "F# Minor": "11A",
    "E Major": "12B",
    "C# Minor": "12A",
    "B Major": "1B",
    "G# Minor": "1A",
    "F# Major": "2B",
    "D# Minor": "2A",
    "Db Major": "1B",
    "Bb Minor": "3A",
    "Eb Major": "5B",
    "C Minor": "5A",
    "Ab Major": "4B",
    "F Minor": "4A",
    "Bb Major": "6B",
    "G Minor": "6A",
    "F Major": "7B",
    "D Minor": "7A",
  };

  return camelotMap[key] || "";
}

/**
 * Normalize danceability score to descriptor
 */
export function normalizeDanceability(danceability: string | number | null | undefined): string {
  if (!danceability) return "unknown";

  const value = typeof danceability === "string" ? parseFloat(danceability) : danceability;
  if (isNaN(value)) return "unknown";

  if (value < 0.2) return "very low";
  if (value < 0.4) return "low";
  if (value < 0.6) return "moderate";
  if (value < 0.8) return "high";
  return "very high";
}

/**
 * Normalize mood score to descriptor
 */
export function normalizeMoodScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "none";

  if (score < 0.2) return "very low";
  if (score < 0.4) return "low";
  if (score < 0.6) return "moderate";
  if (score < 0.8) return "high";
  return "very high";
}

/**
 * Calculate energy level from danceability and aggressive mood
 */
export function calculateEnergy(
  danceability: string | number | null | undefined,
  moodAggressive: number | null | undefined,
): string {
  const danceNum = typeof danceability === "string" ? parseFloat(danceability) : danceability || 0;
  const aggNum = moodAggressive || 0;

  // Weighted combination: 60% danceability, 40% aggressiveness
  const energy = danceNum * 0.6 + aggNum * 0.4;

  if (energy < 0.2) return "very low";
  if (energy < 0.4) return "low";
  if (energy < 0.6) return "moderate";
  if (energy < 0.8) return "high";
  return "very high";
}

/**
 * Get dominant mood from mood scores
 */
export function getDominantMood(moods: {
  happy?: number | null;
  sad?: number | null;
  relaxed?: number | null;
  aggressive?: number | null;
}): string {
  const scores = [
    { name: "happy", value: moods.happy || 0 },
    { name: "sad", value: moods.sad || 0 },
    { name: "relaxed", value: moods.relaxed || 0 },
    { name: "aggressive", value: moods.aggressive || 0 },
  ];

  const sorted = scores.sort((a, b) => b.value - a.value);
  const top = sorted[0];

  if (top.value < 0.3) return "neutral";
  return top.name;
}

/**
 * Get vibe descriptors based on audio characteristics
 */
export function getVibeDescriptors(
  bpm: string | number | null | undefined,
  energy: string,
  dominantMood: string,
): string[] {
  const descriptors: string[] = [];

  // BPM-based descriptors
  const bpmNum = typeof bpm === "string" ? parseFloat(bpm) : bpm || 0;
  if (bpmNum > 0) {
    if (bpmNum < 100) descriptors.push("downtempo");
    else if (bpmNum > 140) descriptors.push("high-energy");
  }

  // Energy-based descriptors
  if (energy === "very high" || energy === "high") {
    descriptors.push("energetic");
  } else if (energy === "very low" || energy === "low") {
    descriptors.push("chill");
  }

  // Mood-based descriptors
  switch (dominantMood) {
    case "happy":
      descriptors.push("uplifting");
      break;
    case "sad":
      descriptors.push("melancholic");
      break;
    case "relaxed":
      descriptors.push("mellow");
      break;
    case "aggressive":
      descriptors.push("driving");
      break;
  }

  return descriptors.length > 0 ? descriptors : ["balanced"];
}

/**
 * Format mood scores as human-readable string
 */
export function formatMoodProfile(moods: {
  happy?: number | null;
  sad?: number | null;
  relaxed?: number | null;
  aggressive?: number | null;
}): string {
  const scores: string[] = [];

  if (moods.happy) scores.push(`Happy (${moods.happy.toFixed(2)})`);
  if (moods.sad) scores.push(`Sad (${moods.sad.toFixed(2)})`);
  if (moods.relaxed) scores.push(`Relaxed (${moods.relaxed.toFixed(2)})`);
  if (moods.aggressive) scores.push(`Aggressive (${moods.aggressive.toFixed(2)})`);

  return scores.length > 0 ? scores.join(", ") : "none";
}

/**
 * Normalize acoustic/electronic balance
 */
export function normalizeAcousticElectronic(acoustic?: number, electronic?: number): string {
  if (!acoustic && !electronic) return "unknown";

  const acousticScore = acoustic || 0;
  const electronicScore = electronic || 0;

  // If both are low, it's unknown/ambiguous
  if (acousticScore < 0.3 && electronicScore < 0.3) return "ambiguous";

  // Calculate balance (negative = acoustic, positive = electronic)
  const balance = electronicScore - acousticScore;

  if (balance < -0.4) return "very acoustic";
  if (balance < -0.15) return "acoustic";
  if (balance < 0.15) return "balanced";
  if (balance < 0.4) return "electronic";
  return "very electronic";
}

/**
 * Normalize vocal presence
 */
export function normalizeVocalPresence(instrumental?: number, voice?: number): string {
  if (!instrumental && !voice) return "unknown";

  const voiceScore = voice || 0;

  if (voiceScore < 0.15) return "instrumental";
  if (voiceScore < 0.35) return "light vocals";
  if (voiceScore < 0.65) return "moderate vocals";
  return "heavy vocals";
}

/**
 * Normalize percussiveness from onset rate
 */
export function normalizePercussiveness(onsetRate?: number): string {
  if (!onsetRate) return "unknown";

  if (onsetRate < 2) return "sparse";
  if (onsetRate < 4) return "moderate";
  if (onsetRate < 7) return "rhythmic";
  return "very rhythmic";
}

/**
 * Normalize party mood
 */
export function normalizePartyMood(partyScore?: number): string {
  if (!partyScore) return "unknown";

  if (partyScore < 0.2) return "low";
  if (partyScore < 0.4) return "moderate";
  if (partyScore < 0.6) return "high";
  return "very high";
}
