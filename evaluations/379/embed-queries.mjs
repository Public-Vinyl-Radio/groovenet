#!/usr/bin/env node
/** Embed the frozen query set once with the same model used for A/B/C. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requestEmbeddings } from './embed.mjs';

export async function embedQueries(queriesFile, output, apiKey = process.env.OPENAI_API_KEY, fetchFn = fetch) {
  const raw = readFileSync(queriesFile);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const set = JSON.parse(raw);
  if (set.status !== 'approved_frozen' || set.queries?.length !== 24 || new Set(set.queries.map((q) => q.id)).size !== 24) {
    throw new Error('Query set is not the approved frozen 24-query set');
  }
  if (!apiKey) throw new Error('OPENAI_API_KEY not available; run via op run --env-file=.env.tpl');
  const model = 'text-embedding-3-small';
  const { vectors, tokens } = await requestEmbeddings(set.queries.map((q) => q.text), model, apiKey, fetchFn);
  if (vectors.some((v) => v.length !== 1536 || v.some((n) => !Number.isFinite(n)))) throw new Error('Unexpected query vector dimensions');
  writeFileSync(output, JSON.stringify({ query_sha256: sha256, model, dims: 1536, prompt_tokens: tokens,
    queries: set.queries.map((q, i) => ({ id: q.id, vector: vectors[i] })) }), { flag: 'wx', mode: 0o600 });
  return { query_sha256: sha256, model, count: vectors.length, billed_tokens: tokens,
    assumed_usd_per_million_tokens: 0.02, estimated_usd: tokens * 0.02 / 1e6, output };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = process.argv.slice(2);
    const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
    if (!opt('--queries') || !opt('--output')) throw new Error('Usage: node evaluations/379/embed-queries.mjs --queries evaluations/379/queries.json --output eval-data/379-query-vectors.json');
    console.log(JSON.stringify(await embedQueries(opt('--queries'), opt('--output')), null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
