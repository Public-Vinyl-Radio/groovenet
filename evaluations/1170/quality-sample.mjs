#!/usr/bin/env node
/**
 * Hand-review sample for lyric summaries (#1170 step 3): is each summary
 * faithful to the lyrics, or did the model invent themes? The sheet holds
 * lyrics and summaries, so it is private: eval-data/ only, mode 0600.
 *
 * Stratified by vocal presence × English / other language, so hook-only
 * dance tracks and non-English lyrics are not drowned out by the majority,
 * then filled round-robin in a fixed hash order.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { hashText } from "../379/embed.mjs";
import { lyricTracks, summariesByTrack } from "./summarize.mjs";

export const VERDICTS = ["faithful", "minor", "hallucinated"];

export const stratum = (s) =>
  `${s.vocal_presence}/${s.languages.length === 1 && s.languages[0] === "english" ? "english" : "other"}`;

export function sample(snapshot, summaries, size = 40) {
  const strata = new Map();
  for (const t of lyricTracks(snapshot).sort((a, b) =>
    hashText(`1170:${a.track_id}`).localeCompare(hashText(`1170:${b.track_id}`)),
  )) {
    const s = summaries.get(t.track_id);
    if (!s) continue;
    const name = stratum(s);
    if (!strata.has(name)) strata.set(name, []);
    strata.get(name).push({ track: t, summary: s, stratum: name });
  }
  const queues = [...strata.keys()].sort().map((k) => strata.get(k));
  const picked = [];
  while (picked.length < size && queues.some((q) => q.length)) {
    for (const q of queues) if (q.length && picked.length < size) picked.push(q.shift());
  }
  return picked;
}

export function sheet(snapshot, summaries, manifest, size = 40) {
  return {
    schema_version: 1,
    kind: "1170-summary-quality",
    model: manifest.model,
    digest: manifest.digest,
    prompt_version: manifest.prompt_version,
    instructions:
      "For each track read the lyrics, then the summary. faithful: every theme, mood, language and vocal-presence value is supported by the lyrics. minor: a value is off (a mood word, the vocal-presence bucket) but nothing is invented. hallucinated: a theme or claim the lyrics do not support. A note is required for minor and hallucinated.",
    items: sample(snapshot, summaries, size).map(({ track, summary, stratum: s }) => ({
      track_id: track.track_id,
      friend_id: track.friend_id,
      title: track.title,
      artist: track.artist,
      stratum: s,
      lyrics: track.lyrics,
      summary,
      verdict: null,
      note: "",
    })),
  };
}

/** Aggregates only, safe for the write-up. */
export function tally(review) {
  if (review?.kind !== "1170-summary-quality" || !Array.isArray(review.items))
    throw new Error("Not a #1170 summary-quality sheet");
  const counts = { faithful: 0, minor: 0, hallucinated: 0, unreviewed: 0 };
  const byStratum = {};
  for (const item of review.items) {
    if (item.verdict !== null && !VERDICTS.includes(item.verdict))
      throw new Error(`Invalid verdict for ${item.track_id}`);
    if (item.verdict && item.verdict !== "faithful" && !item.note?.trim())
      throw new Error(`${item.verdict} needs a note (${item.track_id})`);
    const v = item.verdict ?? "unreviewed";
    counts[v]++;
    (byStratum[item.stratum] ??= { faithful: 0, minor: 0, hallucinated: 0, unreviewed: 0 })[v]++;
  }
  return { size: review.items.length, ...counts, by_stratum: byStratum };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i < 0 ? undefined : args[i + 1];
  };
  try {
    if (opt("--tally")) {
      console.log(JSON.stringify(tally(JSON.parse(readFileSync(opt("--tally")))), null, 2));
    } else {
      if (!opt("--snapshot") || !opt("--summaries") || !opt("--output"))
        throw new Error(
          "Usage: node evaluations/1170/quality-sample.mjs --snapshot S --summaries DIR --output eval-data/1170-quality.json [--size 40]\n       node evaluations/1170/quality-sample.mjs --tally eval-data/1170-quality.json",
        );
      const snapshot = JSON.parse(readFileSync(opt("--snapshot")));
      const { manifest, summaries } = summariesByTrack(snapshot, opt("--summaries"));
      const out = sheet(snapshot, summaries, manifest, Number(opt("--size") ?? 40));
      writeFileSync(opt("--output"), JSON.stringify(out, null, 2) + "\n", {
        flag: "wx",
        mode: 0o600,
      });
      console.log(JSON.stringify({ output: opt("--output"), ...tally(out) }, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
