#!/usr/bin/env node
/**
 * The #1218 blind review: re-tuned Selector against Selector as it is on
 * `main`, on the #1196 tooling (side-by-side.mjs, review-web.mjs,
 * score-review.mjs) and the same two questions.
 *
 * The seeds come from the **holdout** set (`seeds-holdout.json`), whose lists
 * the owner has never seen: the frozen set's Selector lists were in the #1196
 * review, so they could be recognised. The sample is drawn from the seed
 * keys alone and frozen in `review-seeds.json` (hash in
 * `REVIEW_SEEDS_SHA256`), committed before any re-tuned list was generated.
 *
 *   # once, before any re-tuned list exists
 *   node evaluations/1218/review-pair.mjs freeze
 *   # after both runs: one results file with the two lists per sampled seed
 *   node evaluations/1218/review-pair.mjs pair \
 *     --before eval-data/1218-holdout-before/results.json \
 *     --after eval-data/1218-holdout-after/results.json \
 *     --output eval-data/1218/review-results.json
 *
 * `pair` names the lists `selector-main` and `selector-retuned`, for
 * `side-by-side.mjs --compare selector-main:selector-retuned`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleSeeds } from "../1196/side-by-side.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const HOLDOUT_SEEDS_SHA256 =
  "581c563b50eca6624218871aa870ef399d2f02a5e0e56dd000bb3ad70af474c7";
export const REVIEW_SEEDS_SHA256 =
  "ca98037434d25467c4d58dba27a1390ca67270fb547dc1dccca1518dde3e72f2";
export const RANDOM_SEED = 1218;
export const SAMPLE = 20;
export const BEFORE = "selector-main";
export const AFTER = "selector-retuned";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** A seeds file's keys, as `run.mjs` keys its results. */
export function seedKeys(seeds) {
  return [
    ...seeds.tracks.map((t) => `${t.friend_id}:${t.track_id}`),
    ...seeds.playlists.map((p) => `playlist:${p.playlist_id}`),
  ];
}

/** The frozen review sample: from the holdout keys alone, never from results. */
export function freezeSample(raw, { expected = HOLDOUT_SEEDS_SHA256 } = {}) {
  const hash = sha256(raw);
  if (hash !== expected) throw new Error(`Holdout seeds hash ${hash} is not ${expected}`);
  return {
    kind: "1218-review-seeds",
    schema_version: 1,
    seeds_file: "evaluations/1196/seeds-holdout.json",
    seeds_sha256: hash,
    random_seed: RANDOM_SEED,
    sample: SAMPLE,
    keys: sampleSeeds(seedKeys(JSON.parse(raw)), SAMPLE, RANDOM_SEED),
  };
}

export const serialize = (sample) => JSON.stringify(sample, null, 2) + "\n";

/** The committed sample, refused if it changed. */
export function loadSample(raw, expected = REVIEW_SEEDS_SHA256) {
  const hash = sha256(raw);
  if (expected === null) throw new Error("No frozen review sample: run `freeze` and commit it");
  if (hash !== expected) throw new Error(`Review seeds hash ${hash} is not ${expected}`);
  return JSON.parse(raw);
}

/**
 * One results file for side-by-side.mjs: the sampled seeds only, each with
 * the before run's and the after run's list for `profile`, renamed apart.
 * Both runs must be over the sample's seeds file.
 */
export function pairResults(before, after, sample, profile = "selector") {
  for (const [name, results] of [
    ["before", before],
    ["after", after],
  ]) {
    if (results.seeds_sha256 !== sample.seeds_sha256)
      throw new Error(`The ${name} results are not over the review's seeds file`);
  }
  const byKey = (results) => new Map(results.seeds.map((s) => [s.key, s]));
  const b = byKey(before);
  const a = byKey(after);
  const seeds = sample.keys.map((key) => {
    const old = b.get(key);
    const now = a.get(key);
    if (!old?.lists[profile] || !now?.lists[profile])
      throw new Error(`Seed ${key} has no ${profile} list in both runs`);
    const { lists: _lists, ...rest } = now;
    return { ...rest, lists: { [BEFORE]: old.lists[profile], [AFTER]: now.lists[profile] } };
  });
  return {
    kind: before.kind,
    schema_version: before.schema_version,
    seeds_sha256: sample.seeds_sha256,
    profiles: [BEFORE, AFTER],
    seeds,
  };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const samplePath = join(HERE, "review-seeds.json");
  if (command === "freeze") {
    const raw = readFileSync(join(HERE, "../1196/seeds-holdout.json"), "utf8");
    const text = serialize(freezeSample(raw));
    writeFileSync(samplePath, text, { flag: "wx" });
    console.log(JSON.stringify({ written: samplePath, sha256: sha256(text) }));
    return;
  }
  if (command === "pair") {
    const sample = loadSample(readFileSync(samplePath, "utf8"));
    const read = (name) => JSON.parse(readFileSync(opt(name), "utf8"));
    const paired = pairResults(read("--before"), read("--after"), sample, opt("--profile"));
    writeFileSync(opt("--output"), JSON.stringify(paired) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ seeds: paired.seeds.length, compare: `${BEFORE}:${AFTER}` }));
    return;
  }
  throw new Error("Usage: review-pair.mjs freeze | pair --before F --after F --output F");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
