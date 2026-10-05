import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPS, capLabel, capRanking, cappedTopTens, formatReport, scoreCaps, unjudgedSheet } from './cap.mjs';

const track = (id, release) => ({ track_id: id, friend_id: 6, release_id: release, title: `T ${id}`, artist: 'A', album: 'Al', year: '1974' });
// Ranked order: three from r1, then r2, a release-less track, then the rest.
const tracks = [
  track('a', 'r1'), track('b', 'r1'), track('c', 'r1'), track('d', 'r2'), track('e', null),
  ...Array.from({ length: 12 }, (_, i) => track(`x${i}`, `rx${i}`)),
];
const ranking = tracks.map((_, i) => ({ i, score: 1 - i / 100 }));
const keys = (indices) => indices.map((i) => tracks[i].track_id);

test('caps keep rank order and skip a release once it is full', () => {
  assert.deepEqual(keys(capRanking(ranking, tracks, Infinity)), ['a', 'b', 'c', 'd', 'e', 'x0', 'x1', 'x2', 'x3', 'x4']);
  assert.deepEqual(keys(capRanking(ranking, tracks, 2)), ['a', 'b', 'd', 'e', 'x0', 'x1', 'x2', 'x3', 'x4', 'x5']);
  assert.deepEqual(keys(capRanking(ranking, tracks, 1, 3)), ['a', 'd', 'e']);
});

test('a track without a release counts as its own', () => {
  const loose = [track('p', null), track('q', null)];
  assert.deepEqual(capRanking([{ i: 0 }, { i: 1 }], loose, 1), [0, 1]);
});

test('cap labels and the default set run loosest to tightest', () => {
  assert.deepEqual(CAPS.map(capLabel), ['none', '3', '2', '1']);
});

test('every cap ranks every query from the same exact ranking', () => {
  const candidates = tracks.map((_, i) => Float32Array.from([1 - i / 100, i / 100]));
  const topTens = cappedTopTens(tracks, candidates, { queries: [{ id: 'q1', vector: [1, 0] }] }, [Infinity, 1]);
  assert.deepEqual(Object.keys(topTens).sort(), ['1', 'none']);
  assert.deepEqual(topTens.none.q1.slice(0, 3), ['6:a', '6:b', '6:c']);
  assert.deepEqual(topTens['1'].q1.slice(0, 3), ['6:a', '6:d', '6:e']);
});

const querySet = { queries: [{ id: 'q1', group: 'scene', text: 'organ cumbia' }] };
const tracksByKey = new Map(tracks.map((t) => [`6:${t.track_id}`, t]));
const top = (ids) => ids.map((id) => `6:${id}`);

test('scoring bounds unjudged pairs and counts releases', () => {
  const judged = new Map([['q1:6:a', 'relevant'], ['q1:6:b', 'relevant'], ['q1:6:d', 'not_relevant'], ['q1:6:e', 'uncertain']]);
  const topTens = { none: { q1: top(['a', 'b', 'c', 'd', 'e', 'x0', 'x1', 'x2', 'x3', 'x4']) } };

  const { none } = scoreCaps(topTens, querySet, judged, tracksByKey);

  assert.deepEqual({ relevant: none.relevant, not_relevant: none.not_relevant, uncertain: none.uncertain, unjudged: none.unjudged },
    { relevant: 2, not_relevant: 1, uncertain: 1, unjudged: 6 });
  assert.equal(none.lower_precision10, 0.2);
  assert.equal(none.upper_precision10, 0.9);
  assert.deepEqual(none.by_group_lower, { scene: 0.2 });
  // r1, r2, the release-less track and five singles.
  assert.equal(none.releases_per_top10, 8);

  assert.throws(() => scoreCaps({ none: { q1: top(['a']) } }, querySet, judged, tracksByKey), /Invalid top 10 for none\/q1/);
});

test('the unjudged sheet pools caps, hides judged pairs and prefers album genres', () => {
  const judged = new Map([['q1:6:a', 'relevant']]);
  const topTens = { none: { q1: top(['a', 'c']) }, 2: { q1: top(['a', 'd', 'c']) } };
  const albums = new Map([['6:r2', { styles: ['Cumbia'], genres: ['Latin'] }]]);

  const sheet = unjudgedSheet(topTens, querySet, judged, tracksByKey, albums, 'sha');

  assert.equal(sheet.query_sha256, 'sha');
  assert.deepEqual(sheet.queries[0].candidates.map((c) => c.track_id), ['c', 'd']);
  assert.deepEqual(sheet.queries[0].candidates[1], {
    track_id: 'd', friend_id: 6, title: 'T d', artist: 'A', album: 'Al', year: '1974',
    styles: ['Cumbia'], genres: ['Latin'], judgment: null, reason: '',
  });
  assert.deepEqual(unjudgedSheet({ none: { q1: top(['a']) } }, querySet, judged, tracksByKey, albums, 'sha').queries, []);
});

test('the report lists caps loosest first and only aggregates', () => {
  const row = (lower, upper) => ({ lower_precision10: lower, upper_precision10: upper, by_group_lower: { scene: lower },
    unjudged: 1, uncertain: 0, releases_per_top10: 4 });
  const text = formatReport({ 1: row(0.5, 0.6), 2: row(0.75, 0.8), none: row(0.9, 0.9) });
  const rows = text.split('\n').filter((l) => /^\| (none|\d) /.test(l)).map((l) => l.split('|')[1].trim());
  assert.deepEqual(rows, ['none', '2', '1']);
  assert.match(text, /\| none \| 0\.900 \|/);
  assert.match(text, /\| 2 \| 0\.750–0\.800 \|/);
  assert.doesNotMatch(text, /T a/);
});
