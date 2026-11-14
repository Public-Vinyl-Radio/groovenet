#!/usr/bin/env node
/**
 * Precision@10 for #1170 runs from every earlier review merged (#379, #382,
 * #1170). Uncertain and unjudged hits widen the bounds and are never counted
 * as misses. Also splits each top 10 by whether the hit has a lyric summary,
 * and compares each run with its baseline (I0 or C0) per query.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mergeJudgments } from "../382/score-judgments.mjs";

/** Mulberry32: a fixed seed so the bootstrap CI is reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paired mean difference with a 95% percentile bootstrap over queries. */
export function paired(a, b, iterations = 10000, seed = 1170) {
  if (a.length !== b.length || !a.length) throw new Error("Paired samples must match");
  const diff = a.map((x, i) => x - b[i]);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const random = rng(seed);
  const means = Array.from({ length: iterations }, () =>
    mean(diff.map(() => diff[Math.floor(random() * diff.length)])),
  ).sort((x, y) => x - y);
  return {
    wins: diff.filter((d) => d > 0).length,
    losses: diff.filter((d) => d < 0).length,
    ties: diff.filter((d) => d === 0).length,
    mean_delta: mean(diff),
    ci95: [means[Math.floor(0.025 * iterations)], means[Math.floor(0.975 * iterations) - 1]],
  };
}

export const baselineOf = (label) => (label.startsWith("I") ? "I0" : "C0");

/**
 * Worst and best mean precision@10 delta of a run against its baseline. Hits
 * both top 10s share cancel; an unjudged or uncertain hit counts for whichever
 * side gives the extreme, so neither end treats it as a miss.
 */
export function deltaRange(run, base, querySet, judged) {
  let worst = 0;
  let best = 0;
  for (const query of querySet.queries) {
    const mine = new Set(run[query.id]);
    const theirs = new Set(base[query.id]);
    const value = (key) => judged.get(`${query.id}:${key}`);
    for (const key of mine) {
      if (theirs.has(key)) continue;
      const v = value(key);
      if (v === "relevant") worst++;
      if (v !== "not_relevant") best++;
    }
    for (const key of theirs) {
      if (mine.has(key)) continue;
      const v = value(key);
      if (v === "relevant") best--;
      if (v !== "not_relevant") worst--;
    }
  }
  const n = 10 * querySet.queries.length;
  return [worst / n, best / n];
}

export function scoreJudgments(reviews, scores, queriesBytes) {
  const sha = createHash("sha256").update(queriesBytes).digest("hex");
  if (scores.query_sha256 !== sha) throw new Error("Frozen query set hash mismatch");
  const querySet = JSON.parse(queriesBytes);
  const judged = mergeJudgments(reviews, sha);
  const lyric = new Set(scores.lyric_keys ?? []);
  const runs = {};
  const perQuery = {};
  for (const [label, ranking] of Object.entries(scores.queries)) {
    const total = { relevant: 0, not_relevant: 0, uncertain: 0, unjudged: 0 };
    const split = {
      with_lyrics: { hits: 0, relevant: 0, not_relevant: 0 },
      without_lyrics: { hits: 0, relevant: 0, not_relevant: 0 },
    };
    const groups = {};
    perQuery[label] = [];
    for (const query of querySet.queries) {
      const keys = ranking[query.id];
      if (!Array.isArray(keys) || keys.length !== 10 || new Set(keys).size !== 10)
        throw new Error(`Invalid top 10 for ${label}/${query.id}`);
      const group = (groups[query.group] ??= { relevant: 0, evaluated: 0 });
      let relevant = 0;
      for (const key of keys) {
        const value = judged.get(`${query.id}:${key}`) ?? "unjudged";
        total[value]++;
        const s = split[lyric.has(key) ? "with_lyrics" : "without_lyrics"];
        s.hits++;
        if (value === "relevant" || value === "not_relevant") s[value]++;
        if (value === "relevant") relevant++;
        group.evaluated++;
      }
      group.relevant += relevant;
      perQuery[label].push(relevant / 10);
    }
    const evaluated = 10 * querySet.queries.length;
    runs[label] = {
      ...total,
      evaluated,
      lower_precision10: total.relevant / evaluated,
      upper_precision10: (total.relevant + total.uncertain + total.unjudged) / evaluated,
      by_group_lower: Object.fromEntries(
        Object.entries(groups).map(([g, v]) => [g, v.relevant / v.evaluated]),
      ),
      by_hit_lyrics: Object.fromEntries(
        Object.entries(split).map(([k, v]) => [
          k,
          {
            ...v,
            judged_precision:
              v.relevant + v.not_relevant ? v.relevant / (v.relevant + v.not_relevant) : null,
          },
        ]),
      ),
    };
  }
  const complete = Object.values(runs).every((r) => r.uncertain === 0 && r.unjudged === 0);
  const comparisons = {};
  for (const label of Object.keys(runs)) {
    const base = baselineOf(label);
    if (label === base || !perQuery[base]) continue;
    comparisons[`${label} vs ${base}`] = {
      delta_range: deltaRange(scores.queries[label], scores.queries[base], querySet, judged),
      // A bootstrap over lower bounds would count unjudged hits as misses.
      bootstrap: complete ? paired(perQuery[label], perQuery[base]) : null,
    };
  }
  return { query_sha256: sha, queries: querySet.queries.length, complete, runs, comparisons };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    };
    const reviewFiles = args.flatMap((a, i) => (a === "--review" ? [args[i + 1]] : []));
    if (!reviewFiles.length || !opt("--scores") || !opt("--output"))
      throw new Error(
        "Usage: node evaluations/1170/score-judgments.mjs --review R [--review ...] --scores eval-data/1170-scores.json --output eval-data/1170-precision.json",
      );
    const report = scoreJudgments(
      reviewFiles.map((f) => JSON.parse(readFileSync(f))),
      JSON.parse(readFileSync(opt("--scores"))),
      readFileSync(opt("--queries") ?? "evaluations/379/queries.json"),
    );
    writeFileSync(opt("--output"), JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify(
        { complete: report.complete, runs: report.runs, comparisons: report.comparisons },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
