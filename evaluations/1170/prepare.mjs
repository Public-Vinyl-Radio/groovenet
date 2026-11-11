#!/usr/bin/env node
/**
 * Build every #1170 text from the lyrics snapshot and the local summaries.
 * The output has the #382 texts shape, so `evaluations/382/embed.mjs` embeds
 * it unchanged. It holds summaries (not lyrics) and stays under eval-data/.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { summariesByTrack } from "./summarize.mjs";
import { VARIANTS, fileGenres, identityData, variants } from "./variants.mjs";

export function prepare(snapshot, summaries) {
  if (!Array.isArray(snapshot.tracks) || !Array.isArray(snapshot.albums))
    throw new Error("Invalid evaluation snapshot");
  const albums = new Map(snapshot.albums.map((a) => [`${a.friend_id}:${a.release_id}`, a]));
  return snapshot.tracks.map((track) => {
    if (track.friend_id !== snapshot.friend_id) throw new Error("Snapshot contains another friend");
    const album = albums.get(`${track.friend_id}:${track.release_id}`);
    const summary = summaries.get(track.track_id) ?? null;
    return {
      track_id: track.track_id,
      friend_id: track.friend_id,
      has_lyrics: typeof track.lyrics === "string" && track.lyrics.trim().length > 0,
      has_summary: summary !== null,
      adds_file_genre: fileGenres(track, identityData(track, album)).length > 0,
      text: variants(track, album, summary),
    };
  });
}

/** Counts only: nothing here prints track text, lyrics or summaries. */
export function describe(rows) {
  const count = (pred) => rows.filter(pred).length;
  return {
    tracks: rows.length,
    with_lyrics: count((r) => r.has_lyrics),
    with_summary: count((r) => r.has_summary),
    failed_summary: count((r) => r.has_lyrics && !r.has_summary),
    adds_file_genre: count((r) => r.adds_file_genre),
    by_variant: Object.fromEntries(
      VARIANTS.map((v) => {
        const texts = rows.map((r) => r.text[v]);
        const chars = texts.reduce((s, t) => s + t.length, 0);
        const base = v.startsWith("I") ? "I0" : "C0";
        return [
          v,
          {
            chars,
            approx_tokens: Math.ceil(chars / 4),
            distinct_texts: new Set(texts).size,
            differs_from_baseline: count((r) => r.text[v] !== r.text[base]),
          },
        ];
      }),
    ),
    estimate_method: "characters / 4; not tokenizer or billable usage",
  };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1];
  };
  if (!flag("--snapshot") || !flag("--summaries"))
    throw new Error(
      "Usage: node evaluations/1170/prepare.mjs --snapshot eval-data/1170-friend-6.json --summaries eval-data/1170-summaries [--output eval-data/1170-texts.json]",
    );
  const raw = readFileSync(flag("--snapshot"));
  const snapshot_sha256 = createHash("sha256").update(raw).digest("hex");
  const snapshot = JSON.parse(raw);
  const { manifest, summaries } = summariesByTrack(snapshot, flag("--summaries"));
  if (manifest.snapshot_sha256 !== snapshot_sha256)
    throw new Error("Summaries were made from another snapshot");
  const rows = prepare(snapshot, summaries);
  const report = { snapshot_sha256, summaries_model: manifest.model, ...describe(rows) };
  if (flag("--output")) {
    writeFileSync(
      flag("--output"),
      JSON.stringify({ snapshot_sha256, variants: VARIANTS, summaries: manifest, rows }),
      { flag: "wx", mode: 0o600 },
    );
    report.output = flag("--output");
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
