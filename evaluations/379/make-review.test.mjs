import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reviewSheet } from './make-review.mjs';

test('blind review includes metadata but no scores, variants, or AI notes', () => {
  const set = { queries: [{ id: 'q1', text: 'warm Cuban vocals' }] };
  const sha = createHash('sha256').update(JSON.stringify(set, null, 2) + '\n').digest('hex');
  const snapshot = { tracks: [{ track_id: 't1', friend_id: 6, release_id: 'r1', title: 'Title', artist: 'Artist', album: 'Release', notes: 'AI should not judge itself' }],
    albums: [{ release_id: 'r1', friend_id: 6, styles: ['Son'], genres: ['Latin'] }] };
  const scores = { query_sha256: sha, queries: { q1: { blind_pool: ['6:t1'], by_variant: { A: ['6:t1'] } } } };
  const sheet = reviewSheet(snapshot, set, scores);
  assert.deepEqual(sheet.queries[0].candidates, [{ track_id: 't1', friend_id: 6, title: 'Title', artist: 'Artist', album: 'Release', year: undefined, styles: ['Son'], genres: ['Latin'], judgment: null, reason: '' }]);
  assert.equal(JSON.stringify(sheet).includes('AI should not judge itself'), false);
  assert.equal(JSON.stringify(sheet).includes('by_variant'), false);
  assert.throws(() => reviewSheet(snapshot, set, { ...scores, query_sha256: 'wrong' }), /hash/);
  assert.throws(() => reviewSheet(snapshot, set, { ...scores, queries: {} }), /Missing scored query/);
  assert.throws(() => reviewSheet(snapshot, set, { ...scores, queries: { q1: { blind_pool: ['6:missing'] } } }), /Missing pooled track/);
});
