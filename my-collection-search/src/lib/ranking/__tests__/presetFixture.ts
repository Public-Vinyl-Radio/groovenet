/**
 * A fixture for the presets' pinned orderings (#1192): one seed, and
 * candidates that pull the presets apart. Each is named for what makes it
 * interesting, so a moved ordering reads as a story.
 */
import type { Track } from "@/types/track";
import type { SuggestionCandidate } from "@/lib/rankSuggestions";

type Candidate = SuggestionCandidate & Track;

const genre = (id: string, name: string, parent: { id: string; name: string } | null = null) => ({
  id,
  name,
  slug: id,
  parent_id: parent?.id ?? null,
  parent_name: parent?.name ?? null,
});
const HOUSE = genre("house", "House");
const DEEP_HOUSE = genre("deep-house", "Deep house", HOUSE);
const DISCO = genre("disco", "Disco");
const CUMBIA = genre("cumbia", "Cumbia");

function track(id: string, values: Partial<Candidate> = {}): Candidate {
  return {
    track_id: id,
    friend_id: 1,
    title: id,
    artist: `Artist ${id}`,
    album: `Album ${id}`,
    bpm: "124",
    key: "8A",
    year: "1995",
    danceability: 0.7,
    mood_aggressive: 0.4,
    track_genres: [HOUSE],
    ...values,
  } as Candidate;
}

/** 124 BPM, 8A, house, mid-90s, energy 0.58. */
export const PRESET_SEED = track("seed");

export const PRESET_CANDIDATES: Candidate[] = [
  // The closest vibe, but 6.5% faster and in a clashing key.
  track("vibe-twin-off-tempo", { _simAudio: 0.93, _simIdentity: 0.84, bpm: "132", key: "3B" }),
  // Same key, a BPM off, a different genre and decade; only a fair match.
  track("mixable-stranger", {
    _simAudio: 0.58,
    _simIdentity: 0.41,
    bpm: "125",
    key: "8A",
    year: "2018",
    track_genres: [DISCO],
  }),
  // Half time and an adjacent key: in the window only with half and double time.
  track("half-time-adjacent", { _simAudio: 0.71, _simIdentity: 0.66, bpm: "62", key: "9A" }),
  // A strong all-rounder: close tempo, adjacent key, the seed's genre.
  track("all-rounder", {
    _simAudio: 0.8,
    _simIdentity: 0.79,
    bpm: "123",
    key: "7A",
    track_genres: [DEEP_HOUSE],
  }),
  // Same genre and era, a good vibe, two steps round the wheel.
  track("genre-match-two-steps", { _simAudio: 0.86, _simIdentity: 0.88, bpm: "119", key: "10A" }),
  // Same tempo and key, nothing else in common, much harder.
  track("locked-but-unrelated", {
    _simAudio: 0.45,
    _simIdentity: 0.3,
    bpm: "124",
    key: "8A",
    year: "1978",
    danceability: 0.95,
    mood_aggressive: 0.95,
    track_genres: [CUMBIA],
  }),
  // The relative minor at a near tempo, house.
  track("relative-key", { _simAudio: 0.66, _simIdentity: 0.7, bpm: "126", key: "8B" }),
  // Unknown tempo and key: no constraint can judge it.
  track("no-analysis", { _simAudio: 0.9, _simIdentity: 0.5, bpm: null, key: null }),
  // Close vibe, the seed's genre, a calmer energy.
  track("calm-vibe", {
    _simAudio: 0.89,
    _simIdentity: 0.6,
    bpm: "110",
    key: "4A",
    danceability: 0.3,
    mood_aggressive: 0.1,
  }),
];
