#!/usr/bin/env node
/**
 * Playlist proxy and query rankings for any set of #382 runs. A run is one
 * variant's text embedded with one model/dims, plus that model's query
 * vectors. Ranking, seeds and metrics are #379's, so A here reproduces #379.
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { hashText } from '../379/embed.mjs';
import { chooseSeeds, metric, playlistMates, rank } from '../379/score.mjs';

export function normalize(vector) {
  const values = Float32Array.from(vector);
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Invalid vector norm');
  for (let i = 0; i < values.length; i++) values[i] /= norm;
  return values;
}

export async function loadVectors(file, dims, wanted) {
  const vectors = new Map();
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (!line) continue;
    const { hash, vector } = JSON.parse(line);
    if (!hash || vector?.length !== dims) throw new Error('Invalid cached vector');
    if (!wanted || wanted.has(hash)) vectors.set(hash, normalize(vector));
  }
  return vectors;
}

/** `LABEL:VARIANT:VECTORS_DIR:QUERY_VECTORS_FILE`, e.g. `E-small:E:eval-data/382-small:eval-data/379-query-vectors.json`. */
export function parseRun(spec) {
  const [label, variant, vectorsDir, queryVectors, ...rest] = spec.split(':');
  if (!label || !variant || !vectorsDir || !queryVectors || rest.length) throw new Error(`Invalid --run ${spec}`);
  return { label, variant, vectorsDir, queryVectors };
}

export function candidateVectors(rows, variant, vectors) {
  return rows.map((r) => {
    const v = vectors.get(hashText(r.text[variant]));
    if (!v) throw new Error(`Missing ${variant} vector for ${r.track_id}`);
    return v;
  });
}

function aggregate(samples) {
  if (!samples.length) return { seeds: 0, recall10: null, mrr: null, hits10: null };
  const mean = (key) => samples.reduce((s, x) => s + x[key], 0) / samples.length;
  return { seeds: samples.length, recall10: mean('recall10'), mrr: mean('reciprocal_rank'), hits10: mean('hits10') };
}

/** Same seeds as #379 (`chooseSeeds` is deterministic over the snapshot). */
export function scorePlaylist(snapshot, candidates) {
  const members = playlistMates(snapshot);
  const seeds = chooseSeeds(snapshot, members);
  const all = [], noRelease = [];
  for (const { track, index, key } of seeds) {
    const ranking = rank(candidates[index], candidates, index);
    const value = metric(ranking, members.get(key), snapshot.tracks, track.release_id);
    if (value) all.push(value);
    const other = metric(ranking, members.get(key), snapshot.tracks, track.release_id, true);
    if (other) noRelease.push(other);
  }
  return { sample_size: seeds.length, all: aggregate(all), excluding_same_release: aggregate(noRelease) };
}

export function topQueries(snapshot, candidates, queryVectors) {
  return Object.fromEntries(queryVectors.queries.map(({ id, vector }) => [id,
    rank(normalize(vector), candidates).slice(0, 10).map(({ i }) => `${snapshot.tracks[i].friend_id}:${snapshot.tracks[i].track_id}`)]));
}

/** Union of every run's top 10 per query, stably shuffled so no run or rank shows. */
export function blindPools(byRun) {
  const pools = {};
  for (const ranking of Object.values(byRun)) {
    for (const [id, keys] of Object.entries(ranking)) {
      pools[id] ??= new Set();
      for (const key of keys) pools[id].add(key);
    }
  }
  return Object.fromEntries(Object.entries(pools).map(([id, set]) =>
    [id, [...set].sort((a, b) => hashText(`${id}:${a}`).localeCompare(hashText(`${id}:${b}`)))]));
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const runs = args.flatMap((a, i) => (a === '--run' ? [parseRun(args[i + 1])] : []));
  const snapshotFile = option('--snapshot'), textsFile = option('--texts'), outputFile = option('--output');
  const queriesFile = option('--queries') ?? 'evaluations/379/queries.json';
  if (!snapshotFile || !textsFile || !outputFile || !runs.length) {
    throw new Error('Usage: node evaluations/382/score.mjs --snapshot S --texts T --output O --run LABEL:VARIANT:VECTORS_DIR:QUERY_VECTORS [--run ...]');
  }
  const raw = readFileSync(snapshotFile);
  const sha = createHash('sha256').update(raw).digest('hex');
  const snapshot = JSON.parse(raw), texts = JSON.parse(readFileSync(textsFile));
  if (sha !== texts.snapshot_sha256 || snapshot.tracks.length !== texts.rows.length) throw new Error('Snapshot/text mismatch');
  const query_sha256 = createHash('sha256').update(readFileSync(queriesFile)).digest('hex');
  const results = { snapshot_sha256: sha, query_sha256, runs: {}, queries: {} };
  for (const run of runs) {
    const manifest = JSON.parse(readFileSync(join(run.vectorsDir, 'manifest.json')));
    const queryVectors = JSON.parse(readFileSync(run.queryVectors));
    if (manifest.snapshot_sha256 !== sha) throw new Error(`${run.label}: vectors are from another snapshot`);
    if (queryVectors.query_sha256 !== query_sha256 || queryVectors.model !== manifest.model ||
        (queryVectors.dims ?? 1536) !== manifest.dims) throw new Error(`${run.label}: query set/model/dims mismatch`);
    const wanted = new Set(texts.rows.map((r) => hashText(r.text[run.variant])));
    const vectors = await loadVectors(join(run.vectorsDir, 'vectors.ndjson'), manifest.dims, wanted);
    const candidates = candidateVectors(texts.rows, run.variant, vectors);
    results.runs[run.label] = { variant: run.variant, model: manifest.model, dims: manifest.dims,
      distinct_vectors: vectors.size, playlist: scorePlaylist(snapshot, candidates) };
    results.queries[run.label] = topQueries(snapshot, candidates, queryVectors);
    console.error(`Scored ${run.label}`);
  }
  results.blind_pools = blindPools(results.queries);
  writeFileSync(outputFile, JSON.stringify(results), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output: outputFile, runs: Object.fromEntries(Object.entries(results.runs)
    .map(([label, r]) => [label, { variant: r.variant, model: r.model, dims: r.dims, ...r.playlist }])) }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { await main(); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
