#!/usr/bin/env node
/**
 * Variant-blind review sheet holding only the pooled pairs no earlier review
 * has judged. Same format as #379's sheet, so `evaluations/379/review.mjs`
 * reviews it unchanged.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { entries } from '../379/review.mjs';

/** `query:friend:track` → judgment for every judged pair across earlier sheets. */
export function priorJudgments(reviews) {
  const judged = new Map();
  for (const review of reviews) {
    for (const { query, candidate } of entries(review)) {
      if (candidate.judgment) judged.set(`${query.id}:${candidate.friend_id}:${candidate.track_id}`, candidate.judgment);
    }
  }
  return judged;
}

export function reviewSheet(snapshot, querySet, scores, prior) {
  const tracks = new Map(snapshot.tracks.map((t) => [`${t.friend_id}:${t.track_id}`, t]));
  const albums = new Map(snapshot.albums.map((a) => [`${a.friend_id}:${a.release_id}`, a]));
  return { schema_version: 1, query_sha256: scores.query_sha256,
    instructions: 'Judge full query fit: relevant | not_relevant | uncertain. Use trustworthy evidence or audio, not AI notes alone. Resolve uncertain cases before precision@10. Do not open the rankings in the scores file until review is frozen.',
    queries: querySet.queries.map((q) => {
      const pool = scores.blind_pools?.[q.id];
      if (!pool) throw new Error(`Missing scored query ${q.id}`);
      return { id: q.id, text: q.text, candidates: pool.filter((key) => !prior.has(`${q.id}:${key}`)).map((key) => {
        const t = tracks.get(key);
        if (!t) throw new Error(`Missing pooled track ${key}`);
        const album = albums.get(`${t.friend_id}:${t.release_id}`);
        return { track_id: t.track_id, friend_id: t.friend_id, title: t.title, artist: t.artist,
          album: t.album, year: t.year, styles: album?.styles ?? t.styles ?? [], genres: album?.genres ?? t.genres ?? [],
          judgment: null, reason: '' };
      }) };
    }).filter((q) => q.candidates.length) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    const priorFiles = args.flatMap((a, i) => (a === '--prior' ? [args[i + 1]] : []));
    if (!opt('--snapshot') || !opt('--scores') || !opt('--output')) {
      throw new Error('Usage: node evaluations/382/make-review.mjs --snapshot S --scores eval-data/382-scores.json --prior eval-data/379-review.json [--prior ...] --output eval-data/382-review.json');
    }
    const prior = priorJudgments(priorFiles.map((f) => JSON.parse(readFileSync(f))));
    const querySet = JSON.parse(readFileSync(opt('--queries') ?? 'evaluations/379/queries.json'));
    const sheet = reviewSheet(JSON.parse(readFileSync(opt('--snapshot'))), querySet, JSON.parse(readFileSync(opt('--scores'))), prior);
    writeFileSync(opt('--output'), JSON.stringify(sheet, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output: opt('--output'), already_judged: prior.size, queries: sheet.queries.length,
      new_pairs: sheet.queries.reduce((sum, q) => sum + q.candidates.length, 0) }));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
