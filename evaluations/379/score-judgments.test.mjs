import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { scoreJudgments } from './score-judgments.mjs';

function fixture() {
  const queryBytes = Buffer.from(JSON.stringify({ queries: [{ id: 'q1', group: 'scene', text: 'music query' }] }));
  const sha = createHash('sha256').update(queryBytes).digest('hex');
  const keys = Array.from({ length: 10 }, (_, i) => `6:t${i}`);
  const review = { schema_version: 1, query_sha256: sha, queries: [{ id: 'q1', text: 'music query', candidates: keys.map((_, i) => ({
    friend_id: 6, track_id: `t${i}`, judgment: i < 6 ? 'relevant' : i < 8 ? 'not_relevant' : i === 8 ? 'uncertain' : null,
    reason: i === 8 ? 'Need to listen' : '',
  })) }] };
  const scores = { query_sha256: sha, queries: { q1: { blind_pool: keys, by_variant: { A: keys, B: [...keys].reverse(), C: keys } } } };
  return { queryBytes, review, scores };
}

test('unresolved judgments give lower/upper precision bounds, not incorrect zeroes', () => {
  const f = fixture();
  const report = scoreJudgments(f.review, f.scores, f.queryBytes);
  assert.deepEqual(report.judgments, { relevant: 6, not_relevant: 2, uncertain: 1, unreviewed: 1 });
  assert.equal(report.variants.A.judged, 8);
  assert.equal(report.variants.A.lower_precision10, 0.6);
  assert.equal(report.variants.A.upper_precision10, 0.8);
  assert.equal(report.per_query[0].variants.B.unresolved, 2);
  f.review.queries[0].candidates[8].judgment = 'not_relevant';
  f.review.queries[0].candidates[9].judgment = 'relevant';
  assert.equal(scoreJudgments(f.review, f.scores, f.queryBytes).variants.A.upper_precision10, 0.7);
});

test('refuses mismatched queries, pools, missing judgments, and rankings', () => {
  const f = fixture();
  assert.throws(() => scoreJudgments({ ...f.review, query_sha256: 'wrong' }, f.scores, f.queryBytes), /hash mismatch/);
  f.review.queries[0].candidates[8].reason = '';
  assert.throws(() => scoreJudgments(f.review, f.scores, f.queryBytes), /needs a reason/);
  f.review.queries[0].candidates[8].reason = 'Need to listen';
  f.scores.queries.q1.by_variant.B = ['6:t0'];
  assert.throws(() => scoreJudgments(f.review, f.scores, f.queryBytes), /Invalid top-10/);
  f.scores.queries.q1.by_variant.B = f.scores.queries.q1.by_variant.A;
  f.review.queries[0].candidates[0].track_id = 'missing';
  assert.throws(() => scoreJudgments(f.review, f.scores, f.queryBytes), /Blind pool/);
});
