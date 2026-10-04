#!/usr/bin/env node
/** Scores blinded, pooled query judgments; unresolved labels produce bounds, not false precision. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { entries } from './review.mjs';

export function scoreJudgments(review, scores, queriesBytes) {
  const sha = createHash('sha256').update(queriesBytes).digest('hex');
  if (review.query_sha256 !== sha || scores.query_sha256 !== sha) throw new Error('Frozen query set hash mismatch');
  const querySet = JSON.parse(queriesBytes);
  const judged = new Map();
  for (const { query, candidate } of entries(review)) {
    if (candidate.judgment === 'uncertain' && !candidate.reason?.trim()) throw new Error('Uncertain judgment needs a reason');
    judged.set(`${query.id}:${candidate.friend_id}:${candidate.track_id}`, candidate.judgment ?? null);
  }
  const result = { query_sha256: sha, queries: querySet.queries.length, judgments: {
    relevant: 0, not_relevant: 0, uncertain: 0, unreviewed: 0,
  }, variants: {}, per_query: [] };
  for (const value of judged.values()) result.judgments[value ?? 'unreviewed']++;
  for (const variant of ['A', 'B', 'C']) result.variants[variant] = { relevant: 0, not_relevant: 0, unresolved: 0, judged: 0, evaluated: 0 };
  for (const query of querySet.queries) {
    const ranked = scores.queries?.[query.id];
    const pool = review.queries.find((q) => q.id === query.id);
    if (!ranked || !pool || pool.text !== query.text) throw new Error(`Missing query ${query.id}`);
    const pooled = new Set(ranked.blind_pool);
    if (pooled.size !== ranked.blind_pool.length || pooled.size !== pool.candidates.length ||
        pool.candidates.some((c) => !pooled.has(`${c.friend_id}:${c.track_id}`))) {
      throw new Error(`Blind pool does not match query ${query.id}`);
    }
    const perVariant = {};
    for (const variant of ['A', 'B', 'C']) {
      const keys = ranked.by_variant?.[variant];
      if (!Array.isArray(keys) || keys.length !== 10 || new Set(keys).size !== 10 || keys.some((key) => !pooled.has(key))) {
        throw new Error(`Invalid top-10 ranking for ${query.id}/${variant}`);
      }
      const counts = { relevant: 0, not_relevant: 0, unresolved: 0 };
      for (const key of keys) {
        const value = judged.get(`${query.id}:${key}`);
        if (value === 'relevant') counts.relevant++;
        else if (value === 'not_relevant') counts.not_relevant++;
        else counts.unresolved++;
      }
      const totals = result.variants[variant];
      for (const name of Object.keys(counts)) totals[name] += counts[name];
      perVariant[variant] = { ...counts, lower_precision10: counts.relevant / 10,
        upper_precision10: (counts.relevant + counts.unresolved) / 10 };
    }
    result.per_query.push({ id: query.id, group: query.group, variants: perVariant });
  }
  for (const totals of Object.values(result.variants)) {
    totals.evaluated = 10 * result.queries;
    totals.judged = totals.relevant + totals.not_relevant;
    totals.lower_precision10 = totals.relevant / totals.evaluated;
    totals.upper_precision10 = (totals.relevant + totals.unresolved) / totals.evaluated;
  }
  return result;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    if (!opt('--review') || !opt('--scores') || !opt('--queries') || !opt('--output')) {
      throw new Error('Usage: node evaluations/379/score-judgments.mjs --review eval-data/379-review.json --scores eval-data/379-scores.json --queries evaluations/379/queries.json --output eval-data/379-precision.json');
    }
    const queryBytes = readFileSync(opt('--queries'));
    const report = scoreJudgments(JSON.parse(readFileSync(opt('--review'))), JSON.parse(readFileSync(opt('--scores'))), queryBytes);
    writeFileSync(opt('--output'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output: opt('--output'), judgments: report.judgments, variants: report.variants }, null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
