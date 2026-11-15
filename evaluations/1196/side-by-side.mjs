#!/usr/bin/env node
/**
 * Blind side-by-side of two profiles' top 10s for #1196 (Beatmatcher against
 * Selector by default), adapted from #1170's. For a seeded sample of seeds,
 * chosen from the frozen seed keys alone (never from the results), the two
 * lists are shown as A and B in seeded random order, and the collection
 * owner answers two questions per seed:
 *
 *  - mix: which would you mix from this track?
 *  - set: which makes the more interesting set?
 *
 * The sheet holds what a DJ sees on a suggestion row (title, artist, album,
 * year, styles, BPM, key) and nothing that names or scores a profile. Which
 * list is which lives in a separate key file the judge does not open. Seeds
 * whose two lists hold the same tracks are ties recorded in the key and
 * never shown.
 *
 *   node evaluations/1196/side-by-side.mjs --results eval-data/1196/results.json \
 *     --output eval-data/1196/review.json --key eval-data/1196/review-key.json \
 *     [--compare beatmatcher:selector] [--sample 20]
 *   node evaluations/1196/side-by-side.mjs --upgrade    # add track ids to an older sheet, keeping answers
 */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { rng } from "../1170/score-judgments.mjs";
import { signTest } from "../1170/side-by-side.mjs";
import { trackKey } from "./metrics.mjs";

export const KIND = "1196-side-by-side";
export const QUESTIONS = {
  mix: "Which would you mix from this track?",
  set: "Which makes the more interesting set?",
};
export const VERDICTS = ["a", "b", "same"];

/** A seeded sample of seed keys, sorted first so it depends on the keys only. */
export function sampleSeeds(keys, n, randomSeed = 1196) {
  const random = rng(randomSeed);
  const out = [...keys].sort();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

/**
 * Only what a suggestion row shows, plus the track's id so the web reviewer
 * can load its cover and audio: never a score, a signal or a profile.
 */
export function describe(t) {
  return {
    track_id: t.track_id ?? null,
    friend_id: t.friend_id ?? null,
    title: t.title ?? "",
    artist: t.artist ?? "",
    album: t.album ?? "",
    year: t.year ?? null,
    styles: (t.styles ?? []).slice(0, 3),
    bpm: typeof t.bpm === "number" ? Math.round(t.bpm) : null,
    key: t.key ?? null,
  };
}

export function buildSideBySide(
  results,
  { a = "beatmatcher", b = "selector", sample = 20, randomSeed = 1196 } = {},
) {
  const random = rng(randomSeed + 1);
  const bySeed = new Map(results.seeds.map((s) => [s.key, s]));
  const chosen = sampleSeeds([...bySeed.keys()], sample, randomSeed);
  const key = {
    kind: `${KIND}-key`,
    compare: [a, b],
    seeds_sha256: results.seeds_sha256,
    items: {},
    auto_ties: [],
  };
  const items = [];
  for (const seedKey of chosen) {
    const s = bySeed.get(seedKey);
    const first = s.lists[a]?.picks ?? [];
    const second = s.lists[b]?.picks ?? [];
    const ids = (list) => list.map(trackKey);
    const shared = new Set(ids(first).filter((k) => ids(second).includes(k)));
    if (shared.size === first.length && first.length === second.length) {
      key.auto_ties.push(seedKey);
      continue;
    }
    const aIsFirst = random() < 0.5;
    const [la, lb] = aIsFirst ? [first, second] : [second, first];
    const show = (list) => list.map((t) => ({ ...describe(t), in_both: shared.has(trackKey(t)) }));
    items.push({
      id: null,
      seed: {
        ...(s.kind === "playlist" ? { playlist: s.name ?? "", tracks: s.size ?? null } : {}),
        ...describe(s.seed),
      },
      a: show(la),
      b: show(lb),
      mix: null,
      set: null,
      note: "",
      _key: { seed: seedKey, a: aIsFirst ? a : b },
    });
  }
  // Shuffle so the order gives nothing away either.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.forEach((item, i) => {
    item.id = `s${String(i + 1).padStart(3, "0")}`;
    key.items[item.id] = item._key;
    delete item._key;
  });
  return {
    sheet: { kind: KIND, schema_version: 1, questions: QUESTIONS, items },
    key,
  };
}

/** Replace a sheet with a private atomic rename. */
export function save(file, sheet) {
  if (sheet?.kind !== KIND) throw new Error("Not a #1196 side-by-side sheet");
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(sheet, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(tmp, file);
}

/** Unblind a completed (or partly completed) sheet. */
export function tallySideBySide(sheet, key) {
  if (sheet?.kind !== KIND || key?.kind !== `${KIND}-key`)
    throw new Error("Not a #1196 side-by-side sheet and key");
  const [a, b] = key.compare;
  const out = {};
  for (const q of Object.keys(QUESTIONS)) {
    const row = { [a]: 0, [b]: 0, same: 0, auto_tie: key.auto_ties.length, unreviewed: 0 };
    for (const item of sheet.items) {
      const k = key.items[item.id];
      if (!k) throw new Error(`Item ${item.id} is not in the key`);
      const v = item[q];
      if (v == null) row.unreviewed++;
      else if (!VERDICTS.includes(v)) throw new Error(`Invalid ${q} verdict for ${item.id}`);
      else if (v === "same") row.same++;
      else row[(v === "a") === (k.a === a) ? a : b]++;
    }
    row.sign_test_p = signTest(row[a], row[b]);
    out[q] = row;
  }
  return {
    compare: key.compare,
    reviewed: sheet.items.filter((i) => i.mix && i.set).length,
    items: sheet.items.length,
    ...out,
  };
}

/**
 * A sheet built before tracks carried ids, rebuilt with them. The rebuild
 * must reproduce the sheet's key exactly and every item's tracks in order,
 * so the blinding is unchanged; answers and notes are carried across.
 */
export function upgradeSheet(sheet, key, results, options = {}) {
  if (sheet?.kind !== KIND || key?.kind !== `${KIND}-key`)
    throw new Error("Not a #1196 side-by-side sheet and key");
  const [a, b] = key.compare;
  const rebuilt = buildSideBySide(results, {
    a,
    b,
    sample: sheet.items.length + key.auto_ties.length,
    ...options,
  });
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(rebuilt.key.items, key.items) || !same(rebuilt.key.auto_ties, key.auto_ties))
    throw new Error("The rebuilt sheet's key differs from the stored key; not upgrading");
  const strip = (tracks) => tracks.map(({ track_id, friend_id, ...rest }) => rest);
  const byId = new Map(sheet.items.map((item) => [item.id, item]));
  for (const item of rebuilt.sheet.items) {
    const old = byId.get(item.id);
    if (
      !old ||
      !same(strip([item.seed]), strip([old.seed])) ||
      !same(strip(item.a), strip(old.a)) ||
      !same(strip(item.b), strip(old.b))
    )
      throw new Error(`Item ${item.id} differs from the stored sheet; not upgrading`);
    Object.assign(item, { mix: old.mix, set: old.set, note: old.note });
  }
  return rebuilt.sheet;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const [a, b] = opt("--compare", "beatmatcher:selector").split(":");
  const results = JSON.parse(readFileSync(opt("--results", "eval-data/1196/results.json"), "utf8"));
  if (args.includes("--upgrade")) {
    // Adds track ids to an existing sheet, keeping its answers; the old file is kept as a backup.
    const file = opt("--output", "eval-data/1196/review.json");
    const old = readFileSync(file, "utf8");
    const key = JSON.parse(readFileSync(opt("--key", "eval-data/1196/review-key.json"), "utf8"));
    const upgraded = upgradeSheet(JSON.parse(old), key, results);
    writeFileSync(`${file}.backup-${Date.now()}`, old, { flag: "wx", mode: 0o600 });
    save(file, upgraded);
    console.log(
      JSON.stringify({
        upgraded: upgraded.items.length,
        answered: upgraded.items.filter((i) => i.mix && i.set).length,
      }),
    );
    return;
  }
  const { sheet, key } = buildSideBySide(results, { a, b, sample: Number(opt("--sample", "20")) });
  const write = (file, value) =>
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  write(opt("--output", "eval-data/1196/review.json"), sheet);
  write(opt("--key", "eval-data/1196/review-key.json"), key);
  console.log(JSON.stringify({ to_review: sheet.items.length, auto_ties: key.auto_ties.length }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
