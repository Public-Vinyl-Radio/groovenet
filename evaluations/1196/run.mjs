#!/usr/bin/env node
/**
 * Runs every profile for every frozen seed through the worktree stack's API
 * (#1196) and saves what came back. No paid calls: it reads existing
 * embeddings only.
 *
 * Lists: `POST /api/recommendations/candidates` with `breakdown`, one request
 * per seed and profile (a preset or built-in id as `ranker`, or a whole
 * `ranking_config` from `--config name=file.json`). A track seed is a batch of
 * one; a playlist seed is its tracks, scored against the last. Every profile
 * re-ranks the same retrieved pool. The top 10 is taken as the Suggestions
 * panel takes it (`topPicks`).
 *
 * Similarity of each pick to its seed is exact cosine on the serving vibe and
 * identity embeddings, read from this worktree's database, because the
 * retriever leaves a candidate's similarity null when it came from only the
 * other index.
 *
 * Orderings: each playlist seed's own tracks that have a BPM and a vibe
 * vector, as `/api/tracks/batch` returns them to the playlist page, ordered
 * by `POST /api/playlists/genetic` with each profile as `ranking`. Needs the
 * `optimize` stack profile. That route takes only a stored profile's id, so an
 * inline config is stored as a temporary profile in this worktree's library
 * for the ordering runs and deleted afterwards.
 *
 *   node evaluations/1196/run.mjs [--out-dir eval-data/1196] [--seeds evaluations/1196/seeds.json
 *     --seeds-sha256 HASH]
 *     [--profiles default,beatmatcher,...] [--config name=file.json ...]
 *     [--modes greedy,genetic,cohesive_blocks] [--genetic-runs 3] [--no-ordering]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { calculateEnergy, computeEraBucket } from "./app-modules.mjs";
import { rankingConfigFor } from "./configs.mjs";
import { topPicks, trackKey } from "./metrics.mjs";
import { loadSeeds, SEEDS_SHA256 } from "./seeds.mjs";
import { api, assertLocalUrl, psqlJson, worktreeEnv } from "./stack.mjs";

export const PROFILES = ["default", "beatmatcher", "selector", "blend", "mixable", "strict"];
export const MODES = ["greedy", "genetic", "cohesive_blocks"];

/** The body that scores one seed with one profile. */
export function candidatesBody(seedTracks, profile, libraryFriendId) {
  return {
    tracks: seedTracks.map(({ track_id, friend_id }) => ({ track_id, friend_id })),
    breakdown: true,
    scope: "library",
    library_friend_id: libraryFriendId,
    ...(profile.config ? { ranking_config: profile.config } : { ranker: profile.id }),
  };
}

/** Exact cosine of each (seed, pick) pair on the serving embeddings; one statement. */
export function similaritySql(pairs) {
  if (!pairs.length) return "SELECT '{}'::json";
  const lit = (s) => `'${String(s).replaceAll("'", "''")}'`;
  const values = pairs
    .map(
      ([s, p]) =>
        `(${lit(s.track_id)}, ${Number(s.friend_id)}, ${lit(p.track_id)}, ${Number(p.friend_id)})`,
    )
    .join(",\n");
  return `
WITH pairs(st, sf, pt, pf) AS (VALUES ${values}),
serving AS (SELECT embedding_type, serving_model, serving_template_version FROM embedding_model_settings),
e AS (
  SELECT x.track_id, x.friend_id, x.embedding_type, x.embedding FROM track_embeddings x
  JOIN serving s ON s.embedding_type = x.embedding_type AND s.serving_model = x.model
    AND s.serving_template_version = x.template_version
  WHERE x.embedding_type IN ('identity', 'audio_vibe')
)
SELECT coalesce(json_object_agg(sf || ':' || st || '|' || pf || ':' || pt, json_build_object(
  'vibe', (SELECT 1 - (a.embedding <=> b.embedding) FROM e a, e b
    WHERE a.track_id = st AND a.friend_id = sf AND a.embedding_type = 'audio_vibe'
      AND b.track_id = pt AND b.friend_id = pf AND b.embedding_type = 'audio_vibe'),
  'identity', (SELECT 1 - (a.embedding <=> b.embedding) FROM e a, e b
    WHERE a.track_id = st AND a.friend_id = sf AND a.embedding_type = 'identity'
      AND b.track_id = pt AND b.friend_id = pf AND b.embedding_type = 'identity'))), '{}')
FROM (SELECT DISTINCT * FROM pairs) d`;
}

const finiteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * The seed's fields the metrics and the review sheet read. Its era bucket
 * and energy are the ranker's own features (`computeEraBucket`,
 * `calculateEnergy`), as `buildCandidateMetadata` gives a candidate's.
 */
export function seedOf(track) {
  const year = track.year ?? null;
  return {
    track_id: track.track_id,
    friend_id: track.friend_id,
    title: track.title ?? "",
    artist: track.artist ?? "",
    album: track.album ?? "",
    year,
    era: year === null ? null : computeEraBucket(String(year)),
    styles: track.styles ?? [],
    bpm: track.bpm ?? null,
    key: track.key ?? null,
    energy: calculateEnergy(finiteOrNull(track.danceability), finiteOrNull(track.mood_aggressive)),
  };
}

/** An inline config as a profile draft the optimiser route can name; temporary. */
export function profileDraft(profile) {
  const { weights, base, usePrior, constraints } = profile.config;
  return {
    version: profile.config.version,
    name: `eval-1196 ${profile.id}`.slice(0, 80),
    description: "Temporary #1196 evaluation profile; deleted after the run.",
    surfaces: ["playlists"],
    weights,
    ...(base ? { base } : {}),
    usePrior,
    constraints,
  };
}

/** The tracks the optimiser can order: a BPM and a vibe vector, in playlist order. */
export function orderingPool(tracks) {
  return tracks.filter((t) => Number(t.bpm) > 0 && Array.isArray(t._vectors?.default));
}

function parseArgs(argv) {
  const opt = (name, fallback) => {
    const i = argv.indexOf(name);
    return i < 0 ? fallback : argv[i + 1];
  };
  return {
    outDir: opt("--out-dir", "eval-data/1196"),
    seeds: opt("--seeds", "evaluations/1196/seeds.json"),
    // A holdout set (seeds.mjs --random-seed) is checked against its own hash.
    seedsSha256: opt("--seeds-sha256", SEEDS_SHA256),
    profiles: opt("--profiles", PROFILES.join(",")).split(",").filter(Boolean),
    configs: argv.flatMap((a, i) => (a === "--config" ? [argv[i + 1]] : [])),
    modes: opt("--modes", MODES.join(",")).split(",").filter(Boolean),
    geneticRuns: Number(opt("--genetic-runs", "3")),
    ordering: !argv.includes("--no-ordering"),
    base: opt("--base"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const env = worktreeEnv(root);
  const base = assertLocalUrl(args.base ?? env.appUrl);
  const seeds = loadSeeds(args.seeds, args.seedsSha256);
  const friend = seeds.rule.friend_id;
  mkdirSync(join(args.outDir, "raw"), { recursive: true, mode: 0o700 });

  const listed = (await api(base, `/api/ranking/profiles?friend_id=${friend}`)).profiles;
  const profiles = [
    ...args.profiles.map((id) => {
      const found = listed.find((p) => p.id === id);
      return {
        id,
        half_double: !!found?.constraints?.bpm_window?.half_double,
        source: found ? "preset" : "builtin",
      };
    }),
    ...args.configs.map((spec) => {
      const [id, file] = spec.split("=");
      const config = rankingConfigFor(JSON.parse(readFileSync(file, "utf8")), id);
      return {
        id,
        half_double: !!config.constraints?.bpm_window?.half_double,
        source: "config",
        config,
      };
    }),
  ];

  const playlistsById = new Map((await api(base, "/api/playlists")).map((p) => [p.id, p]));
  const seedList = [
    ...seeds.tracks.map((t) => ({
      key: trackKey(t),
      kind: "track",
      stratum: t.stratum,
      tracks: [t],
    })),
    ...seeds.playlists.map((p) => {
      const pl = playlistsById.get(p.playlist_id);
      if (!pl) throw new Error(`Playlist ${p.playlist_id} is not on this stack`);
      const tracks = [...pl.tracks]
        .sort((a, b) => a.position - b.position)
        .map(({ track_id, friend_id }) => ({ track_id, friend_id }));
      return {
        key: `playlist:${p.playlist_id}`,
        kind: "playlist",
        name: pl.name,
        size: tracks.length,
        tracks,
      };
    }),
  ];

  // Full tracks for every seed track: their BPM and key, and the playlists' optimiser input.
  const allSeedTracks = [
    ...new Map(seedList.flatMap((s) => s.tracks).map((t) => [trackKey(t), t])).values(),
  ];
  const full = new Map(
    (await api(base, "/api/tracks/batch", { tracks: allSeedTracks, include_vectors: true })).map(
      (t) => [trackKey(t), t],
    ),
  );

  const results = {
    kind: "1196-results",
    schema_version: 1,
    seeds_sha256: args.seedsSha256,
    generated_at: new Date().toISOString(),
    profiles: profiles.map(({ id, half_double, source }) => ({ id, half_double, source })),
    seeds: [],
    sims: {},
    orderings: [],
    tracks: {},
  };
  const configs = Object.fromEntries(profiles.filter((p) => p.config).map((p) => [p.id, p.config]));

  const pairs = [];
  for (const s of seedList) {
    const last = full.get(trackKey(s.tracks.at(-1))) ?? {};
    const row = {
      key: s.key,
      kind: s.kind,
      ...(s.stratum ? { stratum: s.stratum } : {}),
      ...(s.kind === "playlist" ? { name: s.name, size: s.size } : {}),
      seed: seedOf(last),
      lists: {},
    };
    for (const profile of profiles) {
      const response = await api(
        base,
        "/api/recommendations/candidates",
        candidatesBody(s.tracks, profile, friend),
      );
      const name = `${profile.id}--${s.key.replaceAll(":", "_")}.json.gz`;
      writeFileSync(join(args.outDir, "raw", name), gzipSync(JSON.stringify(response)), {
        mode: 0o600,
      });
      row.lists[profile.id] = topPicks(response.candidates, { exclude: s.tracks });
      for (const p of row.lists[profile.id].picks) pairs.push([row.seed, p]);
    }
    results.seeds.push(row);
    process.stderr.write(`lists ${results.seeds.length}/${seedList.length}\r`);
  }
  process.stderr.write("\n");
  results.sims = psqlJson(env.project, similaritySql(pairs)) ?? {};

  const vectors = {};
  // Inline configs, stored for the optimiser route to name, and always removed.
  const stored = new Map();
  try {
    if (args.ordering)
      for (const profile of profiles.filter((p) => p.config)) {
        const created = await api(base, "/api/ranking/profiles", {
          friend_id: friend,
          profile: profileDraft(profile),
        });
        stored.set(profile.id, created.id);
      }
    if (args.ordering) await runOrderings();
  } finally {
    for (const id of stored.values())
      await api(base, `/api/ranking/profiles/${id}`, undefined, { method: "DELETE" });
  }

  async function runOrderings() {
    for (const s of seedList.filter((x) => x.kind === "playlist")) {
      const pool = orderingPool(s.tracks.map((t) => full.get(trackKey(t))).filter(Boolean));
      const body = pool.map(({ _vectors, ...t }) => t);
      for (const t of pool) {
        vectors[trackKey(t)] = t._vectors.default;
        results.tracks[trackKey(t)] = { bpm: t.bpm, key: t.key };
      }
      const runs = {};
      for (const profile of profiles) {
        const ref = profile.config ? stored.get(profile.id) : profile.id;
        runs[profile.id] = {};
        for (const mode of args.modes) {
          const times = mode === "genetic" ? args.geneticRuns : 1;
          runs[profile.id][mode] = [];
          for (let i = 0; i < times; i++) {
            const res = await api(base, "/api/playlists/genetic", {
              playlist: body,
              mode,
              friend_id: friend,
              ranking: ref,
            });
            const order = (Array.isArray(res.result) ? res.result : Object.values(res.result)).map(
              trackKey,
            );
            if (res.ranking && res.ranking.id !== ref)
              throw new Error(`${profile.id} ordered as ${res.ranking.id}`);
            runs[profile.id][mode].push(order);
          }
        }
      }
      results.orderings.push({ playlist: s.key, pool: pool.length, of: s.tracks.length, runs });
      process.stderr.write(`ordered ${s.key}\n`);
    }
  }

  const write = (name, value) =>
    writeFileSync(join(args.outDir, name), JSON.stringify(value) + "\n", { mode: 0o600 });
  write("results.json", { ...results, configs });
  write("vectors.json", vectors);
  console.log(
    JSON.stringify({
      seeds: results.seeds.length,
      profiles: profiles.map((p) => p.id),
      pairs: Object.keys(results.sims).length,
      orderings: results.orderings.length,
      results_sha256: createHash("sha256")
        .update(readFileSync(join(args.outDir, "results.json")))
        .digest("hex"),
    }),
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
