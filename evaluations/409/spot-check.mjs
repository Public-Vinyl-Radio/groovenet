#!/usr/bin/env node
/**
 * Live spot-check for #409: runs the #379 frozen queries against a deployed
 * `/api/tracks/search` in each mode and scores the top 10 with the merged
 * #379/#382 blind judgments.
 *
 * Live is not the offline eval. The collection has moved since the snapshot,
 * the index is approximate (ivfflat), and live results are capped at two per
 * release where offline F was not. Tracks no review has judged widen the
 * bounds; they are never counted as misses. A mode returning fewer than ten
 * hits counts the empty slots as misses, since precision@10 is out of ten.
 *
 * Writes full rankings (track ids) to a private file and prints only
 * aggregates, which are safe to post on the issue.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mergeJudgments } from '../382/score-judgments.mjs';

export const MODES = ['semantic', 'hybrid', 'lexical'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (hit) => `${Number(hit.friend_id)}:${hit.track_id}`;

/** Refuses to measure a half-built index unless told to. */
export function assertContextReady(status, allowIncomplete = false) {
  const missing = status?.missing?.context;
  if (typeof missing !== 'number') throw new Error('This deployment reports no context embeddings; deploy #411 first');
  if (missing > 0 && !allowIncomplete) {
    throw new Error(`${missing} tracks still lack a context embedding; wait for the backfill or pass --allow-incomplete`);
  }
  return missing;
}

/** One search, retried once after a rate limit. */
export async function searchWithRetry(client, params, { wait = sleep, retryAfterMs = 60_000 } = {}) {
  try {
    return await client.searchTracks(params);
  } catch (err) {
    if (!/429|too many/i.test(err?.message ?? '')) throw err;
    await wait(retryAfterMs);
    return client.searchTracks(params);
  }
}

/** `{ mode: { queryId: hits[] } }`, sequential to stay well inside the rate limit. */
export async function runQueries(client, querySet, { friendId, modes = MODES, search = searchWithRetry, onProgress } = {}) {
  const results = Object.fromEntries(modes.map((mode) => [mode, {}]));
  for (const query of querySet.queries) {
    for (const mode of modes) {
      const response = await search(client, { query: query.text, limit: 10, mode, filters: { friend_id: friendId } });
      if (response.degraded) throw new Error(`${mode} degraded to lexical on ${query.id}; the semantic leg failed`);
      results[mode][query.id] = response.tracks.slice(0, 10);
    }
    onProgress?.(query.id);
  }
  return results;
}

/** Precision@10 bounds, by group, plus the per-release cap and overlap with an offline run. */
export function scoreLive(results, querySet, judged, offline) {
  const report = {};
  for (const [mode, byQuery] of Object.entries(results)) {
    const total = { relevant: 0, not_relevant: 0, uncertain: 0, unjudged: 0, empty: 0 };
    const groups = {};
    let maxPerRelease = 0;
    let overlap = 0;
    for (const query of querySet.queries) {
      const hits = byQuery[query.id];
      if (!Array.isArray(hits)) throw new Error(`Missing results for ${mode}/${query.id}`);
      const group = (groups[query.group] ??= { relevant: 0, evaluated: 0 });
      group.evaluated += 10;
      total.empty += 10 - hits.length;
      const perRelease = new Map();
      for (const hit of hits) {
        const value = judged.get(`${query.id}:${key(hit)}`);
        total[value ?? 'unjudged']++;
        if (value === 'relevant') group.relevant++;
        const release = `${hit.friend_id}:${hit.release_id ?? `track:${hit.track_id}`}`;
        perRelease.set(release, (perRelease.get(release) ?? 0) + 1);
      }
      maxPerRelease = Math.max(maxPerRelease, ...perRelease.values(), 0);
      const offlineTop = offline?.[query.id];
      if (offlineTop) {
        const live = new Set(hits.map(key));
        overlap += offlineTop.filter((k) => live.has(k)).length;
      }
    }
    const evaluated = 10 * querySet.queries.length;
    report[mode] = {
      ...total,
      evaluated,
      lower_precision10: total.relevant / evaluated,
      upper_precision10: (total.relevant + total.uncertain + total.unjudged) / evaluated,
      by_group_lower: Object.fromEntries(Object.entries(groups).map(([g, v]) => [g, v.relevant / v.evaluated])),
      max_per_release: maxPerRelease,
      ...(offline ? { offline_overlap10: overlap / evaluated } : {}),
    };
  }
  return report;
}

/**
 * A blind review sheet for the live pairs no review has judged, in the #379
 * format `evaluations/379/review.mjs` reads. Pooled across modes and sorted
 * by key, so it says nothing about which mode found a track or where.
 */
export function unjudgedSheet(results, querySet, judged, querySha) {
  const queries = querySet.queries.map((query) => {
    const pool = new Map();
    for (const byQuery of Object.values(results)) {
      for (const hit of byQuery[query.id] ?? []) {
        if (!judged.get(`${query.id}:${key(hit)}`)) pool.set(key(hit), hit);
      }
    }
    const candidates = [...pool.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => ({
      track_id: t.track_id, friend_id: Number(t.friend_id), title: t.title, artist: t.artist, album: t.album ?? null,
      year: t.year ?? null, styles: t.styles ?? [], genres: t.genres ?? [], judgment: null, reason: '',
    }));
    return { id: query.id, text: query.text, candidates };
  }).filter((q) => q.candidates.length);
  return { schema_version: 1, query_sha256: querySha,
    instructions: 'Judge full query fit: relevant | not_relevant | uncertain. Use trustworthy evidence or audio, not AI notes alone.',
    queries };
}

const pct = (n) => n.toFixed(3);

/** Markdown for the issue: aggregates only, no track names. */
export function formatReport(report, meta) {
  const groups = [...new Set(Object.values(report).flatMap((r) => Object.keys(r.by_group_lower)))];
  const hasOverlap = Object.values(report).some((r) => r.offline_overlap10 !== undefined);
  const lines = [
    `Live spot-check of the ${meta.queries} frozen #379 queries, friend ${meta.friendId}, against \`${meta.version}\` (${meta.ranAt}). ` +
      `Context coverage: ${meta.contextMissing} tracks missing.`,
    '',
    `| Mode | P@10 | ${groups.join(' | ')} | Unjudged | Empty | Max/release |${hasOverlap ? ' Overlap with offline F |' : ''}`,
    `| --- | --- | ${groups.map(() => '---').join(' | ')} | --- | --- | --- |${hasOverlap ? ' --- |' : ''}`,
  ];
  for (const [mode, r] of Object.entries(report)) {
    const bounds = r.lower_precision10 === r.upper_precision10
      ? pct(r.lower_precision10) : `${pct(r.lower_precision10)}–${pct(r.upper_precision10)}`;
    lines.push(`| ${mode} | ${bounds} | ${groups.map((g) => pct(r.by_group_lower[g] ?? 0)).join(' | ')} | ` +
      `${r.unjudged + r.uncertain} | ${r.empty} | ${r.max_per_release} |${hasOverlap ? ` ${pct(r.offline_overlap10 ?? 0)} |` : ''}`);
  }
  lines.push('', 'Group columns are lower bounds. Offline F (#382, exact search, no release cap): 0.892–0.900.');
  return lines.join('\n');
}

/** The deployed image tag, so live numbers record what they measured. */
async function fetchVersion(apiBase, insecureTls) {
  const { get } = await import(apiBase.startsWith('https:') ? 'node:https' : 'node:http');
  return new Promise((resolve) => {
    const req = get(`${apiBase.replace(/\/$/, '')}/version`, { rejectUnauthorized: !insecureTls, timeout: 10_000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).version ?? 'unknown'); } catch { resolve('unknown'); }
      });
    });
    req.on('error', () => resolve('unknown'));
    req.on('timeout', () => req.destroy());
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    const reviewFiles = args.flatMap((a, i) => (a === '--review' ? [args[i + 1]] : []));
    if (!reviewFiles.length || !opt('--output')) {
      throw new Error('Usage: node evaluations/409/spot-check.mjs --review R1 [--review R2 ...] --output eval-data/409-live.json ' +
        '[--friend 6] [--modes semantic,hybrid,lexical] [--offline-scores eval-data/408-scores.json --offline-label F] ' +
        '[--unjudged-output eval-data/409-review.json] [--allow-incomplete]');
    }
    const { GroovenetClient, loadConfig } = await import('@groovenet/client');
    const cfg = loadConfig();
    const client = new GroovenetClient({ baseUrl: cfg.api_base, apiKey: cfg.api_key, insecureTls: cfg.insecure_tls, clientName: 'cli' });
    const friendId = Number(opt('--friend') ?? 6);
    const modes = (opt('--modes') ?? MODES.join(',')).split(',');

    const queryBytes = readFileSync(opt('--queries') ?? 'evaluations/379/queries.json');
    const querySha = createHash('sha256').update(queryBytes).digest('hex');
    const querySet = JSON.parse(queryBytes);
    const judged = mergeJudgments(reviewFiles.map((f) => JSON.parse(readFileSync(f))), querySha);
    const offline = opt('--offline-scores')
      ? JSON.parse(readFileSync(opt('--offline-scores'))).queries?.[opt('--offline-label') ?? 'F']
      : undefined;

    const contextMissing = assertContextReady(await client.getEmbeddingStatus(friendId), args.includes('--allow-incomplete'));
    const version = await fetchVersion(cfg.api_base, cfg.insecure_tls);
    const ranAt = new Date().toISOString();
    const results = await runQueries(client, querySet, {
      friendId, modes, onProgress: (id) => process.stderr.write(`${id} `),
    });
    process.stderr.write('\n');

    const report = scoreLive(results, querySet, judged, offline);
    const rankings = Object.fromEntries(Object.entries(results).map(([mode, byQuery]) =>
      [mode, Object.fromEntries(Object.entries(byQuery).map(([id, hits]) => [id, hits.map(key)]))]));
    writeFileSync(opt('--output'), JSON.stringify({ query_sha256: querySha, version, ran_at: ranAt, friend_id: friendId,
      context_missing: contextMissing, report, rankings }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (opt('--unjudged-output')) {
      const sheet = unjudgedSheet(results, querySet, judged, querySha);
      writeFileSync(opt('--unjudged-output'), JSON.stringify(sheet, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
      process.stderr.write(`${sheet.queries.reduce((n, q) => n + q.candidates.length, 0)} unjudged pairs → ${opt('--unjudged-output')}\n`);
    }
    console.log(formatReport(report, { queries: querySet.queries.length, friendId, version, ranAt, contextMissing }));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
