import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanNotes, describe, identityText, prepare, variants } from './prepare.mjs';

const track = { track_id: 't1', friend_id: 6, release_id: 'r1', title: 'Song', artist: 'Artist', album: 'Album', year: 1974, composer: 'A. Smith', local_tags: 'cumbia, warmup', notes: 'Organ-driven jungle cumbia. Ideal for transitions during your set. [oai_citation:0‡Source](https://example.com)' };
const album = { friend_id: 6, release_id: 'r1', country: 'Peru', label: 'Producciones Lorena', genres: ['Latin'], styles: ['Cumbia'] };

test('identity matches the app builder template and normalization choices', () => {
  assert.equal(identityText(track, album), [
    'Track: Song — Artist', 'Release: Album (1970s)', 'Composer: a smith',
    'Country: peru', 'Labels: producciones lorena', 'Genres: latin',
    'Styles: cumbia', 'Tags: cumbia',
  ].join('\n'));
  assert.match(identityText({ title: '', artist: '', album: '' }), /Country: unknown-country/);
});

test('cleaning removes citations and generic advice but keeps descriptive facts', () => {
  assert.equal(cleanNotes(track.notes), 'Organ-driven jungle cumbia.');
  assert.equal(cleanNotes('Organ with surf guitar (https://example.com). [Artist](https://example.com) from Iquitos.'), 'Organ with surf guitar . Artist from Iquitos.');
  assert.equal(cleanNotes(null), '');
});

test('variants retain the baseline when no notes exist', () => {
  const a = variants(track, album);
  assert.match(a.B, /Notes: Organ-driven/);
  assert.match(a.C, /Notes: Organ-driven jungle cumbia\./);
  assert.equal(a.A.includes('Notes:'), false);
  const empty = variants({ ...track, notes: null }, album);
  assert.equal(empty.A, empty.B);
  assert.equal(empty.B, empty.C);
});

test('preparation joins album metadata and restricts to one friend', () => {
  const snapshot = { schema_version: 1, friend_id: 6, tracks: [track], albums: [album] };
  const rows = prepare(snapshot);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].has_notes, true);
  assert.match(rows[0].text.A, /Country: peru/);
  const report = describe(rows);
  assert.equal(report.tracks, 1);
  assert.equal(report.with_notes, 1);
  assert.equal(report.cleaned_different, 1);
  assert.ok(report.estimated_usd_without_caching > 0);
  assert.throws(() => prepare({ ...snapshot, schema_version: 2 }), /Invalid evaluation snapshot/);
  assert.throws(() => prepare({ ...snapshot, tracks: [{ ...track, friend_id: 7 }] }), /another friend/);
});
