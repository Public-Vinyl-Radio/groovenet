#!/usr/bin/env node
/** Local variant-blind, resumable terminal reviewer for #379. No network calls. */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { styleText } from 'node:util';

const VALID = new Set([null, 'relevant', 'not_relevant', 'uncertain']);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function entries(sheet) {
  if (sheet?.schema_version !== 1 || !Array.isArray(sheet.queries) || !sheet.queries.length) {
    throw new Error('Not a #379 review sheet');
  }
  const seen = new Set();
  return sheet.queries.flatMap((query) => {
    if (typeof query.id !== 'string' || typeof query.text !== 'string' || !Array.isArray(query.candidates)) {
      throw new Error('Invalid review query');
    }
    return query.candidates.map((candidate) => {
      const key = `${query.id}:${candidate.friend_id}:${candidate.track_id}`;
      if (seen.has(key) || !VALID.has(candidate.judgment ?? null) || typeof candidate.reason !== 'string') {
        throw new Error(`Invalid or duplicate review candidate ${key}`);
      }
      seen.add(key);
      return { query, candidate };
    });
  });
}

export function progress(items) {
  const counts = { relevant: 0, not_relevant: 0, uncertain: 0, unreviewed: 0 };
  for (const { candidate } of items) counts[candidate.judgment ?? 'unreviewed']++;
  return counts;
}

const identity = (text) => text;

/** No colour: tests, pipes, NO_COLOR. */
export const PLAIN = { query: identity, title: identity, dim: identity, key: identity, notice: identity,
  judgment: (_judgment, text) => text };

const JUDGMENT_COLORS = { relevant: 'green', not_relevant: 'red', uncertain: 'yellow' };

/**
 * Terminal colours via `util.styleText`, which drops them for NO_COLOR, a
 * dumb terminal or redirected output. Deliberately no highlighting of query
 * words in the track fields: it would nudge a blind judgment toward relevant.
 */
export function terminalStyle(style = styleText) {
  return {
    query: (text) => style(['bold', 'cyan'], text),
    title: (text) => style('bold', text),
    dim: (text) => style('dim', text),
    key: (text) => style(['bold', 'magenta'], text),
    notice: (text) => style(['bold', 'yellow'], text),
    judgment: (judgment, text) => style(JUDGMENT_COLORS[judgment] ?? 'gray', text),
  };
}

export function progressBar(done, total, width = 24) {
  const filled = total ? Math.round((done / total) * width) : 0;
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

/** Where an item sits within its query: `{ position, count, first }`. */
export function queryContext(items, index) {
  const id = items[index].query.id;
  const siblings = items.map((item, i) => (item.query.id === id ? i : -1)).filter((i) => i >= 0);
  return { position: siblings.indexOf(index) + 1, count: siblings.length, first: siblings[0] === index };
}

export function display(item, index, total, counts, style = PLAIN, context) {
  const { query, candidate: c } = item;
  const s = style;
  const reviewed = counts.relevant + counts.not_relevant + counts.uncertain;
  const tally = [
    s.judgment('relevant', `${counts.relevant} relevant`),
    s.judgment('not_relevant', `${counts.not_relevant} not relevant`),
    s.judgment('uncertain', `${counts.uncertain} uncertain`),
    s.dim(`${counts.unreviewed} remaining`),
  ].join(' · ');
  const judgment = c.judgment ?? 'unreviewed';
  return [
    `#379 blind review — ${index + 1}/${total} | ${reviewed} reviewed, ${counts.unreviewed} remaining`,
    `${s.dim(progressBar(reviewed, total))} ${tally}`,
    '',
    ...(context?.first ? [s.notice(`── New query ${'─'.repeat(40)}`)] : []),
    `Query ${query.id}: ${s.query(query.text)}${context ? s.dim(`  (pair ${context.position} of ${context.count})`) : ''}`,
    '',
    `Track: ${s.title(c.title)} — ${c.artist}`,
    `Album: ${c.album}${c.year ? ` (${c.year})` : ''}`,
    `Styles: ${(c.styles ?? []).join(', ') || '—'}`,
    `Genres: ${(c.genres ?? []).join(', ') || '—'}`,
    s.dim(`Reference: ${c.friend_id}:${c.track_id}`),
    `Current judgment: ${s.judgment(c.judgment, judgment)}${c.reason ? ` | Reason: ${c.reason}` : ''}`,
    '',
    `${s.key('[r]')} relevant  ${s.key('[n]')} not relevant  ${s.key('[u]')} uncertain (reason required)`,
    `${s.key('[s]')} skip/next  ${s.key('[b]')} back  ${s.key('[j NUMBER]')} jump  ${s.key('[e]')} edit reason  ${s.key('[q]')} save & quit`,
  ].join('\n');
}

/** Save only if the file still equals the version loaded at the last save. */
export async function openReview(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Review path must be a regular file, not a symlink');
  let original = await readFile(file);
  const sheet = JSON.parse(original.toString('utf8'));
  const items = entries(sheet);
  let expected = digest(original);
  let backup = null;
  return {
    sheet, items,
    get backup() { return backup; },
    async save() {
      const current = await readFile(file);
      if (digest(current) !== expected) throw new Error('Review file changed outside this session; refusing to overwrite. Quit and rerun to reload your edits.');
      if (!backup) {
        backup = `${file}.backup-${Date.now()}-${randomUUID()}`;
        // A one-time private backup of the exact initial state. Retain it on exit.
        await writeFile(backup, original, { flag: 'wx', mode: 0o600 });
      }
      const next = Buffer.from(JSON.stringify(sheet, null, 2) + '\n');
      const temp = `${file}.tmp-${randomUUID()}`;
      try {
        await writeFile(temp, next, { flag: 'wx', mode: 0o600 });
        // Re-check just before replacement in case an editor changed it mid-save.
        if (digest(await readFile(file)) !== expected) throw new Error('Review file changed outside this session; refusing to overwrite.');
        await rename(temp, file);
        expected = digest(next);
        original = next;
      } finally {
        await rm(temp, { force: true });
      }
    },
  };
}

/** ask/log are injected so the full review loop can be exercised without a TTY. */
export async function runReview(file, { ask, log, style = PLAIN, clear }, startAt) {
  const session = await openReview(file);
  const { items } = session;
  let index = startAt === undefined ? items.findIndex(({ candidate }) => candidate.judgment == null) : startAt - 1;
  if (index === -1) {
    log('All candidates have judgments. Use --start NUMBER to revisit one.');
    return { ...progress(items), backup: null };
  }
  if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error(`--start must be between 1 and ${items.length}`);
  let shown = -1;
  for (;;) {
    // Clear only on moving to another pair, so a warning stays above the redraw.
    if (index !== shown) clear?.();
    shown = index;
    log(display(items[index], index, items.length, progress(items), style, queryContext(items, index)));
    const command = (await ask('Choice: ')).trim().toLowerCase();
    if (command === 'q') break;
    if (command === 'b') { index = Math.max(0, index - 1); continue; }
    if (command === 's' || command === '') { index = Math.min(items.length - 1, index + 1); continue; }
    if (/^j\s+\d+$/.test(command)) {
      const n = Number(command.slice(1).trim());
      if (n < 1 || n > items.length) log(`Choose a number from 1 to ${items.length}.`);
      else index = n - 1;
      continue;
    }
    if (command === 'e') {
      const reason = await ask('Reason (empty clears it): ');
      items[index].candidate.reason = reason.trim();
      await session.save();
      continue;
    }
    const judgment = { r: 'relevant', n: 'not_relevant', u: 'uncertain' }[command];
    if (!judgment) { log('Use r, n, u, s, b, j NUMBER, e, or q.'); continue; }
    let reason = items[index].candidate.reason;
    if (judgment === 'uncertain') {
      reason = (await ask('Why uncertain? ')).trim();
      if (!reason) { log('Uncertain requires a reason; nothing saved.'); continue; }
    }
    items[index].candidate.judgment = judgment;
    items[index].candidate.reason = reason;
    await session.save();
    if (index === items.length - 1) { log('End of review sheet; use b/j to revisit, or q to quit.'); continue; }
    index++;
  }
  return { ...progress(items), backup: session.backup };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const file = flag('--file');
  const startAt = flag('--start') === undefined ? undefined : Number(flag('--start'));
  if (!file || !stdin.isTTY || !stdout.isTTY) {
    console.error('Usage (interactive terminal): node evaluations/379/review.mjs --file eval-data/379-review.json [--start NUMBER]');
    process.exitCode = 1;
  } else {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const summary = await runReview(file, {
        ask: (question) => rl.question(question),
        log: (text) => console.log(`\n${text}\n`),
        style: terminalStyle(),
        clear: () => console.clear(),
      }, startAt);
      console.log(`Saved: ${summary.relevant} relevant, ${summary.not_relevant} not relevant, ${summary.uncertain} uncertain; ${summary.unreviewed} remaining.`);
      if (summary.backup) console.log(`Initial file backed up at ${summary.backup}`);
    } catch (err) { console.error(err.message); process.exitCode = 1; }
    finally { rl.close(); }
  }
}
