#!/usr/bin/env node
/** Build every #382 candidate text from the read-only #379 snapshot. Node 26+. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { VARIANTS, variants } from './variants.mjs';

export function prepare(snapshot) {
  if (snapshot.schema_version !== 1 || !Array.isArray(snapshot.tracks) || !Array.isArray(snapshot.albums)) {
    throw new Error('Invalid evaluation snapshot');
  }
  const albums = new Map(snapshot.albums.map((a) => [`${a.friend_id}:${a.release_id}`, a]));
  const rows = snapshot.tracks.map((track) => ({
    track_id: track.track_id,
    friend_id: track.friend_id,
    text: variants(track, albums.get(`${track.friend_id}:${track.release_id}`)),
  }));
  if (rows.some((r) => r.friend_id !== snapshot.friend_id)) throw new Error('Snapshot contains another friend');
  return rows;
}

/** Character counts only: nothing here prints track text. */
export function describe(rows) {
  return Object.fromEntries(VARIANTS.map((variant) => {
    const texts = rows.map((r) => r.text[variant]);
    const chars = texts.reduce((sum, t) => sum + t.length, 0);
    return [variant, { chars, approx_tokens: Math.ceil(chars / 4), distinct_texts: new Set(texts).size }];
  }));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  const input = flag('--snapshot');
  const output = flag('--output');
  if (!input) throw new Error('Usage: node evaluations/382/prepare.mjs --snapshot eval-data/379-friend-6.json [--output eval-data/382-texts.json]');
  const raw = readFileSync(input);
  const rows = prepare(JSON.parse(raw));
  const snapshot_sha256 = createHash('sha256').update(raw).digest('hex');
  const report = { snapshot_sha256, tracks: rows.length, variants: VARIANTS, by_variant: describe(rows),
    estimate_method: 'characters / 4; not tokenizer or billable usage' };
  if (output) {
    writeFileSync(output, JSON.stringify({ snapshot_sha256, variants: VARIANTS, rows }), { flag: 'wx', mode: 0o600 });
    report.output = output;
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
