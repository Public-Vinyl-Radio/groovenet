/**
 * Golden ordering for suggestion ranking (#1191).
 *
 * These snapshots were recorded against `rankSuggestions` *before* the ranker
 * refactor and pin today's ordering. A ranking change that moves them is a
 * behaviour change, not a refactor: never update them to make a refactor pass.
 * A deliberate change (a new default profile, #1192) updates them in its own
 * commit and says why in the PR.
 */
import { describe, expect, it } from "vitest";
import type { Track } from "@/types/track";
import { rankSuggestions, type SuggestionCandidate } from "@/lib/rankSuggestions";

/** Deterministic PRNG (mulberry32), so the fixture is the same on every run. */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYS = [
  "C major",
  "A minor",
  "G major",
  "E minor",
  "F major",
  "D minor",
  "F# major",
  "Bb minor",
  "8A",
  "9B",
  "12A",
  "not a key",
  null,
];
const BPMS: Array<string | null> = [
  "120",
  "121.5",
  "124",
  "126",
  "127.2",
  "113",
  "118",
  "131",
  "60",
  "240",
  "0",
  "",
  null,
];

type Candidate = SuggestionCandidate & Track;

function track(id: string, values: Partial<Candidate> = {}): Candidate {
  return {
    track_id: id,
    friend_id: 1,
    title: id,
    artist: "Artist",
    album: id,
    bpm: "124",
    key: "8A",
    ...values,
  } as Candidate;
}

/** A pool of candidates covering both, one or no similarity scores, odd BPMs and keys, and shared releases. */
function pool(): Candidate[] {
  const random = prng(1191);
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const candidates: Candidate[] = [];
  for (let i = 0; i < 60; i += 1) {
    const shape = i % 4;
    const identity = Math.round(random() * 1000) / 1000;
    const audio = Math.round(random() * 1000) / 1000;
    candidates.push(
      track(`c${String(i).padStart(2, "0")}`, {
        bpm: pick(BPMS),
        key: pick(KEYS),
        artist: i % 5 === 0 ? "Shared artist" : `Artist ${i % 7}`,
        // Every fifth track shares a release with another, so folding has work to do.
        album: i % 5 === 0 ? `Shared ${i % 3}` : `Album ${i}`,
        _simIdentity: shape === 0 || shape === 1 ? identity : null,
        _simAudio: shape === 0 || shape === 2 ? audio : null,
      }),
    );
  }
  // Exact ties on similarity, broken only by the key and BPM boosts.
  candidates.push(
    track("tie-same-key", { _simIdentity: 0.8, _simAudio: null, key: "8A", bpm: "130" }),
    track("tie-adjacent-key", { _simIdentity: 0.8, _simAudio: null, key: "9A", bpm: "124" }),
    track("tie-relative-key", { _simIdentity: 0.8, _simAudio: null, key: "8B", bpm: "124" }),
    track("tie-no-key", { _simIdentity: 0.8, _simAudio: null, key: null, bpm: "124" }),
    track("tie-exact", { _simIdentity: 0.8, _simAudio: null, key: "8A", bpm: "124" }),
    // Precomputed scores take precedence over the similarities.
    track("prior-score", { _score: 0.5, _simIdentity: 0.99, _simAudio: 0.99 }),
    track("semantic-score", { _semanticScore: 0.95, _simIdentity: 0.1 }),
    track("no-similarity", { _simIdentity: null, _simAudio: null }),
    // Another library's copy of a track is a different candidate.
    track("c03", { friend_id: 2, _simIdentity: 0.7 }),
  );
  return candidates;
}

function summary(result: ReturnType<typeof rankSuggestions<Candidate>>) {
  return {
    tracks: result.tracks.map((t) => `${t.track_id}:${t.friend_id}`),
    folds: result.folds.map((fold) => `${fold.key} [${fold.tracks.map((t) => t.track_id)}]`),
    hiddenByFilters: result.hiddenByFilters,
  };
}

const seed = track("seed", { bpm: "124", key: "8A" });
const playlist = [
  track("p1", { bpm: "118", key: "7A" }),
  track("c05"),
  track("p2", { bpm: "126.4", key: "9B" }),
];
const both = { compatibleKey: true, bpmWithinSixPercent: true };

describe("suggestion ranking golden ordering", () => {
  it("track seed, no filters", () => {
    expect(summary(rankSuggestions(pool(), { seed }))).toMatchSnapshot();
  });

  it("track seed, both filters", () => {
    expect(summary(rankSuggestions(pool(), { seed, filters: both }))).toMatchSnapshot();
  });

  it("track seed, key filter only", () => {
    expect(
      summary(rankSuggestions(pool(), { seed, filters: { compatibleKey: true } })),
    ).toMatchSnapshot();
  });

  it("track seed, BPM filter only", () => {
    expect(
      summary(rankSuggestions(pool(), { seed, filters: { bpmWithinSixPercent: true } })),
    ).toMatchSnapshot();
  });

  it("track seed, variety cap 2", () => {
    expect(summary(rankSuggestions(pool(), { seed, varietyCap: 2 }))).toMatchSnapshot();
  });

  it("seed without a BPM", () => {
    const noBpm = track("seed", { bpm: null, key: "8A" });
    expect(summary(rankSuggestions(pool(), { seed: noBpm, filters: both }))).toMatchSnapshot();
  });

  it("seed with a zero BPM", () => {
    const zeroBpm = track("seed", { bpm: "0", key: "8A" });
    expect(summary(rankSuggestions(pool(), { seed: zeroBpm, filters: both }))).toMatchSnapshot();
  });

  it("seed without a key", () => {
    const noKey = track("seed", { bpm: "124", key: null });
    expect(summary(rankSuggestions(pool(), { seed: noKey, filters: both }))).toMatchSnapshot();
  });

  it("seed with an unknown key", () => {
    const unknownKey = track("seed", { bpm: "124", key: "H major" });
    expect(summary(rankSuggestions(pool(), { seed: unknownKey, filters: both }))).toMatchSnapshot();
  });

  it("playlist seed ranks against the last track and excludes the playlist", () => {
    expect(
      summary(rankSuggestions(pool(), { seed, playlist, seedMode: "playlist" })),
    ).toMatchSnapshot();
  });

  it("playlist seed, both filters", () => {
    expect(
      summary(rankSuggestions(pool(), { seed, playlist, seedMode: "playlist", filters: both })),
    ).toMatchSnapshot();
  });

  it("track seed with a playlist excludes the playlist but ranks against the seed", () => {
    expect(
      summary(rankSuggestions(pool(), { seed, playlist, seedMode: "track", filters: both })),
    ).toMatchSnapshot();
  });

  it("candidates with only one similarity score", () => {
    const one = pool().filter((c) => (c._simIdentity == null) !== (c._simAudio == null));
    expect(summary(rankSuggestions(one, { seed, filters: both }))).toMatchSnapshot();
  });
});
