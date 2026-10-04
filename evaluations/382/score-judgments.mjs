#!/usr/bin/env node
/**
 * Precision@10 for every #382 run from the merged #379 and #382 judgments.
 * Uncertain and unjudged pairs widen the bounds; they are never counted as
 * misses.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { entries } from '../379/review.mjs';

export function mergeJudgments(reviews, sha) {
  const judged = new Map();
  for (const review of reviews) {
    if (review.query_sha256 !== sha) throw new Error('Review was made for another query set');
    for (const { query, candidate } of entries(review)) {
      if (candidate.judgment === 'uncertain' && !candidate.reason?.trim()) throw new Error('Uncertain judgment needs a reason');
      const key = `${query.id}:${candidate.friend_id}:${candidate.track_id}`;
      const value = candidate.judgment ?? null;
      if (judged.get(key) && value && judged.get(key) !== value) throw new Error(`Conflicting judgments for ${key}`);
      if (value || !judged.has(key)) judged.set(key, value);
    }
  }
  return judged;
}

export function scoreJudgments(reviews, scores, queriesBytes) {
  const sha = createHash('sha256').update(queriesBytes).digest('hex');
  if (scores.query_sha256 !== sha) throw new Error('Frozen query set hash mismatch');
  const querySet = JSON.parse(queriesBytes);
  const judged = mergeJudgments(reviews, sha);
  const runs = {};
  for (const [label, ranking] of Object.entries(scores.queries)) {
    const total = { relevant: 0, not_relevant: 0, uncertain: 0, unjudged: 0 };
    const groups = {};
    for (const query of querySet.queries) {
      const keys = ranking[query.id];
      if (!Array.isArray(keys) || keys.length !== 10 || new Set(keys).size !== 10) throw new Error(`Invalid top 10 for ${label}/${query.id}`);
      const group = (groups[query.group] ??= { relevant: 0, evaluated: 0 });
      for (const key of keys) {
        const value = judged.get(`${query.id}:${key}`);
        total[value ?? 'unjudged']++;
        if (value === 'relevant') group.relevant++;
        group.evaluated++;
      }
    }
    const evaluated = 10 * querySet.queries.length;
    runs[label] = { ...total, evaluated,
      lower_precision10: total.relevant / evaluated,
      upper_precision10: (total.relevant + total.uncertain + total.unjudged) / evaluated,
      by_group_lower: Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, v.relevant / v.evaluated])) };
  }
  return { query_sha256: sha, queries: querySet.queries.length, runs };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    const reviewFiles = args.flatMap((a, i) => (a === '--review' ? [args[i + 1]] : []));
    if (!reviewFiles.length || !opt('--scores') || !opt('--output')) {
      throw new Error('Usage: node evaluations/382/score-judgments.mjs --review eval-data/379-review.json --review eval-data/382-review.json --scores eval-data/382-scores.json --output eval-data/382-precision.json');
    }
    const report = scoreJudgments(reviewFiles.map((f) => JSON.parse(readFileSync(f))), JSON.parse(readFileSync(opt('--scores'))),
      readFileSync(opt('--queries') ?? 'evaluations/379/queries.json'));
    writeFileSync(opt('--output'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report.runs, null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
