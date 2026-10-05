import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PLAIN, display, entries, openReview, progress, progressBar, queryContext, runReview, terminalStyle } from './review.mjs';

const sheet = () => ({ schema_version: 1, queries: [
  { id: 'q1', text: 'Cuban acoustic', candidates: [
    { track_id: 't1', friend_id: 6, title: 'Song', artist: 'Artist', album: 'Album', styles: ['Son'], genres: ['Latin'], judgment: 'relevant', reason: 'existing human judgment' },
    { track_id: 't2', friend_id: 6, title: 'Other', artist: 'Artist', album: 'Album', styles: [], genres: [], judgment: null, reason: '' },
    { track_id: 't3', friend_id: 6, title: 'Third', artist: 'Artist', album: 'Album', styles: [], genres: [], judgment: null, reason: '' },
  ] },
] });

async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'review-test-'));
  const file = join(dir, 'review.json');
  await writeFile(file, JSON.stringify(sheet()), { mode: 0o600 });
  try { await fn(file, dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function io(...answers) {
  const logs = [], calls = [];
  return { logs, calls, ask: async (prompt) => { calls.push(prompt); if (!answers.length) throw new Error('Unexpected prompt'); return answers.shift(); }, log: (line) => logs.push(line) };
}

test('resumes from first unreviewed, saves after each choice, preserves existing work', async () => fixture(async (file, dir) => {
  const prompts = io('u', '', 'u', 'Need to listen to the recording', 'n', 'q');
  const result = await runReview(file, prompts);
  const saved = JSON.parse(await readFile(file));
  assert.equal(saved.queries[0].candidates[0].reason, 'existing human judgment');
  assert.equal(saved.queries[0].candidates[1].judgment, 'uncertain');
  assert.equal(saved.queries[0].candidates[1].reason, 'Need to listen to the recording');
  assert.equal(saved.queries[0].candidates[2].judgment, 'not_relevant');
  assert.equal(result.unreviewed, 0);
  assert.match(prompts.logs[0], /2\/3/);
  assert.match(prompts.logs[0], /Cuban acoustic/);
  assert.match(prompts.logs[0], /Other/);
  assert.ok(result.backup);
  assert.deepEqual(JSON.parse(await readFile(result.backup)), sheet());
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(result.backup)).mode & 0o777, 0o600);
  assert.equal((await readdir(dir)).filter((name) => name.includes('.backup-')).length, 1);
}));

test('skipping, back, jumping and editing reason do not silently erase judgments', async () => fixture(async (file) => {
  const inputs = io('b', 'j 99', 'e', 'reviewed audio', 's', 'q');
  await runReview(file, inputs);
  const saved = JSON.parse(await readFile(file));
  assert.equal(saved.queries[0].candidates[0].judgment, 'relevant');
  assert.equal(saved.queries[0].candidates[0].reason, 'reviewed audio');
  assert.equal(saved.queries[0].candidates[1].judgment, null);
  assert.ok(inputs.logs.some((line) => line.includes('Choose a number from 1 to 3')));
}));

test('refuses external edits instead of overwriting them', async () => fixture(async (file) => {
  const session = await openReview(file);
  session.items[1].candidate.judgment = 'relevant';
  const external = sheet();
  external.queries[0].candidates[2].judgment = 'not_relevant';
  await writeFile(file, JSON.stringify(external));
  await assert.rejects(session.save(), /changed outside this session/);
  assert.equal(JSON.parse(await readFile(file)).queries[0].candidates[2].judgment, 'not_relevant');
}));

test('rejects malformed sheets, duplicate references and symlink paths', async () => fixture(async (file, dir) => {
  assert.throws(() => entries({}), /Not a #379 review sheet/);
  const duplicate = sheet();
  duplicate.queries[0].candidates.push({ ...duplicate.queries[0].candidates[0] });
  assert.throws(() => entries(duplicate), /Invalid or duplicate/);
  const alias = join(dir, 'link.json');
  await symlink(file, alias);
  await assert.rejects(openReview(alias), /regular file/);
  const invalid = sheet();
  invalid.queries[0].candidates[0].judgment = 'yes';
  await writeFile(file, JSON.stringify(invalid));
  await assert.rejects(openReview(file), /Invalid or duplicate/);
}));

test('completed sheets are not changed unless a start index is explicitly given', async () => fixture(async (file, dir) => {
  const complete = sheet();
  for (const candidate of complete.queries[0].candidates) candidate.judgment = 'relevant';
  await writeFile(file, JSON.stringify(complete));
  const result = await runReview(file, io());
  assert.equal(result.unreviewed, 0);
  assert.equal((await readdir(dir)).length, 1);
  await assert.rejects(runReview(file, io(), 5), /--start must be between/);
  const manual = io('n', 'q');
  await runReview(file, manual, 2);
  assert.equal(JSON.parse(await readFile(file)).queries[0].candidates[1].judgment, 'not_relevant');
}));

test('progress counts classified and unclassified entries', () => {
  assert.deepEqual(progress(entries(sheet())), { relevant: 1, not_relevant: 0, uncertain: 0, unreviewed: 2 });
});

// ─── display styling ──────────────────────────────────────────────────────────

/** A fake styleText that tags text instead of emitting ANSI codes. */
const tagStyle = (format, text) => `<${[format].flat().join('+')}>${text}</>`;

test('the plain display is unchanged text, with the query position when given', () => {
  const [item] = entries(sheet());
  const text = display(item, 0, 3, progress(entries(sheet())), PLAIN, { position: 1, count: 3, first: true });
  assert.match(text, /#379 blind review — 1\/3 \| 1 reviewed, 2 remaining/);
  assert.match(text, /── New query/);
  assert.match(text, /Query q1: Cuban acoustic {2}\(pair 1 of 3\)/);
  assert.match(text, /Current judgment: relevant \| Reason: existing human judgment/);
  assert.doesNotMatch(text, /</);
});

test('without context there is no divider or pair count', () => {
  const items = entries(sheet());
  const text = display(items[1], 1, 3, progress(items));
  assert.doesNotMatch(text, /New query|pair \d of/);
  assert.match(text, /Current judgment: unreviewed/);
});

test('terminal style colours the query, title, keys and each judgment', () => {
  const items = entries(sheet());
  const text = display(items[0], 0, 3, progress(items), terminalStyle(tagStyle), queryContext(items, 0));
  assert.match(text, /<bold\+cyan>Cuban acoustic<\/>/);
  assert.match(text, /<bold>Song<\/>/);
  assert.match(text, /<bold\+magenta>\[r\]<\/>/);
  assert.match(text, /<green>1 relevant<\/>/);
  assert.match(text, /<red>0 not relevant<\/>/);
  assert.match(text, /<yellow>0 uncertain<\/>/);
  assert.match(text, /Current judgment: <green>relevant<\/>/);
  assert.match(text, /<bold\+yellow>── New query/);
  // Never highlights query words inside the track's fields: it would bias a blind review.
  assert.doesNotMatch(text, /Styles: .*</);
  const unjudged = display(items[1], 1, 3, progress(items), terminalStyle(tagStyle));
  assert.match(unjudged, /Current judgment: <gray>unreviewed<\/>/);
});

test('terminal style defaults to util.styleText', () => {
  assert.equal(typeof terminalStyle().query('x'), 'string');
});

test('query context counts pairs within the query', () => {
  const items = entries({ schema_version: 1, queries: [
    { id: 'q1', text: 'a', candidates: [{ track_id: 't1', friend_id: 6, judgment: null, reason: '' }] },
    { id: 'q2', text: 'b', candidates: [
      { track_id: 't2', friend_id: 6, judgment: null, reason: '' },
      { track_id: 't3', friend_id: 6, judgment: null, reason: '' },
    ] },
  ] });
  assert.deepEqual(queryContext(items, 0), { position: 1, count: 1, first: true });
  assert.deepEqual(queryContext(items, 1), { position: 1, count: 2, first: true });
  assert.deepEqual(queryContext(items, 2), { position: 2, count: 2, first: false });
});

test('the progress bar fills in proportion', () => {
  assert.equal(progressBar(0, 4, 4), '[----]');
  assert.equal(progressBar(2, 4, 4), '[##--]');
  assert.equal(progressBar(4, 4, 4), '[####]');
  assert.equal(progressBar(0, 0, 4), '[----]');
});

test('the screen clears only when moving to another pair, so warnings stay visible', async () => fixture(async (file) => {
  const prompts = io('x', 's', 'q');
  let clears = 0;
  await runReview(file, { ...prompts, clear: () => { clears++; } });
  // Shown at pair 2, warning redraw at pair 2 (no clear), then pair 3.
  assert.equal(clears, 2);
  assert.ok(prompts.logs.some((line) => /Use r, n, u/.test(line)));
}));
