#!/usr/bin/env node
/** Build a variant-blind review sheet from the pooled top-10 query results. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function reviewSheet(snapshot, querySet, scores) {
  if (scores.query_sha256 !== createHash('sha256').update(JSON.stringify(querySet, null, 2) + '\n').digest('hex')) {
    throw new Error('Review query set hash does not match scored rankings');
  }
  const tracks = new Map(snapshot.tracks.map((t) => [`${t.friend_id}:${t.track_id}`, t]));
  const albums = new Map(snapshot.albums.map((a) => [`${a.friend_id}:${a.release_id}`, a]));
  return { schema_version: 1, query_sha256: scores.query_sha256,
    instructions: 'Judge full query fit: relevant | not_relevant | uncertain. Use trustworthy evidence or audio, not AI notes alone. Resolve uncertain cases before precision@10. Do not open the rankings in scores.json until review is frozen.',
    queries: querySet.queries.map((q) => {
      const results = scores.queries?.[q.id];
      if (!results) throw new Error(`Missing scored query ${q.id}`);
      return { id: q.id, text: q.text, candidates: results.blind_pool.map((key) => {
        const t = tracks.get(key);
        if (!t) throw new Error(`Missing pooled track ${key}`);
        const album = albums.get(`${t.friend_id}:${t.release_id}`);
        return { track_id: t.track_id, friend_id: t.friend_id, title: t.title, artist: t.artist,
          album: t.album, year: t.year, styles: album?.styles ?? t.styles ?? [], genres: album?.genres ?? t.genres ?? [],
          judgment: null, reason: '' };
      }) };
    }) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    if (!opt('--snapshot') || !opt('--queries') || !opt('--scores') || !opt('--output')) throw new Error('Usage: node evaluations/379/make-review.mjs --snapshot eval-data/379-friend-6.json --queries evaluations/379/queries.json --scores eval-data/379-scores.json --output eval-data/379-review.json');
    const result = reviewSheet(JSON.parse(readFileSync(opt('--snapshot'))), JSON.parse(readFileSync(opt('--queries'))), JSON.parse(readFileSync(opt('--scores'))));
    writeFileSync(opt('--output'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ output: opt('--output'), queries: result.queries.length, candidates: result.queries.reduce((sum, q) => sum + q.candidates.length, 0) }));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
