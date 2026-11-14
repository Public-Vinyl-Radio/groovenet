#!/usr/bin/env node
/**
 * Blind side-by-side of "similar tracks" lists for #1170: for each seed, the
 * identity top 10 under a variant and under its baseline, shown as lists A
 * and B in a seeded random order. The judge picks the list they would rather
 * dig through. This is how the collection is used (start from a track and
 * traverse), so it replaces query precision as the identity decision.
 *
 * The list is exact cosine with the seed excluded
 * (`recommendationRepository.findSimilar`). With `--variety-cap N` it also
 * keeps at most N tracks per release, keyed as `rankSuggestions`' `releaseOf`
 * does (artist + album), which is what Related tracks and the Suggestions
 * panel show (#1029). Without the cap about 7 of the 10 are album mates,
 * identical under every variant.
 *
 * The sheet holds track metadata only: no variant names, scores, AI notes,
 * lyrics or summaries. Which list is which lives in a separate key file the
 * judge does not open. Seeds whose two lists hold the same tracks are ties
 * recorded in the key and never shown.
 *
 *   node evaluations/1170/side-by-side.mjs --snapshot S --texts T --vectors DIR \
 *     --compare IL:I0 --compare IG:I0 [--variety-cap 1] --output SHEET --key KEY
 *   node evaluations/1170/side-by-side.mjs --tally SHEET --key KEY
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashText } from "../379/embed.mjs";
import { playlistMates, rank } from "../379/score.mjs";
import { candidateVectors, loadVectors } from "../382/score.mjs";
import { chooseSeeds } from "./score.mjs";
import { rng } from "./score-judgments.mjs";

export const VERDICTS = ["a", "b", "same"];
const KIND = "1170-side-by-side";

/** Playlist tracks (ones actually used), stratified by summary, deterministic. */
export function pickSeeds(snapshot, hasSummary, withSummary = 30, withoutSummary = 10) {
  const seeds = chooseSeeds(
    snapshot,
    playlistMates(snapshot),
    hasSummary,
    Math.max(withSummary, withoutSummary),
  );
  return [
    ...seeds.filter((s) => hasSummary[s.index]).slice(0, withSummary),
    ...seeds.filter((s) => !hasSummary[s.index]).slice(0, withoutSummary),
  ];
}

/** `keep(j)` filters candidates before the cut, e.g. to drop the seed's release. */
export function topK(candidates, index, k = 10, keep = () => true) {
  return rank(candidates[index], candidates, index)
    .map((r) => r.i)
    .filter(keep)
    .slice(0, k);
}

/** `rankSuggestions`' `releaseOf`: artist + album, else the track itself. */
export function releaseOf(track) {
  const artist = track.artist?.trim().toLowerCase();
  const album = track.album?.trim().toLowerCase();
  return artist && album
    ? `${track.friend_id}:${artist}:${album}`
    : `${track.track_id}:${track.friend_id}`;
}

/**
 * At most `cap` tracks per release, in ranked order, like the app's variety
 * cap. Stateful: make a fresh one for each list.
 */
export function varietyCap(tracks, cap) {
  const counts = new Map();
  return (j) => {
    const release = releaseOf(tracks[j]);
    const count = counts.get(release) ?? 0;
    counts.set(release, count + 1);
    return count < cap;
  };
}

function describe(snapshot, albums, index) {
  const t = snapshot.tracks[index];
  const album = albums.get(`${t.friend_id}:${t.release_id}`);
  return {
    title: t.title,
    artist: t.artist,
    album: t.album,
    year: t.year,
    styles: album?.styles ?? t.styles ?? [],
    tags: t.local_tags ?? "",
  };
}

/**
 * `lists[variant]` is a function from seed index to its top-k indices.
 * Returns the judge's sheet and the private key.
 */
export function buildSideBySide(snapshot, seeds, comparisons, lists, randomSeed = 1170) {
  const random = rng(randomSeed);
  const albums = new Map((snapshot.albums ?? []).map((a) => [`${a.friend_id}:${a.release_id}`, a]));
  const items = [];
  const key = { kind: `${KIND}-key`, items: {}, auto_ties: [] };
  for (const [variant, baseline] of comparisons) {
    for (const { index, key: seedKey } of seeds) {
      const mine = lists[variant](index);
      const theirs = lists[baseline](index);
      const shared = new Set(mine.filter((i) => theirs.includes(i)));
      if (shared.size === mine.length && mine.length === theirs.length) {
        key.auto_ties.push({ comparison: `${variant} vs ${baseline}`, seed: seedKey });
        continue;
      }
      const variantIsA = random() < 0.5;
      const [a, b] = variantIsA ? [mine, theirs] : [theirs, mine];
      const show = (list) =>
        list.map((i) => ({ ...describe(snapshot, albums, i), in_both: shared.has(i) }));
      items.push({
        id: null,
        seed: describe(snapshot, albums, index),
        a: show(a),
        b: show(b),
        verdict: null,
        note: "",
        _key: {
          comparison: `${variant} vs ${baseline}`,
          seed: seedKey,
          a: variantIsA ? variant : baseline,
        },
      });
    }
  }
  // Shuffle so the order gives away neither the comparison nor the seed stratum.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.forEach((item, i) => {
    item.id = `s${String(i + 1).padStart(3, "0")}`;
    key.items[item.id] = item._key;
    delete item._key;
  });
  return { sheet: { kind: KIND, schema_version: 1, items }, key };
}

/** Exact two-sided sign test, ties dropped. */
export function signTest(wins, losses) {
  const n = wins + losses;
  if (!n) return 1;
  const k = Math.min(wins, losses);
  let tail = 0;
  let term = 0.5 ** n; // C(n, 0) / 2^n
  for (let i = 0; i <= k; i++) {
    tail += term;
    term *= (n - i) / (i + 1);
  }
  return Math.min(1, 2 * tail);
}

export function tallySideBySide(sheet, key) {
  if (sheet?.kind !== KIND || key?.kind !== `${KIND}-key`)
    throw new Error("Not a #1170 side-by-side sheet and key");
  const out = {};
  const row = (comparison) =>
    (out[comparison] ??= { variant: 0, baseline: 0, same: 0, auto_tie: 0, unreviewed: 0 });
  for (const tie of key.auto_ties) row(tie.comparison).auto_tie++;
  for (const item of sheet.items) {
    const k = key.items[item.id];
    if (!k) throw new Error(`Item ${item.id} is not in the key`);
    const r = row(k.comparison);
    if (item.verdict == null) r.unreviewed++;
    else if (!VERDICTS.includes(item.verdict)) throw new Error(`Invalid verdict for ${item.id}`);
    else if (item.verdict === "same") r.same++;
    else if ((item.verdict === "a") === (k.a === k.comparison.split(" vs ")[0])) r.variant++;
    else r.baseline++;
  }
  for (const r of Object.values(out)) r.sign_test_p = signTest(r.variant, r.baseline);
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  if (opt("--tally")) {
    const sheet = JSON.parse(readFileSync(opt("--tally")));
    const key = JSON.parse(readFileSync(opt("--key")));
    console.log(JSON.stringify(tallySideBySide(sheet, key), null, 2));
    return;
  }
  const comparisons = args.flatMap((a, i) => (a === "--compare" ? [args[i + 1].split(":")] : []));
  for (const c of ["--snapshot", "--texts", "--vectors", "--output", "--key"])
    if (!opt(c) || !comparisons.length)
      throw new Error(
        "Usage: node evaluations/1170/side-by-side.mjs --snapshot S --texts T --vectors DIR --compare IL:I0 [...] --output SHEET --key KEY",
      );
  const raw = readFileSync(opt("--snapshot"));
  const sha = createHash("sha256").update(raw).digest("hex");
  const snapshot = JSON.parse(raw);
  const texts = JSON.parse(readFileSync(opt("--texts")));
  const manifest = JSON.parse(readFileSync(join(opt("--vectors"), "manifest.json")));
  if (sha !== texts.snapshot_sha256 || sha !== manifest.snapshot_sha256)
    throw new Error("Snapshot, texts and vectors do not match");
  const hasSummary = texts.rows.map((r, i) => {
    if (r.track_id !== snapshot.tracks[i].track_id) throw new Error("Snapshot/text order mismatch");
    return r.has_summary;
  });
  const variants = [...new Set(comparisons.flat())];
  const wanted = new Set(texts.rows.flatMap((r) => variants.map((v) => hashText(r.text[v]))));
  const vectors = await loadVectors(
    join(opt("--vectors"), "vectors.ndjson"),
    manifest.dims,
    wanted,
  );
  const lists = Object.fromEntries(
    variants.map((v) => {
      const candidates = candidateVectors(texts.rows, v, vectors);
      return [
        v,
        (index) =>
          topK(
            candidates,
            index,
            10,
            opt("--variety-cap")
              ? varietyCap(snapshot.tracks, Number(opt("--variety-cap")))
              : undefined,
          ),
      ];
    }),
  );
  const seeds = pickSeeds(snapshot, hasSummary);
  const { sheet, key } = buildSideBySide(snapshot, seeds, comparisons, lists);
  sheet.snapshot_sha256 = sha;
  key.snapshot_sha256 = sha;
  writeFileSync(opt("--output"), JSON.stringify(sheet, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(opt("--key"), JSON.stringify(key, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(
    JSON.stringify({
      seeds: seeds.length,
      to_review: sheet.items.length,
      auto_ties: key.auto_ties.length,
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
