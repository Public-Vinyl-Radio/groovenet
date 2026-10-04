import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertContextReady, formatReport, runQueries, scoreLive, searchWithRetry, unjudgedSheet,
} from './spot-check.mjs';

const querySet = { queries: [
  { id: 'q1', group: 'scene', text: 'organ cumbia' },
  { id: 'q2', group: 'style', text: 'trova' },
] };
const hit = (id, release = `r-${id}`, extra = {}) =>
  ({ track_id: id, friend_id: 6, release_id: release, title: `T ${id}`, artist: 'A', ...extra });
const tenHits = (prefix) => Array.from({ length: 10 }, (_, i) => hit(`${prefix}${i}`));

test('context readiness gates the run', () => {
  assert.equal(assertContextReady({ missing: { context: 0 } }), 0);
  assert.throws(() => assertContextReady({ missing: { context: 12 } }), /12 tracks still lack/);
  assert.equal(assertContextReady({ missing: { context: 12 } }, true), 12);
  assert.throws(() => assertContextReady({ missing: { identity: 0 } }), /deploy #411/);
});

test('a rate limit waits once and retries; anything else throws', async () => {
  let calls = 0;
  const waits = [];
  const client = { searchTracks: async () => { calls++; if (calls === 1) throw new Error('Request failed with status code 429'); return { tracks: [] }; } };
  assert.deepEqual(await searchWithRetry(client, {}, { wait: async (ms) => waits.push(ms) }), { tracks: [] });
  assert.deepEqual(waits, [60_000]);

  const broken = { searchTracks: async () => { throw new Error('boom'); } };
  await assert.rejects(searchWithRetry(broken, {}, { wait: async () => {} }), /boom/);
});

test('every query runs in every mode with the friend, and degraded results stop the run', async () => {
  const seen = [];
  const search = async (_client, params) => { seen.push(params); return { tracks: tenHits(params.mode[0]).concat(hit('extra')) }; };
  const progress = [];
  const results = await runQueries({}, querySet, { friendId: 6, modes: ['semantic', 'hybrid'], search, onProgress: (id) => progress.push(id) });

  assert.equal(seen.length, 4);
  assert.deepEqual(seen[0], { query: 'organ cumbia', limit: 10, mode: 'semantic', filters: { friend_id: 6 } });
  assert.equal(results.semantic.q1.length, 10);
  assert.deepEqual(progress, ['q1', 'q2']);

  const degraded = async () => ({ tracks: [], degraded: true });
  await assert.rejects(runQueries({}, querySet, { friendId: 6, modes: ['hybrid'], search: degraded }), /hybrid degraded/);
});

test('scoring bounds unjudged pairs, counts empty slots as misses and checks the release cap', () => {
  const judged = new Map([
    ['q1:6:a', 'relevant'], ['q1:6:b', 'relevant'], ['q1:6:c', 'not_relevant'], ['q1:6:d', 'uncertain'],
    ['q2:6:x', 'relevant'],
  ]);
  const results = { semantic: {
    q1: [hit('a', 'r1'), hit('b', 'r1'), hit('c'), hit('d'), hit('new')],
    q2: [hit('x')],
  } };
  const offline = { q1: ['6:a', '6:zzz'], q2: ['6:x'] };

  const { semantic } = scoreLive(results, querySet, judged, offline);

  assert.deepEqual(
    { relevant: semantic.relevant, not_relevant: semantic.not_relevant, uncertain: semantic.uncertain, unjudged: semantic.unjudged, empty: semantic.empty },
    { relevant: 3, not_relevant: 1, uncertain: 1, unjudged: 1, empty: 14 },
  );
  assert.equal(semantic.lower_precision10, 3 / 20);
  assert.equal(semantic.upper_precision10, 5 / 20);
  assert.deepEqual(semantic.by_group_lower, { scene: 0.2, style: 0.1 });
  assert.equal(semantic.max_per_release, 2);
  assert.equal(semantic.offline_overlap10, 2 / 20);

  assert.equal(scoreLive(results, querySet, judged).semantic.offline_overlap10, undefined);
  assert.throws(() => scoreLive({ hybrid: { q1: [] } }, querySet, judged), /Missing results for hybrid\/q2/);
});

test('a release-less track counts as its own release', () => {
  const results = { semantic: { q1: [hit('a', null), hit('b', null), hit('c', null)], q2: [] } };
  assert.equal(scoreLive(results, querySet, new Map()).semantic.max_per_release, 1);
});

test('the unjudged sheet pools modes, sorts by key and hides judged pairs', () => {
  const judged = new Map([['q1:6:a', 'relevant']]);
  const results = {
    semantic: { q1: [hit('c'), hit('a')], q2: [] },
    hybrid: { q1: [hit('b', 'r', { styles: ['Cumbia'] }), hit('c')], q2: [] },
  };

  const sheet = unjudgedSheet(results, querySet, judged, 'sha');

  assert.equal(sheet.schema_version, 1);
  assert.equal(sheet.query_sha256, 'sha');
  assert.deepEqual(sheet.queries.map((q) => q.id), ['q1']);
  assert.deepEqual(sheet.queries[0].candidates.map((c) => c.track_id), ['b', 'c']);
  assert.deepEqual(sheet.queries[0].candidates[0], {
    track_id: 'b', friend_id: 6, title: 'T b', artist: 'A', album: null, year: null,
    styles: ['Cumbia'], genres: [], judgment: null, reason: '',
  });
});

test('the report is aggregates only, with bounds collapsing when exact', () => {
  const report = {
    semantic: { lower_precision10: 0.9, upper_precision10: 0.9, by_group_lower: { scene: 0.8 }, unjudged: 0, uncertain: 0, empty: 0, max_per_release: 2, offline_overlap10: 0.75 },
    lexical: { lower_precision10: 0.1, upper_precision10: 0.15, by_group_lower: { scene: 0.1 }, unjudged: 3, uncertain: 1, empty: 200, max_per_release: 4 },
  };
  const text = formatReport(report, { queries: 24, friendId: 6, version: 'sha-1', ranAt: 'now', contextMissing: 0 });

  assert.match(text, /\| semantic \| 0\.900 \| 0\.800 \| 0 \| 0 \| 2 \| 0\.750 \|/);
  assert.match(text, /\| lexical \| 0\.100–0\.150 \| 0\.100 \| 4 \| 200 \| 4 \| 0\.000 \|/);
  assert.match(text, /`sha-1`/);
  assert.doesNotMatch(text, /T a|track_id/);
});
