#!/usr/bin/env node
/**
 * #424: how much does the per-release cap cost natural-language precision?
 *
 * Live semantic search (#409) scored 0.775–0.779 against 0.892–0.900 offline
 * for the same context text. Rebuilding the ivfflat index changed no live
 * result, so the approximate index is ruled out. This isolates the cap:
 * the #382 snapshot's exact cosine ranking of the app-built context text
 * (`Fapp`, #408), capped at N tracks per release, then the top 10 scored with
 * the merged blind judgments. Unjudged pairs widen the bounds, as in #382.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashText } from '../379/embed.mjs';
import { rank } from '../379/score.mjs';
import { candidateVectors, loadVectors, normalize } from '../382/score.mjs';
import { mergeJudgments } from '../382/score-judgments.mjs';

/** `none` is offline F as #382 measured it; 2 is what production serves. */
export const CAPS = [Infinity, 3, 2, 1];
export const capLabel = (cap) => (cap === Infinity ? 'none' : String(cap));

const releaseOf = (track) => `${track.friend_id}:${track.release_id ?? `track:${track.track_id}`}`;
const keyOf = (track) => `${track.friend_id}:${track.track_id}`;

/** The first `limit` tracks of an exact ranking, at most `cap` per release, in rank order. */
export function capRanking(ranking, tracks, cap, limit = 10) {
  const perRelease = new Map();
  const picked = [];
  for (const { i } of ranking) {
    const release = releaseOf(tracks[i]);
    const seen = perRelease.get(release) ?? 0;
    if (seen >= cap) continue;
    perRelease.set(release, seen + 1);
    picked.push(i);
    if (picked.length === limit) break;
  }
  return picked;
}

/** `{ cap: { queryId: ['friend:track', ...] } }` for every cap. */
export function cappedTopTens(tracks, candidates, queryVectors, caps = CAPS) {
  const ranked = queryVectors.queries.map(({ id, vector }) => [id, rank(normalize(vector), candidates)]);
  return Object.fromEntries(caps.map((cap) => [capLabel(cap), Object.fromEntries(
    ranked.map(([id, ranking]) => [id, capRanking(ranking, tracks, cap).map((i) => keyOf(tracks[i]))]))]));
}

/** Precision@10 bounds and groups per cap, plus distinct releases per top 10. */
export function scoreCaps(topTens, querySet, judged, tracksByKey) {
  const report = {};
  for (const [label, byQuery] of Object.entries(topTens)) {
    const total = { relevant: 0, not_relevant: 0, uncertain: 0, unjudged: 0 };
    const groups = {};
    let releases = 0;
    for (const query of querySet.queries) {
      const keys = byQuery[query.id];
      if (!Array.isArray(keys) || keys.length !== 10) throw new Error(`Invalid top 10 for ${label}/${query.id}`);
      const group = (groups[query.group] ??= { relevant: 0, evaluated: 0 });
      group.evaluated += 10;
      for (const key of keys) {
        const value = judged.get(`${query.id}:${key}`);
        total[value ?? 'unjudged']++;
        if (value === 'relevant') group.relevant++;
      }
      releases += new Set(keys.map((k) => releaseOf(tracksByKey.get(k)))).size;
    }
    const evaluated = 10 * querySet.queries.length;
    report[label] = { ...total, evaluated,
      lower_precision10: total.relevant / evaluated,
      upper_precision10: (total.relevant + total.uncertain + total.unjudged) / evaluated,
      by_group_lower: Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, v.relevant / v.evaluated])),
      releases_per_top10: releases / querySet.queries.length };
  }
  return report;
}

/** Blind sheet of pairs no review has judged, pooled across caps, in #379's format. */
export function unjudgedSheet(topTens, querySet, judged, tracksByKey, albumsByKey, querySha) {
  const queries = querySet.queries.map((query) => {
    const keys = new Set(Object.values(topTens).flatMap((byQuery) => byQuery[query.id])
      .filter((key) => !judged.get(`${query.id}:${key}`)));
    const candidates = [...keys].sort().map((key) => {
      const t = tracksByKey.get(key);
      const album = albumsByKey.get(`${t.friend_id}:${t.release_id}`);
      return { track_id: t.track_id, friend_id: t.friend_id, title: t.title, artist: t.artist, album: t.album,
        year: t.year, styles: album?.styles ?? t.styles ?? [], genres: album?.genres ?? t.genres ?? [],
        judgment: null, reason: '' };
    });
    return { id: query.id, text: query.text, candidates };
  }).filter((q) => q.candidates.length);
  return { schema_version: 1, query_sha256: querySha,
    instructions: 'Judge full query fit: relevant | not_relevant | uncertain. Use trustworthy evidence or audio, not AI notes alone.',
    queries };
}

const pct = (n) => n.toFixed(3);

/** Markdown for the issue: aggregates only. */
export function formatReport(report) {
  const groups = [...new Set(Object.values(report).flatMap((r) => Object.keys(r.by_group_lower)))];
  const lines = [
    `| Cap per release | P@10 | ${groups.join(' | ')} | Unjudged | Releases per top 10 |`,
    `| --- | --- | ${groups.map(() => '---').join(' | ')} | --- | --- |`,
  ];
  // Loosest cap first. Object.entries would put the numeric labels ahead of `none`.
  const labels = [...CAPS.map(capLabel).filter((l) => l in report), ...Object.keys(report).filter((l) => !CAPS.map(capLabel).includes(l))];
  for (const label of labels) {
    const r = report[label];
    const bounds = r.lower_precision10 === r.upper_precision10
      ? pct(r.lower_precision10) : `${pct(r.lower_precision10)}–${pct(r.upper_precision10)}`;
    lines.push(`| ${label} | ${bounds} | ${groups.map((g) => pct(r.by_group_lower[g])).join(' | ')} | ` +
      `${r.unjudged + r.uncertain} | ${r.releases_per_top10.toFixed(2)} |`);
  }
  lines.push('', 'Exact cosine search over the #382 snapshot (friend 6), app-built context text (`Fapp`). Group columns are lower bounds.');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    const reviewFiles = args.flatMap((a, i) => (a === '--review' ? [args[i + 1]] : []));
    for (const name of ['--snapshot', '--texts', '--vectors', '--query-vectors', '--output']) {
      if (!opt(name)) {
        throw new Error('Usage: node evaluations/424/cap.mjs --snapshot S --texts eval-data/408-texts.json ' +
          '--vectors eval-data/408-small --query-vectors eval-data/379-query-vectors.json ' +
          '--review R1 [--review R2 ...] --output eval-data/424-caps.json [--unjudged-output eval-data/424-review.json] [--variant Fapp]');
      }
    }
    if (!reviewFiles.length) throw new Error('At least one --review is required');

    const queryBytes = readFileSync(opt('--queries') ?? 'evaluations/379/queries.json');
    const querySha = createHash('sha256').update(queryBytes).digest('hex');
    const querySet = JSON.parse(queryBytes);
    const rawSnapshot = readFileSync(opt('--snapshot'));
    const snapshotSha = createHash('sha256').update(rawSnapshot).digest('hex');
    const snapshot = JSON.parse(rawSnapshot);
    const texts = JSON.parse(readFileSync(opt('--texts')));
    const manifest = JSON.parse(readFileSync(join(opt('--vectors'), 'manifest.json')));
    const queryVectors = JSON.parse(readFileSync(opt('--query-vectors')));
    if (texts.snapshot_sha256 !== snapshotSha || manifest.snapshot_sha256 !== snapshotSha) throw new Error('Texts or vectors are from another snapshot');
    if (queryVectors.query_sha256 !== querySha || queryVectors.model !== manifest.model) throw new Error('Query vectors do not match the query set or model');
    if (texts.rows.length !== snapshot.tracks.length) throw new Error('Text rows do not match the snapshot');

    const variant = opt('--variant') ?? 'Fapp';
    const wanted = new Set(texts.rows.map((r) => hashText(r.text[variant])));
    const vectors = await loadVectors(join(opt('--vectors'), 'vectors.ndjson'), manifest.dims, wanted);
    const candidates = candidateVectors(texts.rows, variant, vectors);

    const judged = mergeJudgments(reviewFiles.map((f) => JSON.parse(readFileSync(f))), querySha);
    const tracksByKey = new Map(snapshot.tracks.map((t) => [keyOf(t), t]));
    const albumsByKey = new Map((snapshot.albums ?? []).map((a) => [`${a.friend_id}:${a.release_id}`, a]));
    const topTens = cappedTopTens(snapshot.tracks, candidates, queryVectors);
    const report = scoreCaps(topTens, querySet, judged, tracksByKey);

    writeFileSync(opt('--output'), JSON.stringify({ snapshot_sha256: snapshotSha, query_sha256: querySha, variant,
      model: manifest.model, report, rankings: topTens }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (opt('--unjudged-output')) {
      const sheet = unjudgedSheet(topTens, querySet, judged, tracksByKey, albumsByKey, querySha);
      writeFileSync(opt('--unjudged-output'), JSON.stringify(sheet, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      process.stderr.write(`${sheet.queries.reduce((n, q) => n + q.candidates.length, 0)} unjudged pairs → ${opt('--unjudged-output')}\n`);
    }
    console.log(formatReport(report));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
