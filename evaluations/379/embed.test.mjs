import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generate, hashText, requestEmbeddings, uniqueInputs } from './embed.mjs';

test('deduplicates identical A/B/C text and rejects missing text', () => {
  assert.equal(uniqueInputs([{ text: { A: 'a', B: 'a', C: 'b' } }]).size, 2);
  assert.equal(hashText('a').length, 64);
  assert.throws(() => uniqueInputs([{ text: { A: 'a', B: '', C: 'c' } }]), /Missing B/);
});

test('validates response order and usage without logging note content', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ model: 'text-embedding-3-small', usage: { prompt_tokens: 8 }, data: [
    { index: 1, embedding: [2] }, { index: 0, embedding: [1] },
  ] }) });
  assert.deepEqual(await requestEmbeddings(['a', 'b'], 'text-embedding-3-small', 'fake', fake), { vectors: [[1], [2]], tokens: 8 });
  await assert.rejects(requestEmbeddings(['a'], 'text-embedding-3-small', 'fake', fake), /Invalid OpenAI embedding response/);
  await assert.rejects(requestEmbeddings(['a'], 'text-embedding-3-small', 'fake', async () => ({ ok: false, status: 401 })), /HTTP 401/);
});

test('dry-run and explicitly paid mode use a resumable private cache', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'embedding-eval-'));
  try {
    const textsFile = join(dir, 'texts.json');
    const outputDir = join(dir, 'cache');
    writeFileSync(textsFile, JSON.stringify({ model: 'text-embedding-3-small', snapshot_sha256: 'snapshot', rows: [{ text: { A: 'a', B: 'b', C: 'a' } }] }));
    const dry = await generate({ textsFile, outputDir });
    assert.equal(dry.distinct_inputs, 2);
    assert.equal(dry.batches, 1);
    await assert.rejects(generate({ textsFile, outputDir, execute: true, apiKey: '' }), /OPENAI_API_KEY/);
    let calls = 0;
    const fetchFn = async (_url, req) => {
      calls++;
      const input = JSON.parse(req.body).input;
      assert.equal(req.headers.Authorization, 'Bearer fake');
      return { ok: true, json: async () => ({ model: 'text-embedding-3-small', usage: { prompt_tokens: 12 }, data: input.map((_, index) => ({ index, embedding: Array(1536).fill(index) })) }) };
    };
    const first = await generate({ textsFile, outputDir, execute: true, apiKey: 'fake', fetchFn });
    assert.equal(first.generated, 2);
    assert.equal(first.billed_tokens_this_run, 12);
    assert.equal(readFileSync(join(outputDir, 'vectors.ndjson'), 'utf8').trim().split('\n').length, 2);
    const second = await generate({ textsFile, outputDir, execute: true, apiKey: 'fake', fetchFn });
    assert.equal(second.cached_before_run, 2);
    assert.equal(second.generated, 0);
    assert.equal(calls, 1);
    writeFileSync(textsFile, JSON.stringify({ model: 'text-embedding-3-small', snapshot_sha256: 'changed', rows: [{ text: { A: 'a', B: 'b', C: 'a' } }] }));
    await assert.rejects(generate({ textsFile, outputDir, execute: true, apiKey: 'fake', fetchFn }), /Input\/model changed/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
