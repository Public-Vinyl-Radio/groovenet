#!/usr/bin/env node
/**
 * The frozen seed set for #1196, chosen by a fixed rule before any profile's
 * output is seen. The rule (`selectSeeds`) is pure: the same catalogue gives
 * the same seeds, byte for byte.
 *
 * Track seeds, from one library's live tracks:
 *  - `missing` seeds with no BPM, no key or only one embedding, at random;
 *  - per BPM band, `perBand` complete seeds (BPM, key, identity and vibe
 *    embeddings), walking the top-level genres round-robin from a different
 *    starting genre in each band, so tempo and genre both spread. A cell
 *    with nothing left passes to the next genre.
 * Playlist seeds: `playlists` playlists of that library with at least
 * `minPlaylistTracks` tracks that have a BPM and a vibe embedding (what the
 * optimiser needs), at random.
 *
 * The output holds ids, BPM bands and top-level genre names only, so it can
 * be committed. Its SHA-256 is `SEEDS_SHA256`; `loadSeeds` refuses a file
 * that doesn't match.
 *
 *   node evaluations/1196/seeds.mjs --output evaluations/1196/seeds.json \
 *     [--catalogue-out eval-data/1196/catalogue.json]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rng } from "../1170/score-judgments.mjs";
import { psqlJson, worktreeEnv } from "./stack.mjs";

export const SEEDS_SHA256 = "a6ce1f66113a9cad070b97485534a3ad43c6c7f69becba55743ec472ac306be2";

export const RULE = {
  friend_id: 6,
  random_seed: 1196,
  /** [low, high) BPM; the last is open-ended. */
  bpm_bands: [
    [0, 90],
    [90, 105],
    [105, 120],
    [120, 135],
    [135, Infinity],
  ],
  per_band: 6,
  top_genres: 6,
  missing: 4,
  playlists: 5,
  min_playlist_tracks: 10,
  max_playlist_tracks: 100,
};

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export function bandOf(bpm, bands = RULE.bpm_bands) {
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) return null;
  const i = bands.findIndex(([lo, hi]) => bpm >= lo && bpm < hi);
  return i < 0 ? null : bandLabel(bands[i]);
}

const bandLabel = ([lo, hi]) => (hi === Infinity ? `${lo}+` : `${lo}-${hi}`);

/** The root genre most of the track's links lead to; ties by name. Null without links. */
export function primaryGenre(roots) {
  if (!roots?.length) return null;
  const counts = new Map();
  for (const r of roots) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

function shuffled(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byId = (a, b) =>
  a.friend_id - b.friend_id || (a.track_id < b.track_id ? -1 : a.track_id > b.track_id ? 1 : 0);

/** What a track lacks, of the data the profiles read. */
export function missingOf(track) {
  const out = [];
  if (bandOf(track.bpm) === null) out.push("bpm");
  if (!track.key) out.push("key");
  if (!track.has_identity) out.push("identity");
  if (!track.has_vibe) out.push("vibe");
  return out;
}

/**
 * `catalogue`: `{ tracks: [{ track_id, friend_id, bpm, key, has_identity,
 * has_vibe, roots }], playlists: [{ playlist_id, friend_id, usable }] }`.
 */
export function selectSeeds(catalogue, rule = RULE) {
  const random = rng(rule.random_seed);
  const tracks = catalogue.tracks
    .filter((t) => t.friend_id === rule.friend_id && (t.has_identity || t.has_vibe))
    .sort(byId)
    .map((t) => ({ ...t, genre: primaryGenre(t.roots), missing: missingOf(t) }));

  const missing = shuffled(
    tracks.filter((t) => t.missing.length),
    random,
  ).slice(0, rule.missing);

  const complete = tracks.filter((t) => !t.missing.length);
  const freq = new Map();
  for (const t of complete) if (t.genre) freq.set(t.genre, (freq.get(t.genre) ?? 0) + 1);
  const top = [...freq]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, rule.top_genres)
    .map(([g]) => g);
  const groupOf = (t) => (top.includes(t.genre) ? t.genre : "other");
  const order = [...top, "other"];

  const picked = [];
  rule.bpm_bands.forEach((band, b) => {
    const label = bandLabel(band);
    const cells = new Map(order.map((g) => [g, []]));
    for (const t of complete)
      if (bandOf(t.bpm, rule.bpm_bands) === label) cells.get(groupOf(t)).push(t);
    for (const [g, list] of cells) cells.set(g, shuffled(list, random));
    let cursor = b;
    for (let n = 0; n < rule.per_band; n++) {
      let tries = 0;
      while (tries < order.length && !cells.get(order[cursor % order.length]).length) {
        cursor++;
        tries++;
      }
      if (tries === order.length) break; // the band is used up
      const genre = order[cursor % order.length];
      picked.push({ track: cells.get(genre).shift(), band: label, genre });
      cursor++;
    }
  });

  const playlists = shuffled(
    catalogue.playlists
      .filter(
        (p) =>
          p.friend_id === rule.friend_id &&
          p.usable >= rule.min_playlist_tracks &&
          p.usable <= rule.max_playlist_tracks,
      )
      .sort((a, b) => a.playlist_id - b.playlist_id),
    random,
  )
    .slice(0, rule.playlists)
    .sort((a, b) => a.playlist_id - b.playlist_id);

  return {
    kind: "1196-seeds",
    schema_version: 1,
    rule: { ...rule, bpm_bands: rule.bpm_bands.map(bandLabel) },
    catalogue_sha256: sha256(canonical(catalogue)),
    tracks: [
      ...picked.map(({ track, band, genre }) => ({
        track_id: track.track_id,
        friend_id: track.friend_id,
        stratum: { band, genre },
      })),
      ...missing.map((t) => ({
        track_id: t.track_id,
        friend_id: t.friend_id,
        stratum: { band: bandOf(t.bpm), genre: groupOf(t), missing: t.missing },
      })),
    ],
    playlists: playlists.map((p) => ({ playlist_id: p.playlist_id, friend_id: p.friend_id })),
  };
}

/** The catalogue in a fixed order, so its hash doesn't depend on SQL row order. */
export function canonical(catalogue) {
  const tracks = [...catalogue.tracks].sort(byId).map((t) => ({
    track_id: t.track_id,
    friend_id: t.friend_id,
    bpm: t.bpm ?? null,
    key: t.key ?? null,
    has_identity: !!t.has_identity,
    has_vibe: !!t.has_vibe,
    roots: [...(t.roots ?? [])].sort(),
  }));
  const playlists = [...catalogue.playlists]
    .sort((a, b) => a.playlist_id - b.playlist_id)
    .map((p) => ({ playlist_id: p.playlist_id, friend_id: p.friend_id, usable: p.usable }));
  return JSON.stringify({ tracks, playlists });
}

export const serialize = (seeds) => JSON.stringify(seeds, null, 2) + "\n";

/** Parse a seeds file, refusing one whose bytes don't hash to `expected`. */
export function verifySeeds(raw, expected = SEEDS_SHA256) {
  const actual = sha256(raw);
  if (actual !== expected)
    throw new Error(
      `seeds.json SHA-256 is ${actual}, expected ${expected}: the frozen set changed`,
    );
  const seeds = JSON.parse(raw);
  if (seeds?.kind !== "1196-seeds") throw new Error("Not a #1196 seeds file");
  return seeds;
}

export function loadSeeds(path, expected = SEEDS_SHA256) {
  return verifySeeds(readFileSync(path, "utf8"), expected);
}

/** One library's tracks and playlists, as `selectSeeds` reads them. */
export function catalogueSql(friendId) {
  const id = Number(friendId);
  if (!Number.isInteger(id)) throw new Error("friend_id must be an integer");
  return `
WITH RECURSIVE serving AS (
  SELECT embedding_type, serving_model, serving_template_version FROM embedding_model_settings
), up(track_id, friend_id, gid, pid) AS (
  SELECT tg.track_id, tg.friend_id, g.id, g.parent_id
  FROM track_genres tg JOIN genres g ON g.id = tg.genre_id WHERE tg.friend_id = ${id}
  UNION ALL
  SELECT up.track_id, up.friend_id, g.id, g.parent_id FROM up JOIN genres g ON g.id = up.pid
), roots AS (
  SELECT up.track_id, up.friend_id, array_agg(g.name ORDER BY g.name) AS roots
  FROM up JOIN genres g ON g.id = up.gid WHERE up.pid IS NULL GROUP BY 1, 2
), has AS (
  SELECT e.track_id, e.friend_id,
    bool_or(e.embedding_type = 'identity') AS has_identity,
    bool_or(e.embedding_type = 'audio_vibe') AS has_vibe
  FROM track_embeddings e JOIN serving s ON s.embedding_type = e.embedding_type
    AND s.serving_model = e.model AND s.serving_template_version = e.template_version
  WHERE e.friend_id = ${id} GROUP BY 1, 2
)
SELECT json_build_object(
  'tracks', (SELECT coalesce(json_agg(json_build_object(
      'track_id', t.track_id, 'friend_id', t.friend_id, 'bpm', t.bpm, 'key', t.key,
      'has_identity', coalesce(h.has_identity, false), 'has_vibe', coalesce(h.has_vibe, false),
      'roots', coalesce(r.roots, '{}'))), '[]')
    FROM tracks t
    LEFT JOIN has h ON h.track_id = t.track_id AND h.friend_id = t.friend_id
    LEFT JOIN roots r ON r.track_id = t.track_id AND r.friend_id = t.friend_id
    WHERE t.friend_id = ${id} AND t.deleted_at IS NULL),
  'playlists', (SELECT coalesce(json_agg(json_build_object(
      'playlist_id', p.playlist_id, 'friend_id', ${id}, 'usable', p.usable)), '[]')
    FROM (
      SELECT pt.playlist_id, count(DISTINCT pt.track_id) FILTER (
        WHERE t.bpm > 0 AND coalesce(h.has_vibe, false)) AS usable
      FROM playlist_tracks pt
      JOIN tracks t ON t.track_id = pt.track_id AND t.friend_id = pt.friend_id AND t.deleted_at IS NULL
      LEFT JOIN has h ON h.track_id = t.track_id AND h.friend_id = t.friend_id
      WHERE pt.friend_id = ${id}
      GROUP BY 1
    ) p)
)`;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  const output = opt("--output");
  if (!output) throw new Error("Usage: node evaluations/1196/seeds.mjs --output seeds.json");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { project } = worktreeEnv(root);
  const catalogue = psqlJson(project, catalogueSql(RULE.friend_id));
  const seeds = selectSeeds(catalogue);
  if (opt("--catalogue-out")) {
    mkdirSync(dirname(opt("--catalogue-out")), { recursive: true });
    writeFileSync(opt("--catalogue-out"), canonical(catalogue) + "\n", { mode: 0o600 });
  }
  const text = serialize(seeds);
  writeFileSync(output, text, { flag: "wx" });
  console.log(
    JSON.stringify({
      tracks: seeds.tracks.length,
      playlists: seeds.playlists.length,
      catalogue_sha256: seeds.catalogue_sha256,
      seeds_sha256: sha256(text),
    }),
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
