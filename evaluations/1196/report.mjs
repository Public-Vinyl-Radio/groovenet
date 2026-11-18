#!/usr/bin/env node
/**
 * Turns `run.mjs`'s raw results into the #1196 summary (JSON) and report
 * (markdown). Pure apart from `main`.
 *
 * The verdict rules (`CLAIMS`) were committed before the first run: a claim
 * passes only when its preset wins every listed metric on the mean over the
 * seeds where both profiles have the value. Each test also reports per-seed
 * wins and losses with a sign test, so a narrow mean is visible as one.
 *
 *   node evaluations/1196/report.mjs --results eval-data/1196/results.json \
 *     --vectors eval-data/1196/vectors.json --out-dir eval-data/1196
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jaccard, listMetrics, macro, orderingPerTransition, paired, read } from "./metrics.mjs";

/** The presets' claims, as the issue states them. */
export const CLAIMS = [
  {
    id: "beatmatcher-tempo-key",
    claim: "Beatmatcher beats Selector on BPM and key fit",
    winner: "beatmatcher",
    loser: "selector",
    tests: [
      { path: "bpm.within_hd", better: "higher", label: "BPM within ±6% (½×/2×)" },
      { path: "bpm.mean_abs_hd", better: "lower", label: "mean |ΔBPM| (½×/2×)" },
      { path: "key.compatible", better: "higher", label: "compatible keys" },
      { path: "key.clash", better: "lower", label: "key clashes" },
    ],
  },
  {
    id: "selector-vibe-diversity",
    claim: "Selector beats Beatmatcher on vibe similarity and diversity",
    winner: "selector",
    loser: "beatmatcher",
    tests: [
      { path: "vibe.mean", better: "higher", label: "vibe similarity" },
      { path: "artists", better: "higher", label: "distinct artists" },
      { path: "releases", better: "higher_or_equal", label: "distinct releases" },
    ],
  },
];

/** How each ordering claim reads; informational, the issue's "done when" is the lists. */
export const ORDERING_CLAIMS = [
  { winner: "beatmatcher", loser: "selector", path: "bpm_jump_hd", better: "lower" },
  { winner: "beatmatcher", loser: "selector", path: "key_clash", better: "lower" },
  { winner: "selector", loser: "beatmatcher", path: "vibe_distance", better: "lower" },
];

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const simsFor = (results, seedKey) => {
  const out = new Map();
  for (const [pair, value] of Object.entries(results.sims ?? {})) {
    const [s, p] = pair.split("|");
    if (s === seedKey) out.set(p, value);
  }
  return out;
};

/** Per-seed list metrics for every profile, in seed order. */
export function perSeedMetrics(results) {
  const out = {};
  for (const { id } of results.profiles) {
    out[id] = results.seeds.map((s) => {
      const list = s.lists[id] ?? { picks: [] };
      return {
        seed: s.key,
        kind: s.kind,
        ...listMetrics(s.seed, list.picks, simsFor(results, s.key)),
      };
    });
  }
  return out;
}

/** Means of A and B over the seeds where both have the value, plus the paired tally. */
export function compare(aSeeds, bSeeds, path, better) {
  const both = aSeeds
    .map((a, i) => [read(a, path), read(bSeeds[i], path)])
    .filter(([x, y]) => typeof x === "number" && typeof y === "number");
  const a = mean(both.map(([x]) => x));
  const b = mean(both.map(([, y]) => y));
  const direction = better === "lower" ? "lower" : "higher";
  const tally = paired(aSeeds, bSeeds, path, direction);
  let pass = null;
  if (a !== null && b !== null)
    pass = better === "lower" ? a < b : better === "higher_or_equal" ? a >= b - 1e-9 : a > b + 1e-9;
  return { seeds: both.length, a, b, pass, ...tally };
}

export function verdicts(perSeed, claims = CLAIMS) {
  return claims.map((c) => {
    const tests = c.tests.map((t) => ({
      ...t,
      ...compare(perSeed[c.winner] ?? [], perSeed[c.loser] ?? [], t.path, t.better),
    }));
    const decided = tests.every((t) => t.pass !== null);
    return {
      id: c.id,
      claim: c.claim,
      winner: c.winner,
      loser: c.loser,
      pass: decided ? tests.every((t) => t.pass) : null,
      tests,
    };
  });
}

const LIST_PATHS = [
  "bpm.mean_abs",
  "bpm.mean_abs_hd",
  "bpm.within",
  "bpm.within_hd",
  "key.compatible",
  "key.clash",
  "genre.mean",
  "vibe.mean",
  "identity.mean",
  "era.same",
  "era.near",
  "era.mean_abs_year",
  "era.coverage",
  "energy.mean_abs",
  "energy.within",
  "energy.coverage",
  "artists",
  "releases",
  "picks",
];

/** Orderings: mean per-transition metrics per profile and mode, over playlists. */
export function orderingSummary(results, vectors) {
  const halfDouble = Object.fromEntries(results.profiles.map((p) => [p.id, !!p.half_double]));
  const out = {};
  for (const o of results.orderings ?? []) {
    for (const [profile, modes] of Object.entries(o.runs)) {
      for (const [mode, runs] of Object.entries(modes)) {
        const row = ((out[mode] ??= {})[profile] ??= { playlists: 0, values: [] });
        const perRun = runs.map((order) =>
          orderingPerTransition(
            order.map((k) => ({ ...results.tracks[k], embedding: vectors[k] ?? null })),
            { halfDouble: halfDouble[profile] },
          ),
        );
        // Genetic is randomised: a playlist's value is the mean of its runs.
        const avg = (field) => mean(perRun.map((r) => r[field]).filter((v) => v !== null));
        row.playlists++;
        row.values.push({
          playlist: o.playlist,
          runs: runs.length,
          bpm_jump: avg("bpm_jump"),
          bpm_jump_hd: avg("bpm_jump_hd"),
          bpm_jump_native: avg("bpm_jump_native"),
          key_clash: avg("key_clash"),
          vibe_distance: avg("vibe_distance"),
        });
      }
    }
  }
  for (const modes of Object.values(out))
    for (const row of Object.values(modes))
      for (const f of ["bpm_jump", "bpm_jump_hd", "bpm_jump_native", "key_clash", "vibe_distance"])
        row[f] = mean(row.values.map((v) => v[f]).filter((v) => v !== null));
  return out;
}

export function orderingVerdicts(ordering, claims = ORDERING_CLAIMS) {
  const out = [];
  for (const [mode, rows] of Object.entries(ordering))
    for (const c of claims) {
      const a = rows[c.winner]?.[c.path];
      const b = rows[c.loser]?.[c.path];
      if (typeof a !== "number" || typeof b !== "number") continue;
      out.push({ mode, ...c, a, b, pass: c.better === "lower" ? a < b : a > b });
    }
  return out;
}

export function summarize(results, vectors = {}) {
  const perSeed = perSeedMetrics(results);
  const ids = results.profiles.map((p) => p.id);
  const profiles = {};
  for (const id of ids) {
    const rows = perSeed[id];
    profiles[id] = {
      half_double: !!results.profiles.find((p) => p.id === id).half_double,
      proposal: results.profiles.find((p) => p.id === id).source === "config",
      seeds: rows.length,
      starved: rows.filter((r) => r.starved).length,
      empty: rows.filter((r) => r.picks === 0).length,
      metrics: Object.fromEntries(LIST_PATHS.map((p) => [p, macro(rows, p)])),
    };
  }
  const overlap = {};
  for (const a of ids)
    for (const b of ids) {
      if (a >= b) continue;
      overlap[`${a}|${b}`] = mean(
        results.seeds.map((s) => jaccard(s.lists[a]?.picks ?? [], s.lists[b]?.picks ?? [])),
      );
    }
  const ordering = orderingSummary(results, vectors);
  return {
    kind: "1196-summary",
    seeds_sha256: results.seeds_sha256,
    generated_at: results.generated_at,
    seeds: {
      tracks: results.seeds.filter((s) => s.kind === "track").length,
      playlists: results.seeds.filter((s) => s.kind === "playlist").length,
    },
    profiles,
    overlap,
    verdicts: verdicts(perSeed),
    against_default: ids
      .filter((id) => id !== "default")
      .map((id) => ({
        profile: id,
        tests: ["bpm.within_hd", "key.compatible", "vibe.mean", "artists"].map((path) => ({
          path,
          ...compare(perSeed[id], perSeed.default ?? [], path, "higher"),
        })),
      })),
    ordering,
    ordering_verdicts: orderingVerdicts(ordering),
    per_seed: perSeed,
  };
}

const f = (v, digits = 2) => (typeof v === "number" ? v.toFixed(digits) : "–");
const pct = (v) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "–");
const pass = (v) => (v === null ? "undecided" : v ? "**pass**" : "**fail**");
const p = (v) => (v < 0.001 ? "<0.001" : v.toFixed(3));

export function renderReport(summary) {
  const ids = Object.keys(summary.profiles);
  const lines = [
    "# #1196 ranking profile evaluation",
    "",
    `Seeds SHA-256 \`${summary.seeds_sha256}\` · ${summary.seeds.tracks} track seeds, ${summary.seeds.playlists} playlist seeds · generated ${summary.generated_at}`,
    "",
    "## Verdict",
    "",
    "| Claim | Result | Metric | Winner | Loser | Seeds | Per-seed W–L–T | Sign test p |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const v of summary.verdicts)
    v.tests.forEach((t, i) => {
      const value =
        t.path.includes("within") || t.path.startsWith("key.")
          ? pct
          : (v) => f(v, t.path.endsWith("similarity") || t.path === "vibe.mean" ? 3 : 2);
      lines.push(
        `| ${i ? "" : v.claim} | ${i ? "" : pass(v.pass)} | ${t.label} ${t.pass ? "✓" : "✗"} | ${value(t.a)} | ${value(t.b)} | ${t.seeds} | ${t.wins}–${t.losses}–${t.ties} | ${p(t.sign_test_p)} |`,
      );
    });
  lines.push(
    "",
    "## Top 10 per profile",
    "",
    "Means over seeds (a seed counts where it has the data). One track per release, constraint failures dropped, as the Suggestions panel shows it. ½×/2× measures each pick to the nearest half or double tempo.",
    "",
    "| Profile | Starved (<10) | Empty | mean \\|ΔBPM\\| | ½×/2× | ±6% | ±6% ½×/2× | Compatible key | Clash | Genre overlap | Vibe sim | Identity sim | Artists | Releases |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const id of ids) {
    const m = summary.profiles[id].metrics;
    lines.push(
      `| ${id}${summary.profiles[id].proposal ? " (proposal)" : ""}${summary.profiles[id].half_double ? " (½×/2×)" : ""} | ${summary.profiles[id].starved} | ${summary.profiles[id].empty} | ${f(m["bpm.mean_abs"].mean, 1)} | ${f(m["bpm.mean_abs_hd"].mean, 1)} | ${pct(m["bpm.within"].mean)} | ${pct(m["bpm.within_hd"].mean)} | ${pct(m["key.compatible"].mean)} | ${pct(m["key.clash"].mean)} | ${f(m["genre.mean"].mean)} | ${f(m["vibe.mean"].mean, 3)} | ${f(m["identity.mean"].mean, 3)} | ${f(m.artists.mean, 1)} | ${f(m.releases.mean, 1)} |`,
    );
  }
  lines.push(
    "",
    "## Era and energy fit",
    "",
    "Over the picks where seed and pick both have the value; known is that share of the picks. Era buckets are the `era` signal's decades; ±1 counts the adjacent decade too. Energy is the ranker's (danceability and aggressive mood); ±0.2 is the `energy_range` default.",
    "",
    "| Profile | Same era | Era ±1 | mean \\|Δyear\\| | Era known | mean \\|Δenergy\\| | Energy ±0.2 | Energy known |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const id of ids) {
    const m = summary.profiles[id].metrics;
    const v = (path) => m[path]?.mean;
    lines.push(
      `| ${id} | ${pct(v("era.same"))} | ${pct(v("era.near"))} | ${f(v("era.mean_abs_year"), 1)} | ${pct(v("era.coverage"))} | ${f(v("energy.mean_abs"), 3)} | ${pct(v("energy.within"))} | ${pct(v("energy.coverage"))} |`,
    );
  }
  lines.push(
    "",
    "## Overlap (mean Jaccard at 10)",
    "",
    `| | ${ids.join(" | ")} |`,
    `| --- |${ids.map(() => " --- |").join("")}`,
  );
  for (const a of ids)
    lines.push(
      `| ${a} | ${ids
        .map((b) => (a === b ? "1" : f(summary.overlap[a < b ? `${a}|${b}` : `${b}|${a}`])))
        .join(" | ")} |`,
    );
  lines.push(
    "",
    "## Against Default",
    "",
    "| Profile | Metric | Profile | Default | W–L–T |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of summary.against_default)
    for (const t of row.tests)
      lines.push(
        `| ${row.profile} | ${t.path} | ${f(t.a, 3)} | ${f(t.b, 3)} | ${t.wins}–${t.losses}–${t.ties} |`,
      );
  lines.push(
    "",
    "## Ordering (per transition, mean over playlists)",
    "",
    "Each playlist seed's own tracks with a BPM and a vibe vector, ordered through `POST /api/playlists/genetic`. Genetic is randomised; each playlist's value is the mean of its runs.",
    "",
    "| Mode | Profile | BPM jump | ½×/2× | Key clashes | Vibe distance |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const [mode, rows] of Object.entries(summary.ordering))
    for (const id of ids)
      if (rows[id])
        lines.push(
          `| ${mode} | ${id} | ${f(rows[id].bpm_jump, 1)} | ${f(rows[id].bpm_jump_hd, 1)} | ${f(rows[id].key_clash)} | ${f(rows[id].vibe_distance, 3)} |`,
        );
  if (summary.ordering_verdicts.length) {
    lines.push(
      "",
      "| Mode | Expectation | Winner | Loser | Holds |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const v of summary.ordering_verdicts)
      lines.push(
        `| ${v.mode} | ${v.winner} ${v.better} ${v.path} than ${v.loser} | ${f(v.a, 3)} | ${f(v.b, 3)} | ${v.pass ? "yes" : "no"} |`,
      );
  }
  return lines.join("\n") + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
  const dir = opt("--out-dir", "eval-data/1196");
  const results = JSON.parse(readFileSync(opt("--results", join(dir, "results.json")), "utf8"));
  const vectors = JSON.parse(readFileSync(opt("--vectors", join(dir, "vectors.json")), "utf8"));
  const summary = summarize(results, vectors);
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", {
    mode: 0o600,
  });
  writeFileSync(join(dir, "report.md"), renderReport(summary), { mode: 0o600 });
  console.log(JSON.stringify(summary.verdicts.map((v) => ({ claim: v.claim, pass: v.pass }))));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
