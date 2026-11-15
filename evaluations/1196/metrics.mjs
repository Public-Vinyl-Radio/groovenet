/**
 * Metrics for #1196: what a profile's top 10 looks like from a seed, and how
 * an ordering mixes. Pure. Tempo and the ordering measures come from the
 * app's own modules (`parseBpm`, `bpmJumpTotal`, `orderingMetrics`), and the
 * key relation is the ranker's own `key_relation` detail from the API
 * response, so nothing here re-derives what the app already computes.
 */
import { signTest } from "../1170/side-by-side.mjs";
import { bpmJumpTotal, orderingMetrics, parseBpm } from "./app-modules.mjs";

export const TOP_K = 10;
/** The ±6% window, as the Default and Beatmatcher constraints define it. */
export const BPM_RATIO = 0.06;
const COMPATIBLE = new Set(["same", "adjacent", "relative"]);

export const trackKey = (t) => `${t.friend_id}:${t.track_id}`;

/** `rankSuggestions`' `releaseOf`: artist + album, else the track itself. */
export function releaseOf(t) {
  const artist = t.artist?.trim().toLowerCase();
  const album = t.album?.trim().toLowerCase();
  return artist && album ? `${t.friend_id}:${artist}:${album}` : `${t.track_id}:${t.friend_id}`;
}

/** One candidate from the breakdown API as the fields the metrics and the sheet read. */
export function pickOf(candidate) {
  const m = candidate.metadata ?? {};
  const s = candidate.ranking?.signals ?? {};
  return {
    track_id: candidate.trackId,
    friend_id: candidate.friendId,
    title: m.title,
    artist: m.artist,
    album: m.album,
    year: m.year ?? null,
    styles: m.styles ?? [],
    bpm: m.bpm ?? null,
    key: m.key ?? null,
    score: candidate.ranking?.score ?? null,
    key_relation: s.key_relation?.detail ?? null,
    genre_overlap: s.genre_overlap?.value ?? null,
  };
}

/**
 * The list a Suggestions panel shows: candidates other than the seed (and its
 * playlist) that pass the profile's constraints, best score first (ties keep
 * retrieval order), at most `cap` per release, the first `k`.
 */
export function topPicks(candidates, { exclude = [], k = TOP_K, cap = 1 } = {}) {
  const excluded = new Set(exclude.map(trackKey));
  const eligible = candidates.filter(
    (c) => !excluded.has(trackKey({ track_id: c.trackId, friend_id: c.friendId })),
  );
  const passed = eligible.filter((c) => c.ranking?.passed);
  const sorted = [...passed].sort((a, b) => b.ranking.score - a.ranking.score);
  const counts = new Map();
  const picks = [];
  for (const c of sorted) {
    const pick = pickOf(c);
    const release = releaseOf(pick);
    const n = counts.get(release) ?? 0;
    counts.set(release, n + 1);
    if (cap === null || n < cap) picks.push(pick);
    if (picks.length === k) break;
  }
  return { picks, eligible: eligible.length, passed: passed.length };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const share = (xs) => (xs.length ? xs.filter(Boolean).length / xs.length : null);

/** |ΔBPM| from seed to pick, raw or to the nearest half or double; null without both tempos. */
export function bpmDelta(seed, pick, halfDouble = false) {
  if (parseBpm(seed.bpm) === null || parseBpm(pick.bpm) === null) return null;
  return bpmJumpTotal([seed, pick], { halfDouble });
}

/**
 * One seed's list. `sims` maps a pick's `trackKey` to its exact cosine
 * similarity to the seed, `{ vibe, identity }`, null where either side has
 * no embedding. Every mean and share is over the picks that have the data;
 * `known` says how many that was.
 */
export function listMetrics(seed, picks, sims = new Map()) {
  const seedBpm = parseBpm(seed.bpm);
  const raw = [];
  const hd = [];
  for (const p of picks) {
    const r = bpmDelta(seed, p);
    if (r === null) continue;
    raw.push(r);
    hd.push(bpmDelta(seed, p, true));
  }
  const keys = picks.map((p) => p.key_relation).filter((k) => k !== null && k !== undefined);
  const genres = picks.map((p) => p.genre_overlap).filter((g) => typeof g === "number");
  const sim = (field) =>
    picks.map((p) => sims.get(trackKey(p))?.[field]).filter((v) => typeof v === "number");
  const vibe = sim("vibe");
  const identity = sim("identity");
  return {
    picks: picks.length,
    starved: picks.length < TOP_K,
    bpm: {
      known: raw.length,
      mean_abs: mean(raw),
      mean_abs_hd: mean(hd),
      within: share(raw.map((d) => d / seedBpm <= BPM_RATIO)),
      within_hd: share(hd.map((d) => d / seedBpm <= BPM_RATIO)),
    },
    key: {
      known: keys.length,
      compatible: share(keys.map((k) => COMPATIBLE.has(k))),
      clash: share(keys.map((k) => k === "clash")),
    },
    genre: { known: genres.length, mean: mean(genres) },
    vibe: { known: vibe.length, mean: mean(vibe) },
    identity: { known: identity.length, mean: mean(identity) },
    artists: new Set(picks.map((p) => p.artist?.trim().toLowerCase() || trackKey(p))).size,
    releases: new Set(picks.map(releaseOf)).size,
  };
}

/** Reads one number from a `listMetrics` result by path, e.g. `bpm.within_hd`. */
export const read = (metrics, path) =>
  path.split(".").reduce((v, part) => (v == null ? null : v[part]), metrics);

/** Mean over seeds of a per-seed value; seeds without it are left out and counted. */
export function macro(perSeed, path) {
  const values = perSeed.map((m) => read(m, path)).filter((v) => typeof v === "number");
  return { mean: mean(values), seeds: values.length };
}

/** Jaccard overlap of two pick lists, by track. Two empty lists are identical (1). */
export function jaccard(a, b) {
  const x = new Set(a.map(trackKey));
  const y = new Set(b.map(trackKey));
  const union = new Set([...x, ...y]).size;
  if (!union) return 1;
  return [...x].filter((k) => y.has(k)).length / union;
}

/**
 * Per-seed comparison of A against B on one metric. `better` is "higher" or
 * "lower". Seeds where either lacks the value are skipped. Ties are dropped
 * from the sign test, as in #1170.
 */
export function paired(aSeeds, bSeeds, path, better = "higher", epsilon = 1e-9) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  aSeeds.forEach((a, i) => {
    const x = read(a, path);
    const y = read(bSeeds[i], path);
    if (typeof x !== "number" || typeof y !== "number") return;
    const d = better === "higher" ? x - y : y - x;
    if (Math.abs(d) <= epsilon) ties++;
    else if (d > 0) wins++;
    else losses++;
  });
  return { wins, losses, ties, sign_test_p: signTest(wins, losses) };
}

/**
 * An ordering's metrics per transition, from the app's `orderingMetrics`.
 * `tracks` carry `bpm`, `key` and `embedding`.
 */
export function orderingPerTransition(tracks, { halfDouble = false } = {}) {
  const raw = orderingMetrics(tracks);
  const hd = orderingMetrics(tracks, { halfDouble: true });
  const per = (v) => (raw.transitions ? v / raw.transitions : null);
  return {
    transitions: raw.transitions,
    bpm_jump: per(raw.bpmJumps),
    bpm_jump_hd: per(hd.bpmJumps),
    bpm_jump_native: per(halfDouble ? hd.bpmJumps : raw.bpmJumps),
    key_clash: per(raw.keyClashes),
    vibe_distance: per(raw.vibeDistance),
  };
}
