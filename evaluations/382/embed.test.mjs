import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashText } from '../379/embed.mjs';
import { cachedHashes, embedQueries, generate, uniqueInputs } from './embed.mjs';

const fakeApi = (dims, seen = []) => async (_url, req) => {
  const body = JSON.parse(req.body);
  seen.push(body);
  return { ok: true, json: async () => ({ model: body.model, usage: { prompt_tokens: 5 * body.input.length },
    data: body.input.map((_, index) => ({ index, embedding: Array(dims).fill(index + 1) })) }) };
};

test('unique inputs cover only the chosen variants', () => {
  const rows = [{ text: { A: 'a', D: 'd', E: 'a' } }];
  assert.equal(uniqueInputs(rows, ['A', 'E']).size, 1);
  assert.equal(uniqueInputs(rows, ['A', 'D']).size, 2);
  assert.throws(() => uniqueInputs(rows, ['F']), /Missing F/);
});

test('dry run estimates cost per model; execute reuses, truncates and resumes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-382-'));
  try {
    const textsFile = join(dir, 'texts.json');
    writeFileSync(textsFile, JSON.stringify({ snapshot_sha256: 'snap', variants: ['A', 'D'], rows: [{ text: { A: 'aaaa', D: 'dddddddd' } }] }));
    const dry = await generate({ textsFile, outputDir: join(dir, 'x'), model: 'text-embedding-3-large', dims: 1536 });
    assert.equal(dry.dry_run, true);
    assert.equal(dry.approx_tokens_before_reuse, 3);
    assert.equal(dry.assumed_usd_per_million_tokens, 0.13);
    await assert.rejects(generate({ textsFile, outputDir: dir, model: 'ada', dims: 1 }), /Unsupported model/);
    await assert.rejects(generate({ textsFile, outputDir: dir, model: 'text-embedding-3-small', dims: 0 }), /positive integer/);
    await assert.rejects(generate({ textsFile, outputDir: dir, variants: ['Z'], model: 'text-embedding-3-small', dims: 1536 }), /Unknown variant/);
    await assert.rejects(generate({ textsFile, outputDir: dir, model: 'text-embedding-3-small', dims: 1536, execute: true, apiKey: '' }), /OPENAI_API_KEY/);

    // An earlier small-model cache already holds A.
    const reuseDir = join(dir, 'reuse');
    mkdirSync(reuseDir);
    writeFileSync(join(reuseDir, 'manifest.json'), JSON.stringify({ model: 'text-embedding-3-small', dims: 1536 }));
    writeFileSync(join(reuseDir, 'vectors.ndjson'), JSON.stringify({ hash: hashText('aaaa'), vector: Array(1536).fill(1) }) + '\n' +
      JSON.stringify({ hash: hashText('unrelated'), vector: Array(1536).fill(1) }) + '\n');
    const small = join(dir, 'small');
    const seen = [];
    const run = await generate({ textsFile, outputDir: small, model: 'text-embedding-3-small', dims: 1536, reuseDir, execute: true, apiKey: 'k', fetchFn: fakeApi(1536, seen) });
    assert.equal(run.reused, 1);
    assert.equal(run.generated, 1);
    assert.deepEqual(seen[0].input, ['dddddddd']);
    assert.equal('dimensions' in seen[0], false, 'native dims are not requested');
    assert.equal(cachedHashes(join(small, 'vectors.ndjson'), 1536).size, 2);
    const again = await generate({ textsFile, outputDir: small, model: 'text-embedding-3-small', dims: 1536, reuseDir, execute: true, apiKey: 'k', fetchFn: fakeApi(1536, seen) });
    assert.equal(again.generated + again.reused, 0);
    assert.equal(seen.length, 1);

    await assert.rejects(generate({ textsFile, outputDir: join(dir, 'l'), model: 'text-embedding-3-large', dims: 1536, reuseDir, execute: true, apiKey: 'k', fetchFn: fakeApi(1536) }), /different model or dims/);
    const largeSeen = [];
    const large = await generate({ textsFile, outputDir: join(dir, 'large'), model: 'text-embedding-3-large', dims: 1536, execute: true, apiKey: 'k', fetchFn: fakeApi(1536, largeSeen), maxBatches: 1 });
    assert.equal(largeSeen[0].dimensions, 1536);
    assert.equal(large.billed_tokens_this_run, 10);
    await assert.rejects(generate({ textsFile, outputDir: join(dir, 'large'), model: 'text-embedding-3-large', dims: 3072, execute: true, apiKey: 'k', fetchFn: fakeApi(3072) }), /changed/);
    await assert.rejects(generate({ textsFile, outputDir: join(dir, 'bad'), model: 'text-embedding-3-small', dims: 1536, execute: true, apiKey: 'k', fetchFn: fakeApi(8) }), /Unexpected vector/);
    writeFileSync(join(dir, 'corrupt.ndjson'), '{"hash":"h","vector":[1]}\n');
    assert.throws(() => cachedHashes(join(dir, 'corrupt.ndjson'), 1536), /Corrupt/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('queries are embedded only from the frozen set, at the requested dims', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-382-q-'));
  try {
    const queriesFile = join(dir, 'queries.json');
    const queries = Array.from({ length: 24 }, (_, n) => ({ id: `q${n}`, text: `query ${n}` }));
    writeFileSync(queriesFile, JSON.stringify({ status: 'draft', queries }));
    await assert.rejects(embedQueries({ queriesFile, output: join(dir, 'o'), model: 'text-embedding-3-large', dims: 3072, apiKey: 'k' }), /frozen/);
    writeFileSync(queriesFile, JSON.stringify({ status: 'approved_frozen', queries }));
    await assert.rejects(embedQueries({ queriesFile, output: join(dir, 'o'), model: 'text-embedding-3-large', dims: 3072, apiKey: '' }), /OPENAI_API_KEY/);
    await assert.rejects(embedQueries({ queriesFile, output: join(dir, 'o'), model: 'ada', dims: 3, apiKey: 'k' }), /Unsupported/);
    const seen = [];
    const out = join(dir, 'large.json');
    const summary = await embedQueries({ queriesFile, output: out, model: 'text-embedding-3-large', dims: 3072, apiKey: 'k', fetchFn: fakeApi(3072, seen) });
    assert.equal(summary.count, 24);
    assert.equal('dimensions' in seen[0], false);
    assert.equal(JSON.parse(readFileSync(out)).dims, 3072);
    await assert.rejects(embedQueries({ queriesFile, output: join(dir, 't.json'), model: 'text-embedding-3-large', dims: 1536, apiKey: 'k', fetchFn: fakeApi(8) }), /dimensions/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
