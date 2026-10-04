#!/usr/bin/env node
/** Prepare A/B/C embedding inputs from the read-only snapshot. Node 26+ (TS type stripping). */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  yearToEra, normalizeCountry, normalizeLabels, combineGenres,
  normalizeStyles, normalizeLocalTags, normalizeComposer, formatList,
} from '../../my-collection-search/src/lib/identity-normalization.ts';

export const MODEL = 'text-embedding-3-small';

/** Mirrors buildIdentityData/buildIdentityText in src/lib/identity-embedding.ts. */
export function identityText(track, album = {}) {
  const title = (track.title || 'unknown').trim();
  const artist = (track.artist || 'unknown').trim();
  const release = (track.album || 'unknown').trim();
  const era = yearToEra(track.year);
  const country = normalizeCountry(album.country);
  const labels = normalizeLabels(album.label ? album.label.split(',') : []).sort();
  const composers = normalizeComposer(track.composer).sort();
  const genres = combineGenres(album.genres || track.genres, null, 8).sort();
  const styles = normalizeStyles(album.styles || track.styles, 12).sort();
  const tags = normalizeLocalTags(track.local_tags, 12).sort();
  return [
    `Track: ${title} — ${artist}`,
    `Release: ${release} (${era})`,
    composers.length ? `Composer: ${formatList(composers)}` : null,
    `Country: ${country}`,
    `Labels: ${labels.length ? formatList(labels) : 'none'}`,
    `Genres: ${genres.length ? formatList(genres) : 'unknown'}`,
    `Styles: ${styles.length ? formatList(styles) : 'unknown'}`,
    `Tags: ${tags.length ? formatList(tags) : 'none'}`,
  ].filter(Boolean).join('\n');
}

/** Conservative heuristic: remove citation debris and *only* clearly generic DJ advice. */
export function cleanNotes(notes) {
  if (!notes?.trim()) return '';
  const stripped = notes
    .replace(/\[oai_citation:[^\]]+\]\(https?:\/\/\S+\)/gi, '')
    .replace(/\[oai_citation:[^\]]+\]/gi, '')
    // Sources in parentheses are citations, not musical descriptions.
    .replace(/\(\s*\[[^\]]+\]\(https?:\/\/\S+\)\s*\)?/gi, '')
    .replace(/\[([^\]]+)\]\(https?:\/\/\S+\)/gi, '$1')
    .replace(/\(https?:\/\/\S+\)/gi, '')
    .replace(/\(\s*\)/g, '');
  const sentences = stripped.match(/[^.!?]+[.!?]?/g) ?? [];
  return sentences
    .map((s) => s.trim())
    .filter((s) => s && !/\b(?:ideal|perfect|great|works well|best|fits|place|slot|use|transition|blend|mix)\b.{0,100}\b(?:set|dj|transition|crowd|dancefloor|track|block|energy)\b/i.test(s))
    .join(' ').replace(/\s+/g, ' ').trim();
}

export function variants(track, album) {
  const base = identityText(track, album);
  const raw = track.notes?.trim() || '';
  const clean = cleanNotes(raw);
  return {
    A: base,
    B: raw ? `${base}\nNotes: ${raw}` : base,
    C: clean ? `${base}\nNotes: ${clean}` : base,
  };
}

export function prepare(snapshot) {
  if (snapshot.schema_version !== 1 || !Array.isArray(snapshot.tracks) || !Array.isArray(snapshot.albums)) throw new Error('Invalid evaluation snapshot');
  const albums = new Map(snapshot.albums.map((a) => [`${a.friend_id}:${a.release_id}`, a]));
  const rows = snapshot.tracks.map((track) => ({
    track_id: track.track_id,
    friend_id: track.friend_id,
    has_notes: Boolean(track.notes?.trim()),
    text: variants(track, albums.get(`${track.friend_id}:${track.release_id}`)),
  }));
  if (rows.some((r) => r.friend_id !== snapshot.friend_id)) throw new Error('Snapshot contains another friend');
  return rows;
}

export function describe(rows) {
  const byVariant = Object.fromEntries(['A', 'B', 'C'].map((variant) => {
    const texts = rows.map((r) => r.text[variant]);
    const chars = texts.reduce((sum, t) => sum + t.length, 0);
    return [variant, { chars, approx_tokens: Math.ceil(chars / 4), distinct_texts: new Set(texts).size }];
  }));
  const incremental = rows.filter((r) => r.text.B !== r.text.A).length;
  const cleanDifferent = rows.filter((r) => r.text.C !== r.text.B).length;
  return { model: MODEL, tracks: rows.length, with_notes: incremental, cleaned_different: cleanDifferent,
    by_variant: byVariant, estimate_method: 'characters / 4; not tokenizer or billable usage',
    assumed_usd_per_million_tokens: 0.02,
    estimated_usd_without_caching: Object.values(byVariant).reduce((s, v) => s + v.approx_tokens * 0.02 / 1e6, 0),
  };
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => { const index = args.indexOf(name); return index === -1 ? null : args[index + 1]; };
  const input = flag('--snapshot');
  const output = flag('--output');
  if (!input) throw new Error('Usage: node evaluations/379/prepare.mjs --snapshot eval-data/379-friend-6.json [--output eval-data/379-texts.json]');
  const raw = readFileSync(input);
  const snapshot = JSON.parse(raw);
  const rows = prepare(snapshot);
  const report = { snapshot_sha256: createHash('sha256').update(raw).digest('hex'), ...describe(rows) };
  if (output) {
    writeFileSync(output, JSON.stringify({ snapshot_sha256: report.snapshot_sha256, model: MODEL, rows }), { flag: 'wx', mode: 0o600 });
    report.output = output;
  }
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
