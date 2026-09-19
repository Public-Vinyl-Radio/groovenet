import type { TrackWithLibraryIdentifierRow } from "@/server/repositories/trackRepository";

type TrackField = keyof TrackWithLibraryIdentifierRow;

// Fields that feed the free-text prompt embedding.
const PROMPT_FIELDS: TrackField[] = [
  "local_tags",
  "styles",
  "genres",
  "bpm",
  "key",
  "danceability",
  "mood_happy",
  "notes",
];

// Fields that feed the identity embedding.
const IDENTITY_FIELDS: TrackField[] = [
  "title",
  "artist",
  "album",
  "year",
  "genres",
  "styles",
  "local_tags",
  "composer",
];

// Fields that feed the audio-vibe embedding.
const AUDIO_VIBE_FIELDS: TrackField[] = [
  "bpm",
  "key",
  "danceability",
  "mood_happy",
  "mood_sad",
  "mood_relaxed",
  "mood_aggressive",
];

// The diff only ever reads these keys, so the input contract is intentionally
// permissive: any object exposing (a subset of) the tracked fields.
type TrackLike = Partial<Record<TrackField, unknown>> | null | undefined;

/**
 * Returns true when any of `fields` differs between `current` and `updated`.
 * Array-valued fields are compared by their joined contents; a missing side is
 * treated as an empty array so ordering/content changes are detected but a
 * null → [] transition is not counted as a change.
 */
function fieldsChanged(
  current: TrackLike,
  updated: TrackLike,
  fields: TrackField[]
): boolean {
  for (const field of fields) {
    const before = current?.[field];
    const after = updated?.[field];
    if (Array.isArray(before) || Array.isArray(after)) {
      const beforeArr = Array.isArray(before) ? before : [];
      const afterArr = Array.isArray(after) ? after : [];
      if (beforeArr.join() !== afterArr.join()) return true;
      continue;
    }
    if (before !== after) return true;
  }
  return false;
}

export interface EmbeddingUpdatePlan {
  prompt: boolean;
  identity: boolean;
  audioVibe: boolean;
}

/**
 * Pure decision logic: given the track before and after an update, determine
 * which embeddings need to be regenerated. No I/O.
 */
export function computeEmbeddingUpdates(
  current: TrackLike,
  updated: TrackLike
): EmbeddingUpdatePlan {
  return {
    prompt: fieldsChanged(current, updated, PROMPT_FIELDS),
    identity: fieldsChanged(current, updated, IDENTITY_FIELDS),
    audioVibe: fieldsChanged(current, updated, AUDIO_VIBE_FIELDS),
  };
}
