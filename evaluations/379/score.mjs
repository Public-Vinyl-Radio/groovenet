#!/usr/bin/env node
/** Deterministic offline playlist proxy and blinded query-pool preparation. */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { hashText } from './embed.mjs';

export async function loadVectors(file) {
  const vectors = new Map();
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (!line) continue;
    const { hash, vector } = JSON.parse(line);
    if (!hash || vector?.length !== 1536) throw new Error('Invalid cached vector');
    const values = Float32Array.from(vector);
    const norm = Math.hypot(...values);
    if (!Number.isFinite(norm) || norm === 0) throw new Error('Invalid cached vector norm');
    for (let i = 0; i < values.length; i++) values[i] /= norm;
    vectors.set(hash, values);
  }
  return vectors;
}

export function dot(a, b) {
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i] * b[i];
  return score;
}

export function rank(queryVector, candidateVectors, excluded = -1) {
  return candidateVectors.map((v, i) => i === excluded ? { i, score: -Infinity } : { i, score: dot(queryVector, v) })
    .filter((r) => r.i !== excluded)
    .sort((a, b) => b.score - a.score || a.i - b.i);
}

export function playlistMates(snapshot) {
  const members = new Map();
  const keys = new Set(snapshot.tracks.map((t) => `${t.friend_id}:${t.track_id}`));
  for (const playlist of snapshot.playlists) {
    const ids = [...new Set(playlist.tracks.map((t) => `${t.friend_id}:${t.track_id}`).filter((id) => keys.has(id)))];
    for (const id of ids) {
      if (!members.has(id)) members.set(id, new Set());
      for (const mate of ids) if (mate !== id) members.get(id).add(mate);
    }
  }
  return members;
}

export function chooseSeeds(snapshot, mates, maxWithNotes = 100, maxWithoutNotes = 30) {
  const eligible = snapshot.tracks.map((track, index) => ({ track, index, key: `${track.friend_id}:${track.track_id}` }))
    .filter(({ key }) => mates.get(key)?.size)
    .sort((a, b) => hashText(a.key).localeCompare(hashText(b.key)));
  return [
    ...eligible.filter(({ track }) => !!track.notes?.trim()).slice(0, maxWithNotes),
    ...eligible.filter(({ track }) => !track.notes?.trim()).slice(0, maxWithoutNotes),
  ];
}

export function metric(ranking, mateIds, tracks, seedRelease, excludeSameRelease = false) {
  const eligible = ranking.filter(({ i }) => !excludeSameRelease || tracks[i].release_id !== seedRelease);
  const relevant = new Set([...mateIds].filter((id) => tracks.some((t) => `${t.friend_id}:${t.track_id}` === id && (!excludeSameRelease || t.release_id !== seedRelease))));
  if (!relevant.size) return null;
  const top = eligible.slice(0, 10);
  const hits = top.filter(({ i }) => relevant.has(`${tracks[i].friend_id}:${tracks[i].track_id}`)).length;
  const first = eligible.findIndex(({ i }) => relevant.has(`${tracks[i].friend_id}:${tracks[i].track_id}`));
  return { recall10: hits / relevant.size, reciprocal_rank: first < 0 ? 0 : 1 / (first + 1), hits10: hits };
}

function aggregate(samples) {
  if (!samples.length) return { seeds: 0, recall10: null, mrr: null, hits10: null };
  return { seeds: samples.length, recall10: samples.reduce((s, x) => s + x.recall10, 0) / samples.length,
    mrr: samples.reduce((s, x) => s + x.reciprocal_rank, 0) / samples.length,
    hits10: samples.reduce((s, x) => s + x.hits10, 0) / samples.length };
}

export function scorePlaylists(snapshot, rows, vectors, maxWithNotes = 100, maxWithoutNotes = 30) {
  const members = playlistMates(snapshot);
  const seeds = chooseSeeds(snapshot, members, maxWithNotes, maxWithoutNotes);
  const result = {};
  for (const variant of ['A', 'B', 'C']) {
    const candidateVectors = rows.map((r) => {
      const v = vectors.get(hashText(r.text[variant]));
      if (!v) throw new Error(`Missing ${variant} vector for ${r.track_id}`);
      return v;
    });
    const all = [], noAlbum = [], withNotes = [], withoutNotes = [];
    const spotchecks = [];
    for (const { track, index, key } of seeds) {
      const ranking = rank(candidateVectors[index], candidateVectors, index);
      const value = metric(ranking, members.get(key), snapshot.tracks, track.release_id);
      if (value) {
        all.push(value);
        (track.notes?.trim() ? withNotes : withoutNotes).push(value);
      }
      const other = metric(ranking, members.get(key), snapshot.tracks, track.release_id, true);
      if (other) noAlbum.push(other);
      if (spotchecks.length < 20) spotchecks.push({ seed: key, neighbors: ranking.slice(0, 10).map(({ i }) => ({ track_id: snapshot.tracks[i].track_id, friend_id: snapshot.tracks[i].friend_id })) });
    }
    result[variant] = { all: aggregate(all), with_notes: aggregate(withNotes), without_notes: aggregate(withoutNotes), excluding_same_release: aggregate(noAlbum), spotchecks };
  }
  return { eligible_seeds: [...members.values()].filter((m) => m.size).length,
    sample_size: seeds.length, seed_ids: seeds.map((s) => s.key), variants: result };
}

export function scoreQueries(snapshot, rows, vectors, queryVectors) {
  const results = {};
  for (const { id, vector } of queryVectors.queries) {
    const norm = Math.hypot(...vector);
    if (!norm || vector.length !== 1536) throw new Error(`Invalid query vector ${id}`);
    const qv = Float32Array.from(vector, (v) => v / norm);
    const byVariant = {};
    for (const variant of ['A', 'B', 'C']) {
      const candidates = rows.map((r) => vectors.get(hashText(r.text[variant])));
      if (candidates.some((v) => !v)) throw new Error(`Missing ${variant} vectors`);
      byVariant[variant] = rank(qv, candidates).slice(0, 10).map(({ i }) => `${snapshot.tracks[i].friend_id}:${snapshot.tracks[i].track_id}`);
    }
    const pool = [...new Set(Object.values(byVariant).flat())];
    // Stable shuffle per query, no variant/rank/score disclosed to the judge.
    pool.sort((a, b) => hashText(`${id}:${a}`).localeCompare(hashText(`${id}:${b}`)));
    results[id] = { by_variant: byVariant, blind_pool: pool };
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const snapshotFile = option('--snapshot'), textsFile = option('--texts'), vectorsDir = option('--vectors-dir'), outputFile = option('--output');
  if (!snapshotFile || !textsFile || !vectorsDir || !outputFile) throw new Error('Usage: node evaluations/379/score.mjs --snapshot eval-data/379-friend-6.json --texts eval-data/379-texts.json --vectors-dir eval-data/379-vectors --output eval-data/379-scores.json [--query-vectors eval-data/379-query-vectors.json]');
  const raw = readFileSync(snapshotFile);
  const sha = createHash('sha256').update(raw).digest('hex');
  const snapshot = JSON.parse(raw), texts = JSON.parse(readFileSync(textsFile));
  const manifest = JSON.parse(readFileSync(join(vectorsDir, 'manifest.json')));
  if (sha !== texts.snapshot_sha256 || sha !== manifest.snapshot_sha256 || snapshot.tracks.length !== texts.rows.length) throw new Error('Snapshot/text/vector manifest mismatch');
  const vectors = await loadVectors(join(vectorsDir, 'vectors.ndjson'));
  const results = { snapshot_sha256: sha, vector_input_sha256: manifest.input_sha256, vectors: vectors.size,
    playlist: scorePlaylists(snapshot, texts.rows, vectors) };
  const queryFile = option('--query-vectors');
  if (queryFile) {
    const queries = JSON.parse(readFileSync(queryFile));
    const approved = readFileSync('evaluations/379/queries.json');
    if (queries.query_sha256 !== createHash('sha256').update(approved).digest('hex') || queries.model !== manifest.model) throw new Error('Query set/model mismatch');
    results.query_sha256 = queries.query_sha256;
    results.queries = scoreQueries(snapshot, texts.rows, vectors, queries);
  }
  writeFileSync(outputFile, JSON.stringify(results), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output: outputFile, vectors: vectors.size, playlist: Object.fromEntries(Object.entries(results.playlist.variants).map(([v, values]) => [v, { ...values.all, excluding_same_release: values.excluding_same_release, without_notes: values.without_notes }])), query_count: Object.keys(results.queries ?? {}).length }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { await main(); } catch (err) { console.error(err.message); process.exitCode = 1; }
}
