#!/usr/bin/env node
/**
 * Before → after for #1218: two `run.mjs` output directories over the same
 * seeds (`main`, then pool-normalised), compared per profile. Adds what the
 * #1196 report doesn't show:
 *
 *  - **same key**: the share of picks in the seed's own key (Beatmatcher's
 *    guard rail, beside "compatible");
 *  - **source**: which retrieval index found each pick (identity only, vibe
 *    only, both), from the saved raw responses, to see whether a candidate
 *    only the identity index found can now make the top 10;
 *  - **stability**: Jaccard at 10 between the two runs' lists, per profile;
 *  - **era and energy fit** (#1217): same era / era ±1 / |Δyear|, and
 *    |Δenergy| / within ±0.2, each with the share of picks it is known for.
 *
 * And the spread of the raw similarities in each seed's pool, which is what
 * the normalisation is for (`poolSpread`).
 *
 *   node evaluations/1218/compare.mjs --before eval-data/1218-before \
 *     --after eval-data/1218-after [--profiles default,selector] [--map selector=selector-x]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { jaccard, macro, trackKey } from "../1196/metrics.mjs";
import { perSeedMetrics } from "../1196/report.mjs";

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Where a candidate came from, by which retriever similarity it has. */
export function sourceOf(candidate) {
  const identity = candidate?.simIdentity != null;
  const vibe = candidate?.simAudio != null;
  if (identity && vibe) return "both";
  if (identity) return "identity";
  if (vibe) return "vibe";
  return "none";
}

/** Per seed: the share of picks in the seed's key, and of picks by source. */
export function listExtras(picks, candidates = []) {
  const byKey = new Map(candidates.map((c) => [`${c.friendId}:${c.trackId}`, c]));
  const keys = picks.map((p) => p.key_relation).filter((k) => k != null);
  const sources = picks.map((p) => sourceOf(byKey.get(trackKey(p))));
  const share = (xs, value) =>
    xs.length ? xs.filter((x) => x === value).length / xs.length : null;
  return {
    same_key: share(keys, "same"),
    identity_only: share(sources, "identity"),
    vibe_only: share(sources, "vibe"),
    both: share(sources, "both"),
  };
}

/** Quantile of a sorted array, linear between ranks. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/**
 * One pool's raw similarity, as the ranker's `1 − d/2` sees it: its p10–p90
 * spread, its full range, and where the median candidate lands under
 * min–max (0.5 when the pool is evenly spread; near 1 when one low outlier
 * stretches the range, near 0 when one high outlier does).
 */
export function poolSpread(values) {
  const sorted = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const min = sorted[0];
  const max = sorted.at(-1);
  const p10 = quantile(sorted, 0.1);
  const p90 = quantile(sorted, 0.9);
  const median = quantile(sorted, 0.5);
  const range = max - min;
  return {
    n: sorted.length,
    p10_p90: p90 - p10,
    range,
    // How much of min–max's [0, 1] the middle 80% of the pool gets.
    minmax_middle: range ? (p90 - p10) / range : null,
    minmax_median: range ? (median - min) / range : null,
  };
}

function readRun(dir) {
  return JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
}

function rawCandidates(dir, profile, seedKey) {
  try {
    const file = join(dir, "raw", `${profile}--${seedKey.replaceAll(":", "_")}.json.gz`);
    return JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")).candidates ?? [];
  } catch {
    return [];
  }
}

/** The profile's per-seed metrics and extras in one run. */
export function profileRun(results, profile, candidatesOf = () => []) {
  const metrics = perSeedMetrics({ ...results, profiles: [{ id: profile }] })[profile];
  return results.seeds.map((s, i) => {
    const picks = s.lists[profile]?.picks ?? [];
    return { picks, metrics: metrics[i], extras: listExtras(picks, candidatesOf(s.key)) };
  });
}

export function summarise(perSeed) {
  const metrics = perSeed.map((s) => s.metrics).filter(Boolean);
  const pick = (path) => macro(metrics, path).mean;
  const extra = (field) =>
    mean(perSeed.map((s) => s.extras[field]).filter((v) => typeof v === "number"));
  return {
    starved: perSeed.filter((s) => s.picks.length < 10).length,
    within_hd: pick("bpm.within_hd"),
    mean_abs_hd: pick("bpm.mean_abs_hd"),
    compatible: pick("key.compatible"),
    same_key: extra("same_key"),
    genre: pick("genre.mean"),
    vibe: pick("vibe.mean"),
    identity: pick("identity.mean"),
    era_same: pick("era.same"),
    era_near: pick("era.near"),
    year_abs: pick("era.mean_abs_year"),
    era_known: pick("era.coverage"),
    energy_abs: pick("energy.mean_abs"),
    energy_within: pick("energy.within"),
    energy_known: pick("energy.coverage"),
    artists: pick("artists"),
    releases: pick("releases"),
    identity_only: extra("identity_only"),
  };
}

/** Mean Jaccard at 10 between two runs' lists for the same seeds. */
export function stability(before, after) {
  return mean(before.map((s, i) => jaccard(s.picks, after[i]?.picks ?? [])));
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const beforeDir = opt("--before");
  const afterDir = opt("--after");
  const before = readRun(beforeDir);
  const after = readRun(afterDir);
  if (before.seeds_sha256 !== after.seeds_sha256)
    throw new Error("The runs are over different seeds");
  // `--map selector=selector-x` compares main's selector with the after run's selector-x.
  const map = Object.fromEntries(
    args.flatMap((a, i) => (a === "--map" ? [args[i + 1].split("=")] : [])),
  );
  const profiles = opt("--profiles", before.profiles.map((p) => p.id).join(",")).split(",");
  const fmt = (v, d = 2) => (v == null ? "–" : Number(v).toFixed(d));
  const pct = (v) => (v == null ? "–" : `${Math.round(v * 100)}%`);
  console.log(
    "| Profile | Starved | ±6% ½×/2× | mean \\|ΔBPM\\| ½×/2× | Compatible key | Same key | Genre | Vibe sim | Identity sim | Same era | Era ±1 | \\|Δyear\\| | Era known | \\|Δenergy\\| | Energy ±0.2 | Energy known | Artists | Releases | Identity-only picks | Jaccard vs main |",
  );
  console.log(`|${" --- |".repeat(20)}`);
  for (const profile of profiles) {
    const target = map[profile] ?? profile;
    const b = profileRun(before, profile, (k) => rawCandidates(beforeDir, profile, k));
    const a = profileRun(after, target, (k) => rawCandidates(afterDir, target, k));
    const x = summarise(b);
    const y = summarise(a);
    const arrow = (f, v, w) => `${f(v)} → ${f(w)}`;
    console.log(
      `| ${target === profile ? profile : `${profile} → ${target}`} | ${x.starved} → ${y.starved} | ${arrow(pct, x.within_hd, y.within_hd)} | ${arrow((v) => fmt(v, 1), x.mean_abs_hd, y.mean_abs_hd)} | ${arrow(pct, x.compatible, y.compatible)} | ${arrow(pct, x.same_key, y.same_key)} | ${arrow(fmt, x.genre, y.genre)} | ${arrow((v) => fmt(v, 3), x.vibe, y.vibe)} | ${arrow((v) => fmt(v, 3), x.identity, y.identity)} | ${arrow(pct, x.era_same, y.era_same)} | ${arrow(pct, x.era_near, y.era_near)} | ${arrow((v) => fmt(v, 1), x.year_abs, y.year_abs)} | ${arrow(pct, x.era_known, y.era_known)} | ${arrow((v) => fmt(v, 3), x.energy_abs, y.energy_abs)} | ${arrow(pct, x.energy_within, y.energy_within)} | ${arrow(pct, x.energy_known, y.energy_known)} | ${arrow((v) => fmt(v, 1), x.artists, y.artists)} | ${arrow((v) => fmt(v, 1), x.releases, y.releases)} | ${arrow(pct, x.identity_only, y.identity_only)} | ${fmt(stability(b, a))} |`,
    );
  }
  if (args.includes("--spread")) {
    const rows = before.seeds
      .map((s) => rawCandidates(beforeDir, profiles[0], s.key))
      .filter((c) => c.length);
    for (const field of ["simAudio", "simIdentity"]) {
      const spreads = rows.map((c) => poolSpread(c.map((x) => x[field]))).filter(Boolean);
      const m = (f) => mean(spreads.map((s) => s[f]).filter((v) => v != null));
      console.log(
        `\n${field}: pools ${spreads.length}, mean n ${fmt(m("n"), 0)}, p10–p90 ${fmt(m("p10_p90"), 4)}, range ${fmt(m("range"), 4)}, min–max: middle 80% gets ${pct(m("minmax_middle"))} of [0, 1], median lands at ${fmt(m("minmax_median"))}`,
      );
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
