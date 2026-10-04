#!/usr/bin/env node
/**
 * Offline, resumable embeddings for any subset of #382 variants, on any
 * text-embedding-3 model and dimension. Never calls the production app.
 * `--reuse-dir` reads an earlier cache with the same model and dims (e.g.
 * #379's) so unchanged texts such as A are not paid for twice.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashText, requestEmbeddings } from '../379/embed.mjs';

export const PRICES_PER_MILLION = { 'text-embedding-3-small': 0.02, 'text-embedding-3-large': 0.13 };
export const NATIVE_DIMS = { 'text-embedding-3-small': 1536, 'text-embedding-3-large': 3072 };
const BATCH = 100;

export function uniqueInputs(rows, variants) {
  const texts = new Map();
  for (const row of rows) {
    for (const variant of variants) {
      const text = row.text[variant];
      if (typeof text !== 'string' || !text.trim()) throw new Error(`Missing ${variant} text`);
      texts.set(hashText(text), text);
    }
  }
  return texts;
}

/** Hashes of complete vectors in a cache, checked against the expected dims. */
export function cachedHashes(file, dims) {
  const done = new Set();
  if (!existsSync(file)) return done;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const item = JSON.parse(line);
    if (!item.hash || !Array.isArray(item.vector) || item.vector.length !== dims) throw new Error('Corrupt vector cache');
    done.add(item.hash);
  }
  return done;
}

/** Copy vectors the run needs from a compatible earlier cache into this one. */
function reuse(reuseDir, model, dims, wanted, done, vectorsFile) {
  const manifest = JSON.parse(readFileSync(join(reuseDir, 'manifest.json')));
  if (manifest.model !== model || manifest.dims !== dims) throw new Error('Reuse cache has a different model or dims');
  let copied = 0;
  const lines = [];
  for (const line of readFileSync(join(reuseDir, 'vectors.ndjson'), 'utf8').split('\n')) {
    if (!line) continue;
    const { hash } = JSON.parse(line);
    if (wanted.has(hash) && !done.has(hash)) {
      lines.push(line);
      done.add(hash);
      copied++;
    }
  }
  if (lines.length) appendFileSync(vectorsFile, lines.join('\n') + '\n', { mode: 0o600 });
  return copied;
}

export async function generate({
  textsFile, outputDir, variants, model, dims, reuseDir, execute = false,
  maxBatches = Infinity, fetchFn = fetch, apiKey = process.env.OPENAI_API_KEY,
}) {
  if (!(model in PRICES_PER_MILLION)) throw new Error(`Unsupported model ${model}`);
  if (!Number.isInteger(dims) || dims <= 0) throw new Error('--dims must be a positive integer');
  const bytes = readFileSync(textsFile);
  const { rows, snapshot_sha256, variants: available } = JSON.parse(bytes);
  if (!Array.isArray(rows) || !snapshot_sha256) throw new Error('Unexpected evaluation text input');
  const chosen = variants ?? available;
  if (chosen.some((v) => !available.includes(v))) throw new Error('Unknown variant requested');
  const inputs = uniqueInputs(rows, chosen);
  const price = PRICES_PER_MILLION[model];
  const approxTokens = [...inputs.values()].reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
  const manifest = { schema_version: 1, snapshot_sha256, model, dims };
  if (!execute) {
    return { dry_run: true, ...manifest, variants: chosen, distinct_inputs: inputs.size,
      approx_tokens_before_reuse: approxTokens, assumed_usd_per_million_tokens: price,
      estimated_usd_before_reuse: approxTokens * price / 1e6 };
  }
  if (!apiKey) throw new Error('OPENAI_API_KEY not available; run via op run --env-file=.env.tpl');
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const manifestFile = join(outputDir, 'manifest.json');
  if (existsSync(manifestFile)) {
    if (JSON.stringify(JSON.parse(readFileSync(manifestFile))) !== JSON.stringify(manifest)) {
      throw new Error('Snapshot/model/dims changed; use a new output directory');
    }
  } else {
    writeFileSync(manifestFile, JSON.stringify(manifest) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const vectorsFile = join(outputDir, 'vectors.ndjson');
  const done = cachedHashes(vectorsFile, dims);
  const reused = reuseDir ? reuse(reuseDir, model, dims, inputs, done, vectorsFile) : 0;
  const pending = [...inputs].filter(([hash]) => !done.has(hash));
  // The API returns native dims unless asked; only ask when truncating.
  const requestDims = dims === NATIVE_DIMS[model] ? undefined : dims;
  let billedTokens = 0;
  let generated = 0;
  for (let i = 0; i < pending.length && i / BATCH < maxBatches; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const { vectors, tokens } = await requestEmbeddings(batch.map(([, text]) => text), model, apiKey, fetchFn, requestDims);
    if (vectors.some((v) => v.length !== dims || v.some((n) => !Number.isFinite(n)))) {
      throw new Error('Unexpected vector dimensions or values');
    }
    appendFileSync(vectorsFile, batch.map(([hash], index) => JSON.stringify({ hash, vector: vectors[index] })).join('\n') + '\n', { mode: 0o600 });
    appendFileSync(join(outputDir, 'usage.ndjson'), JSON.stringify({ count: batch.length, prompt_tokens: tokens, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
    billedTokens += tokens;
    generated += batch.length;
    console.error(`Embedded ${done.size + generated}/${inputs.size} unique texts; ${billedTokens} tokens this run`);
  }
  return { ...manifest, variants: chosen, distinct_inputs: inputs.size, reused, generated,
    remaining: pending.length - generated, billed_tokens_this_run: billedTokens,
    assumed_usd_per_million_tokens: price, estimated_usd_this_run: billedTokens * price / 1e6 };
}

/** Embed the frozen #379 query set with a given model/dims (the queries never change). */
export async function embedQueries({ queriesFile, output, model, dims, apiKey = process.env.OPENAI_API_KEY, fetchFn = fetch }) {
  const raw = readFileSync(queriesFile);
  const set = JSON.parse(raw);
  if (set.status !== 'approved_frozen' || set.queries?.length !== 24) throw new Error('Query set is not the approved frozen 24-query set');
  if (!apiKey) throw new Error('OPENAI_API_KEY not available; run via op run --env-file=.env.tpl');
  const native = NATIVE_DIMS[model];
  if (!native) throw new Error(`Unsupported model ${model}`);
  const { vectors, tokens } = await requestEmbeddings(set.queries.map((q) => q.text), model, apiKey, fetchFn, dims === native ? undefined : dims);
  if (vectors.some((v) => v.length !== dims)) throw new Error('Unexpected query vector dimensions');
  const query_sha256 = createHash('sha256').update(raw).digest('hex');
  writeFileSync(output, JSON.stringify({ query_sha256, model, dims, prompt_tokens: tokens,
    queries: set.queries.map((q, i) => ({ id: q.id, vector: vectors[i] })) }), { flag: 'wx', mode: 0o600 });
  return { query_sha256, model, dims, count: vectors.length, billed_tokens: tokens, output };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const option = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
    const model = option('--model') ?? 'text-embedding-3-small';
    const dims = Number(option('--dims') ?? (model === 'text-embedding-3-large' ? 3072 : 1536));
    if (option('--queries')) {
      if (!option('--output')) throw new Error('Usage: node evaluations/382/embed.mjs --queries evaluations/379/queries.json --output FILE [--model M --dims N]');
      console.log(JSON.stringify(await embedQueries({ queriesFile: option('--queries'), output: option('--output'), model, dims }), null, 2));
    } else {
      const textsFile = option('--texts');
      const outputDir = option('--output-dir');
      if (!textsFile || !outputDir) throw new Error('Usage: node evaluations/382/embed.mjs --texts eval-data/382-texts.json --output-dir DIR [--variants A2,D] [--model M --dims N] [--reuse-dir DIR] [--execute] [--max-batches N]');
      const maxBatches = option('--max-batches') ? Number(option('--max-batches')) : Infinity;
      if ((!Number.isInteger(maxBatches) && maxBatches !== Infinity) || maxBatches < 1) throw new Error('--max-batches must be a positive integer');
      const variants = option('--variants')?.split(',');
      console.log(JSON.stringify(await generate({ textsFile, outputDir, variants, model, dims,
        reuseDir: option('--reuse-dir'), execute: args.includes('--execute'), maxBatches }), null, 2));
    }
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
