#!/usr/bin/env node
/** Offline, resumable embeddings. Never calls the production app or writes its vectors. */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hashText = (text) => createHash('sha256').update(text).digest('hex');

export function uniqueInputs(rows) {
  const texts = new Map();
  for (const row of rows) {
    for (const variant of ['A', 'B', 'C']) {
      const text = row.text[variant];
      if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing ${variant} text`);
      texts.set(hashText(text), text);
    }
  }
  return texts;
}

export async function requestEmbeddings(texts, model, apiKey, fetchFn = fetch) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetchFn('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: texts }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (err) {
      if (attempt === 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        continue;
      }
      // Do not log the response body: it might contain a submitted note.
      throw new Error(`OpenAI embeddings HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.model !== model || data.data?.length !== texts.length || !Number.isSafeInteger(data.usage?.prompt_tokens)) {
      throw new Error('Invalid OpenAI embedding response');
    }
    const ordered = [...data.data].sort((a, b) => a.index - b.index);
    if (ordered.some((item, index) => item.index !== index || !Array.isArray(item.embedding))) {
      throw new Error('Invalid OpenAI embedding indices');
    }
    return { vectors: ordered.map((item) => item.embedding), tokens: data.usage.prompt_tokens };
  }
  throw new Error('Retry limit reached');
}

export async function generate({ textsFile, outputDir, execute = false, maxBatches = Infinity, fetchFn = fetch, apiKey = process.env.OPENAI_API_KEY }) {
  const bytes = readFileSync(textsFile);
  const inputSha = createHash('sha256').update(bytes).digest('hex');
  const { model, rows, snapshot_sha256 } = JSON.parse(bytes);
  if (model !== 'text-embedding-3-small' || !Array.isArray(rows) || !snapshot_sha256) throw new Error('Unexpected evaluation text input');
  const inputs = uniqueInputs(rows);
  const manifest = { schema_version: 1, input_sha256: inputSha, snapshot_sha256, model, dims: 1536 };
  if (execute && !apiKey) throw new Error('OPENAI_API_KEY not available; run via op run --env-file=.env.tpl');
  if (!execute) return { dry_run: true, ...manifest, distinct_inputs: inputs.size, batches: Math.ceil(inputs.size / 100) };
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const manifestFile = join(outputDir, 'manifest.json');
  if (existsSync(manifestFile)) {
    if (JSON.stringify(JSON.parse(readFileSync(manifestFile))) !== JSON.stringify(manifest)) throw new Error('Input/model changed; use a new output directory');
  } else {
    writeFileSync(manifestFile, JSON.stringify(manifest) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const vectorsFile = join(outputDir, 'vectors.ndjson');
  const usageFile = join(outputDir, 'usage.ndjson');
  const done = new Set();
  if (existsSync(vectorsFile)) {
    for (const line of readFileSync(vectorsFile, 'utf8').split('\n')) {
      if (!line) continue;
      const item = JSON.parse(line);
      if (item.hash && Array.isArray(item.vector) && item.vector.length === 1536) done.add(item.hash);
      else throw new Error('Corrupt vector cache');
    }
  }
  const pending = [...inputs].filter(([hash]) => !done.has(hash));
  let billedTokens = 0;
  let generated = 0;
  for (let i = 0; i < pending.length && i / 100 < maxBatches; i += 100) {
    const batch = pending.slice(i, i + 100);
    const { vectors, tokens } = await requestEmbeddings(batch.map(([, text]) => text), model, apiKey, fetchFn);
    if (vectors.some((v) => v.length !== 1536 || v.some((n) => !Number.isFinite(n)))) throw new Error('Unexpected vector dimensions or values');
    appendFileSync(vectorsFile, batch.map(([hash], index) => JSON.stringify({ hash, vector: vectors[index] })).join('\n') + '\n', { mode: 0o600 });
    appendFileSync(usageFile, JSON.stringify({ count: batch.length, prompt_tokens: tokens, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
    billedTokens += tokens;
    generated += batch.length;
    // Don't print raw text or any secret, only non-sensitive progress.
    console.error(`Embedded ${done.size + generated}/${inputs.size} unique texts; ${billedTokens} tokens this run`);
  }
  return { ...manifest, distinct_inputs: inputs.size, cached_before_run: done.size, generated, remaining: pending.length - generated, billed_tokens_this_run: billedTokens, assumed_usd_per_million_tokens: 0.02, estimated_usd_this_run: billedTokens * 0.02 / 1e6 };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const option = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
    const textsFile = option('--texts');
    const outputDir = option('--output-dir');
    if (!textsFile || !outputDir) throw new Error('Usage: node evaluations/379/embed.mjs --texts eval-data/379-texts.json --output-dir eval-data/379-vectors [--execute] [--max-batches 1]');
    const maxBatches = option('--max-batches') ? Number(option('--max-batches')) : Infinity;
    if (!Number.isInteger(maxBatches) && maxBatches !== Infinity || maxBatches < 1) throw new Error('--max-batches must be a positive integer');
    console.log(JSON.stringify(await generate({ textsFile, outputDir, execute: args.includes('--execute'), maxBatches }), null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
