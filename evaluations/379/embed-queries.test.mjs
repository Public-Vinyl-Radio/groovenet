import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { embedQueries } from './embed-queries.mjs';

test('only embeds a frozen set and never overwrites vectors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'eval-queries-'));
  try {
    const input = join(dir, 'queries.json');
    const output = join(dir, 'vectors.json');
    const queries = Array.from({ length: 24 }, (_, n) => ({ id: `q${n}`, text: `music query ${n}` }));
    writeFileSync(input, JSON.stringify({ status: 'draft_pending_review', queries }));
    await assert.rejects(embedQueries(input, output, 'fake'), /approved frozen/);
    writeFileSync(input, JSON.stringify({ status: 'approved_frozen', queries }));
    const fake = async (_url, options) => ({ ok: true, json: async () => ({ model: 'text-embedding-3-small', usage: { prompt_tokens: 48 }, data: JSON.parse(options.body).input.map((_, index) => ({ index, embedding: Array(1536).fill(index) })) }) });
    const summary = await embedQueries(input, output, 'fake', fake);
    assert.equal(summary.billed_tokens, 48);
    assert.equal(JSON.parse(readFileSync(output)).queries.length, 24);
    await assert.rejects(embedQueries(input, output, 'fake', fake), /EEXIST/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
