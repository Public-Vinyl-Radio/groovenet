#!/usr/bin/env node
/**
 * Playlist proxy and query top 10s for #1170 runs. Reuses #382's run format,
 * vector loading, ranking and blind pools. Seeds are stratified by lyrics, and
 * every proxy metric is reported for seeds with and without lyrics, because a
 * lyric line only changes the text of tracks that have lyrics.
 *
 *   node evaluations/1170/score.mjs --snapshot S --texts T --output O \
 *     --run I0:I0:eval-data/1170-small:eval-data/1170-query-vectors.json [--run ...]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashText } from "../379/embed.mjs";
import { metric, playlistMates, rank } from "../379/score.mjs";
import { blindPools, candidateVectors, loadVectors, parseRun, topQueries } from "../382/score.mjs";

/** Deterministic, like #379's `chooseSeeds`, but split on lyrics instead of notes. */
export function chooseSeeds(snapshot, mates, hasLyrics, perStratum = 100) {
  const eligible = snapshot.tracks
    .map((track, index) => ({ track, index, key: `${track.friend_id}:${track.track_id}` }))
    .filter(({ key }) => mates.get(key)?.size)
    .sort((a, b) => hashText(a.key).localeCompare(hashText(b.key)));
  return [
    ...eligible.filter(({ index }) => hasLyrics[index]).slice(0, perStratum),
    ...eligible.filter(({ index }) => !hasLyrics[index]).slice(0, perStratum),
  ];
}

function aggregate(samples) {
  if (!samples.length) return { seeds: 0, recall10: null, mrr: null };
  const mean = (key) => samples.reduce((s, x) => s + x[key], 0) / samples.length;
  return { seeds: samples.length, recall10: mean("recall10"), mrr: mean("reciprocal_rank") };
}

export function scorePlaylist(snapshot, candidates, hasLyrics, perStratum = 100) {
  const members = playlistMates(snapshot);
  const seeds = chooseSeeds(snapshot, members, hasLyrics, perStratum);
  const buckets = {};
  const add = (name, value) => value && (buckets[name] ??= []).push(value);
  const perSeed = [];
  for (const { track, index, key } of seeds) {
    const ranking = rank(candidates[index], candidates, index);
    const stratum = hasLyrics[index] ? "with_lyrics" : "without_lyrics";
    const all = metric(ranking, members.get(key), snapshot.tracks, track.release_id);
    const other = metric(ranking, members.get(key), snapshot.tracks, track.release_id, true);
    add("all", all);
    add(stratum, all);
    add("excluding_same_release", other);
    add(`${stratum}_excluding_same_release`, other);
    perSeed.push({
      key,
      stratum,
      rr: all?.reciprocal_rank ?? null,
      rr_other: other?.reciprocal_rank ?? null,
    });
  }
  const names = [
    "all",
    "with_lyrics",
    "without_lyrics",
    "excluding_same_release",
    "with_lyrics_excluding_same_release",
    "without_lyrics_excluding_same_release",
  ];
  return {
    sample_size: seeds.length,
    ...Object.fromEntries(names.map((n) => [n, aggregate(buckets[n] ?? [])])),
    per_seed: perSeed,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const runs = args.flatMap((a, i) => (a === "--run" ? [parseRun(args[i + 1])] : []));
  const queriesFile = option("--queries") ?? "evaluations/379/queries.json";
  if (!option("--snapshot") || !option("--texts") || !option("--output") || !runs.length)
    throw new Error(
      "Usage: node evaluations/1170/score.mjs --snapshot S --texts T --output O --run LABEL:VARIANT:VECTORS_DIR:QUERY_VECTORS [--run ...]",
    );
  const raw = readFileSync(option("--snapshot"));
  const sha = createHash("sha256").update(raw).digest("hex");
  const snapshot = JSON.parse(raw);
  const texts = JSON.parse(readFileSync(option("--texts")));
  if (sha !== texts.snapshot_sha256 || snapshot.tracks.length !== texts.rows.length)
    throw new Error("Snapshot/text mismatch");
  const hasLyrics = texts.rows.map((r, i) => {
    if (r.track_id !== snapshot.tracks[i].track_id) throw new Error("Snapshot/text order mismatch");
    return r.has_summary;
  });
  const query_sha256 = createHash("sha256").update(readFileSync(queriesFile)).digest("hex");
  const results = {
    snapshot_sha256: sha,
    query_sha256,
    lyric_keys: texts.rows.filter((r) => r.has_summary).map((r) => `${r.friend_id}:${r.track_id}`),
    runs: {},
    queries: {},
  };
  for (const run of runs) {
    const manifest = JSON.parse(readFileSync(join(run.vectorsDir, "manifest.json")));
    const queryVectors = JSON.parse(readFileSync(run.queryVectors));
    if (manifest.snapshot_sha256 !== sha)
      throw new Error(`${run.label}: vectors are from another snapshot`);
    if (queryVectors.query_sha256 !== query_sha256 || queryVectors.model !== manifest.model)
      throw new Error(`${run.label}: query set/model mismatch`);
    const wanted = new Set(texts.rows.map((r) => hashText(r.text[run.variant])));
    const vectors = await loadVectors(
      join(run.vectorsDir, "vectors.ndjson"),
      manifest.dims,
      wanted,
    );
    const candidates = candidateVectors(texts.rows, run.variant, vectors);
    results.runs[run.label] = {
      variant: run.variant,
      model: manifest.model,
      dims: manifest.dims,
      distinct_vectors: vectors.size,
      playlist: scorePlaylist(snapshot, candidates, hasLyrics),
    };
    results.queries[run.label] = topQueries(snapshot, candidates, queryVectors);
    console.error(`Scored ${run.label}`);
  }
  results.blind_pools = blindPools(results.queries);
  writeFileSync(option("--output"), JSON.stringify(results), { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(results.runs).map(([label, r]) => {
          const { per_seed: _seeds, ...playlist } = r.playlist;
          return [label, playlist];
        }),
      ),
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
