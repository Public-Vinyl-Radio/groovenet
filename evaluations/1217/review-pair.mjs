#!/usr/bin/env node
/**
 * The #1217 blind review: Beatmatcher with a genre pull against Beatmatcher
 * as it is on `main`, on the #1196 tooling (side-by-side.mjs, review-web.mjs,
 * score-review.mjs) and the same two questions.
 *
 * **Seeds no earlier round showed.** #1196's review showed 20 frozen seeds
 * (Beatmatcher's and Selector's lists), and #1218's two rounds showed every
 * holdout seed (Selector's). What is left is the frozen seeds outside
 * #1196's sample: every one of them, so the sample is fixed by that rule and
 * can't be chosen on results. `freeze` writes them, shuffled from the seed
 * keys alone, to `review-seeds.json` (hash in `REVIEW_SEEDS_SHA256`), to be
 * committed before the review lists are generated.
 *
 *   # once, before the review lists exist
 *   node evaluations/1217/review-pair.mjs freeze
 *   # one results file with both lists per sampled seed
 *   node evaluations/1217/review-pair.mjs pair \
 *     --before eval-data/1217-base/results.json --before-profile beatmatcher \
 *     --after eval-data/1217-review/results.json --after-profile bm-g09-e03-n05 \
 *     --output eval-data/1217-review/review-results.json
 *
 * `pair` names the lists `beatmatcher-main` and `beatmatcher-genre`, for
 * `side-by-side.mjs --compare beatmatcher-main:beatmatcher-genre`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sampleSeeds } from "../1196/side-by-side.mjs";
import { SEEDS_SHA256 } from "../1196/seeds.mjs";
import { seedKeys } from "../1218/review-pair.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
/** #1196's review: 20 of the frozen seeds, drawn by `sampleSeeds` with its random seed. */
export const SHOWN_1196 = { sample: 20, random_seed: 1196 };
export const RANDOM_SEED = 1217;
export const REVIEW_SEEDS_SHA256 =
  "0fc28415fa3ee9fecd18b01ecb30b48a7c903b8376225788957cbbcf0f2d8273";
export const BEFORE = "beatmatcher-main";
export const AFTER = "beatmatcher-genre";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** The frozen seeds #1196's review didn't show, in a shuffled order from the keys alone. */
export function freezeSample(raw, { expected = SEEDS_SHA256 } = {}) {
  const hash = sha256(raw);
  if (hash !== expected) throw new Error(`Frozen seeds hash ${hash} is not ${expected}`);
  const keys = seedKeys(JSON.parse(raw));
  const shown = new Set(sampleSeeds(keys, SHOWN_1196.sample, SHOWN_1196.random_seed));
  const rest = keys.filter((key) => !shown.has(key));
  return {
    kind: "1217-review-seeds",
    schema_version: 1,
    seeds_file: "evaluations/1196/seeds.json",
    seeds_sha256: hash,
    excludes: { review: "#1196", ...SHOWN_1196 },
    random_seed: RANDOM_SEED,
    sample: rest.length,
    keys: sampleSeeds(rest, rest.length, RANDOM_SEED),
  };
}

export const serialize = (sample) => JSON.stringify(sample, null, 2) + "\n";

/** The committed sample, refused if it changed or was never frozen. */
export function loadSample(raw, expected = REVIEW_SEEDS_SHA256) {
  if (expected === null) throw new Error("No frozen review sample: run `freeze` and commit it");
  const hash = sha256(raw);
  if (hash !== expected) throw new Error(`Review seeds hash ${hash} is not ${expected}`);
  return JSON.parse(raw);
}

/**
 * One results file for side-by-side.mjs: the sampled seeds only, each with
 * the before run's `beforeProfile` list and the after run's `afterProfile`
 * list, renamed apart. Both runs must be over the sample's seeds file.
 */
export function pairResults(before, after, sample, { beforeProfile, afterProfile }) {
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
    const old = b.get(key)?.lists[beforeProfile];
    const now = a.get(key)?.lists[afterProfile];
    if (!old) throw new Error(`Seed ${key} has no ${beforeProfile} list in the before run`);
    if (!now) throw new Error(`Seed ${key} has no ${afterProfile} list in the after run`);
    const { lists: _lists, ...rest } = a.get(key);
    return { ...rest, lists: { [BEFORE]: old, [AFTER]: now } };
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
    const raw = readFileSync(join(HERE, "../1196/seeds.json"), "utf8");
    const text = serialize(freezeSample(raw));
    writeFileSync(samplePath, text, { flag: "wx" });
    console.log(JSON.stringify({ written: samplePath, sha256: sha256(text) }));
    return;
  }
  if (command === "pair") {
    const sample = loadSample(readFileSync(samplePath, "utf8"));
    const read = (flag) => JSON.parse(readFileSync(opt(flag), "utf8"));
    const paired = pairResults(read("--before"), read("--after"), sample, {
      beforeProfile: opt("--before-profile", "beatmatcher"),
      afterProfile: opt("--after-profile", "beatmatcher"),
    });
    writeFileSync(opt("--output"), JSON.stringify(paired) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ seeds: paired.seeds.length, compare: `${BEFORE}:${AFTER}` }));
    return;
  }
  throw new Error(
    "Usage: review-pair.mjs freeze | pair --before F --after F --output F [--before-profile P] [--after-profile P]",
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
