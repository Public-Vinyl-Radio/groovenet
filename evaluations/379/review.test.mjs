import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { entries, openReview, progress, runReview } from './review.mjs';

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
