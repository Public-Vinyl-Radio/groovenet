import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldList, foldToken, foldedFields, textE, variants } from './variants.mjs';
import { describe, prepare } from './prepare.mjs';

const track = { track_id: 't1', friend_id: 6, release_id: 'r1', title: 'Song', artist: 'Artist', album: 'Album',
  year: 1974, composer: null, local_tags: 'Cumbia Amazónica, Trip‑hop / soul, warm-up, Rock & Roll', notes: 'ignored' };
const album = { friend_id: 6, release_id: 'r1', country: 'Peru', label: 'Infopesa, Discos Fuentes',
  genres: ['Latin', 'Folk, World, & Country'], styles: ['Cumbia', 'Chicha'] };

test('folding keeps accented letters, & and non-ASCII dashes as words', () => {
  assert.equal(foldToken('Cumbia Amazónica'), 'cumbia amazonica');
  assert.equal(foldToken('Jazz‑Rock'), 'jazz rock');
  assert.equal(foldToken('Trip-Hop'), 'trip hop');
  assert.equal(foldToken('Rock & Roll'), 'rock and roll');
  assert.equal(foldToken(' --- '), '');
});

test('lists split on , / ; | and unwrap a Postgres array literal', () => {
  assert.deepEqual(foldList('Soul / funk; Jazz|Soul'), ['soul', 'funk', 'jazz']);
  assert.deepEqual(foldList('{}'), []);
  assert.deepEqual(foldList('{"Trip hop",Trip-Hop}'), ['trip hop']);
  assert.deepEqual(foldList(['a', 3, null]), ['a']);
  assert.deepEqual(foldList(null), []);
});

test('folded fields keep Discogs genres whole, drop DJ-function tags and sort', () => {
  const f = foldedFields(track, album);
  assert.deepEqual(f.genres, ['folk world and country', 'latin']);
  assert.deepEqual(f.tags, ['cumbia amazonica', 'rock and roll', 'soul', 'trip hop']);
  assert.deepEqual(f.labels, ['discos fuentes', 'infopesa']);
  assert.equal(f.country, 'peru');
  assert.equal(f.era, '1970s');
  assert.equal(foldedFields({ ...track, local_tags: null }, undefined).country, 'unknown-country');
});

test('each variant has its documented shape', () => {
  const v = variants(track, album);
  assert.match(v.A, /^Track: Song — Artist\nRelease: Album \(1970s\)/);
  // A follows the app's builder; since #407 the app folds accents too.
  assert.match(v.A, /Tags: .*cumbia amazonica/, 'A tracks the app normalization');
  assert.match(v.A2, /Tags: cumbia amazonica, rock and roll, soul, trip hop$/);
  assert.doesNotMatch(v.D, /Song|Artist|Album|infopesa/);
  assert.match(v.D, /^Era: 1970s\nCountry: peru\n/);
  assert.equal(v.E, 'chicha, cumbia, cumbia amazonica, rock and roll, soul, trip hop. folk world and country, latin music from the 1970s.');
  assert.doesNotMatch(v.E, /peru/);
  assert.ok(v.F.startsWith(`${v.E}\nTrack: Song — Artist\nRelease: Album\nLabels: `));
  assert.match(variants({ ...track, composer: 'Steve Reich' }, album).A2, /Composer: steve reich/);
});

test('E degrades gracefully without descriptors, genres or era', () => {
  const f = { styles: [], tags: [], genres: [], era: 'unknown-era' };
  assert.equal(textE(f), 'music.');
  assert.equal(textE({ ...f, genres: ['latin'] }), 'latin music.');
  assert.equal(textE({ ...f, tags: ['salsa', 'salsa'] }), 'salsa. music.');
});

test('prepare joins albums, rejects foreign friends and describes without text', () => {
  const snapshot = { schema_version: 1, friend_id: 6, tracks: [track], albums: [album] };
  const rows = prepare(snapshot);
  assert.equal(rows[0].text.A2, variants(track, album).A2);
  assert.equal(describe(rows).E.distinct_texts, 1);
  assert.throws(() => prepare({ ...snapshot, friend_id: 7 }), /another friend/);
  assert.throws(() => prepare({ schema_version: 2 }), /Invalid evaluation snapshot/);
});
