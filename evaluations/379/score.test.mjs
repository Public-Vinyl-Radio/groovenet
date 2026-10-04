import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSeeds, dot, metric, playlistMates, rank, scorePlaylists, scoreQueries } from './score.mjs';
import { hashText } from './embed.mjs';

const tracks = [
  { track_id: 'a', friend_id: 6, release_id: 'r1', notes: 'fact' },
  { track_id: 'b', friend_id: 6, release_id: 'r1', notes: null },
  { track_id: 'c', friend_id: 6, release_id: 'r2', notes: 'fact' },
  { track_id: 'd', friend_id: 6, release_id: 'r3', notes: null },
];
const snapshot = { tracks, playlists: [
  { tracks: [{ track_id: 'a', friend_id: 6 }, { track_id: 'b', friend_id: 6 }, { track_id: 'c', friend_id: 6 }, { track_id: 'c', friend_id: 6 }, { track_id: 'x', friend_id: 7 }] },
] };
const rows = tracks.map((t) => ({ track_id: t.track_id, text: { A: t.track_id, B: t.track_id, C: t.track_id } }));
const vector = (i) => Float32Array.from([i === 0 ? 1 : 0, i === 1 ? 1 : 0, ...Array(1534).fill(0)]);
const vectors = new Map(rows.map((r, i) => [hashText(r.text.A), vector(i % 2)]));

test('playlist mates deduplicate entries and exclude self and unknown users', () => {
  const mates = playlistMates(snapshot);
  assert.deepEqual([...mates.get('6:a')].sort(), ['6:b', '6:c']);
  assert.equal(mates.has('7:x'), false);
  assert.equal(chooseSeeds(snapshot, mates, 1, 1).length, 2);
});

test('rank uses exact dot product, excludes seed, then computes playlist metrics', () => {
  assert.equal(dot(vector(0), vector(1)), 0);
  assert.equal(dot(vector(0), vector(0)), 1);
  const ordering = rank(vector(0), [vector(0), vector(1), vector(0), vector(1)], 0);
  assert.deepEqual(ordering.map((r) => r.i), [2, 1, 3]);
  const m = metric(ordering, new Set(['6:b', '6:c']), tracks, 'r1');
  assert.equal(m.recall10, 1);
  assert.equal(m.reciprocal_rank, 1);
  assert.deepEqual(metric(ordering, new Set(['6:b']), tracks, 'r1', true), null);
});

test('all variants share the same playlist sample, and query pool blinds variant rank', () => {
  const result = scorePlaylists(snapshot, rows, vectors, 2, 1);
  assert.equal(result.sample_size, 3);
  assert.deepEqual(result.variants.A.all, result.variants.B.all);
  assert.deepEqual(result.variants.A.all, result.variants.C.all);
  const query = scoreQueries(snapshot, rows, vectors, { queries: [{ id: 'q01', vector: [1, 0, ...Array(1534).fill(0)] }] });
  assert.equal(query.q01.by_variant.A.length, 4);
  assert.equal(query.q01.blind_pool.length, 4);
  assert.deepEqual(new Set(query.q01.blind_pool), new Set(query.q01.by_variant.A));
  assert.throws(() => scoreQueries(snapshot, rows, vectors, { queries: [{ id: 'q02', vector: [0] }] }), /Invalid query vector/);
});
