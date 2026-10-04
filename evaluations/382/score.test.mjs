import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashText } from '../379/embed.mjs';
import { blindPools, candidateVectors, loadVectors, normalize, parseRun, scorePlaylist, topQueries } from './score.mjs';

const tracks = [
  { track_id: 'a', friend_id: 6, release_id: 'r1', notes: 'x' },
  { track_id: 'b', friend_id: 6, release_id: 'r1', notes: null },
  { track_id: 'c', friend_id: 6, release_id: 'r2', notes: 'x' },
];
const snapshot = { tracks, playlists: [{ tracks: [{ track_id: 'a', friend_id: 6 }, { track_id: 'c', friend_id: 6 }] }] };

test('run specs need all four parts', () => {
  assert.deepEqual(parseRun('E-small:E:dir:q.json'), { label: 'E-small', variant: 'E', vectorsDir: 'dir', queryVectors: 'q.json' });
  assert.throws(() => parseRun('E:E:dir'), /Invalid --run/);
  assert.throws(() => parseRun('E:E:dir:q:extra'), /Invalid --run/);
});

test('vectors load at any dims, normalized, filtered to the wanted hashes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-382-s-'));
  try {
    const file = join(dir, 'v.ndjson');
    writeFileSync(file, [{ hash: 'h1', vector: [3, 4] }, { hash: 'h2', vector: [1, 0] }].map((x) => JSON.stringify(x)).join('\n') + '\n\n');
    const all = await loadVectors(file, 2);
    assert.deepEqual([...all.get('h1')].map((n) => +n.toFixed(2)), [0.6, 0.8]);
    assert.equal((await loadVectors(file, 2, new Set(['h2']))).size, 1);
    await assert.rejects(loadVectors(file, 3), /Invalid cached vector/);
    assert.throws(() => normalize([0, 0]), /norm/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('playlist proxy and query top 10 use exact ranking; pools merge runs blindly', () => {
  const rows = tracks.map((t) => ({ track_id: t.track_id, text: { E: t.track_id } }));
  const vectors = new Map([['a', [1, 0]], ['b', [0, 1]], ['c', [1, 0.1]]].map(([k, v]) => [hashText(k), normalize(v)]));
  const candidates = candidateVectors(rows, 'E', vectors);
  assert.throws(() => candidateVectors(rows, 'E', new Map()), /Missing E vector/);
  const playlist = scorePlaylist(snapshot, candidates);
  assert.equal(playlist.sample_size, 2);
  assert.equal(playlist.all.mrr, 1);
  assert.equal(playlist.excluding_same_release.seeds, 2);
  const many = Array.from({ length: 12 }, (_, i) => ({ track_id: `t${i}`, friend_id: 6 }));
  const top = topQueries({ tracks: many }, many.map((_, i) => normalize([1, i])), { queries: [{ id: 'q1', vector: [0, 1] }] });
  assert.equal(top.q1.length, 10);
  assert.equal(top.q1[0], '6:t11');
  const pools = blindPools({ X: { q1: ['6:a', '6:b'] }, Y: { q1: ['6:b', '6:c'] } });
  assert.deepEqual([...pools.q1].sort(), ['6:a', '6:b', '6:c']);
  assert.deepEqual(blindPools({ Y: { q1: ['6:c', '6:b', '6:a'] } }), pools, 'order depends only on query and track');
  assert.deepEqual(scorePlaylist({ tracks, playlists: [] }, candidates).all, { seeds: 0, recall10: null, mrr: null, hits10: null });
});
