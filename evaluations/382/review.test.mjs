import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { priorJudgments, reviewSheet } from './make-review.mjs';
import { mergeJudgments, scoreJudgments } from './score-judgments.mjs';

const queriesBytes = Buffer.from(JSON.stringify({ queries: [{ id: 'q1', group: 'scene', text: 'organ cumbia' }] }));
const sha = createHash('sha256').update(queriesBytes).digest('hex');
const querySet = JSON.parse(queriesBytes);
const keys = Array.from({ length: 12 }, (_, i) => `6:t${i}`);
const snapshot = { tracks: keys.map((k, i) => ({ track_id: k.slice(2), friend_id: 6, release_id: `r${i}`, title: 'T', artist: 'A', album: 'L', year: 1970 })),
  albums: [{ friend_id: 6, release_id: 'r0', styles: ['Cumbia'], genres: ['Latin'] }] };
const sheet = (judgments) => ({ schema_version: 1, query_sha256: sha, queries: [{ id: 'q1', text: 'organ cumbia',
  candidates: Object.entries(judgments).map(([key, judgment]) => ({ friend_id: 6, track_id: key.slice(2), judgment, reason: judgment === 'uncertain' ? 'why' : '' })) }] });

test('new review sheets hold only pooled pairs nobody has judged', () => {
  const prior = priorJudgments([sheet({ '6:t0': 'relevant', '6:t1': null })]);
  assert.deepEqual([...prior.keys()], ['q1:6:t0']);
  const scores = { query_sha256: sha, blind_pools: { q1: ['6:t0', '6:t1', '6:t2'] } };
  const out = reviewSheet(snapshot, querySet, scores, prior);
  assert.deepEqual(out.queries[0].candidates.map((c) => c.track_id), ['t1', 't2']);
  assert.equal(out.queries[0].candidates[0].judgment, null);
  assert.equal(reviewSheet(snapshot, querySet, { blind_pools: { q1: ['6:t0'] } }, prior).queries.length, 0);
  assert.throws(() => reviewSheet(snapshot, querySet, { blind_pools: {} }, prior), /Missing scored query/);
  assert.throws(() => reviewSheet(snapshot, querySet, { blind_pools: { q1: ['6:zz'] } }, prior), /Missing pooled track/);
  const withAlbum = reviewSheet(snapshot, querySet, { blind_pools: { q1: ['6:t0'] } }, new Map());
  assert.deepEqual(withAlbum.queries[0].candidates[0].styles, ['Cumbia']);
});

test('merged judgments bound precision; unjudged pairs are never misses', () => {
  const old = sheet({ '6:t0': 'relevant', '6:t1': 'not_relevant', '6:t2': 'uncertain' });
  const fresh = sheet({ '6:t3': 'relevant', '6:t1': null });
  const scores = { query_sha256: sha, queries: { X: { q1: keys.slice(0, 10) }, Y: { q1: keys.slice(2, 12) } } };
  const report = scoreJudgments([old, fresh], scores, queriesBytes);
  assert.equal(report.runs.X.relevant, 2);
  assert.equal(report.runs.X.not_relevant, 1);
  assert.equal(report.runs.X.lower_precision10, 0.2);
  assert.equal(report.runs.X.upper_precision10, 0.9);
  assert.equal(report.runs.Y.unjudged, 8);
  assert.equal(report.runs.Y.by_group_lower.scene, 0.1);
  assert.throws(() => scoreJudgments([old], { ...scores, query_sha256: 'x' }, queriesBytes), /hash mismatch/);
  assert.throws(() => scoreJudgments([old], { query_sha256: sha, queries: { X: { q1: keys.slice(0, 9) } } }, queriesBytes), /Invalid top 10/);
  assert.throws(() => mergeJudgments([{ ...old, query_sha256: 'x' }], sha), /another query set/);
  assert.throws(() => mergeJudgments([old, sheet({ '6:t0': 'not_relevant' })], sha), /Conflicting/);
  const bad = sheet({ '6:t0': 'uncertain' });
  bad.queries[0].candidates[0].reason = ' ';
  assert.throws(() => mergeJudgments([bad], sha), /needs a reason/);
});
