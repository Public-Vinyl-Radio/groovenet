import { createInterface } from "node:readline/promises";
import type { GroovenetClient, PlannedEntry, SetDerivationView } from "@groovenet/client";
import chalk from "chalk";
import { consoleIO, describeTrack, formatClock, type SetsIO } from "./sets.js";

/**
 * `groovenet sets review` — accept or skip each way a set differed from its
 * plan, and correct the playlist to match (#282).
 *
 * Nothing is written until the end, after a summary and one more confirm. The
 * logic is split from the prompting: `changesFrom` lists what could change,
 * `applyChanges` turns a plan and the accepted changes into the new playlist,
 * and `runReview` only asks and writes.
 */

export type ReviewClient = Pick<
  GroovenetClient,
  "getSetDerivation" | "getPlaylistTracks" | "setPlaylistTracks"
>;

export type TrackRef = { track_id: string; friend_id: number };

export type Change =
  /** A different track on the planned record: replace it in its slot. */
  | { kind: "replace"; play: number; planned: PlannedEntry }
  /** Played but not in the plan: insert it after the slot played before it. */
  | { kind: "insert"; play: number; after: number | null }
  /** Planned but never played: remove it. */
  | { kind: "remove"; planned: PlannedEntry };

export interface ReviewOptions {
  playlist?: number;
  liveSet?: number;
  dryRun?: boolean;
}

/** Answers a yes/no/quit question; injected so a review can be scripted. */
export type Ask = (question: string) => Promise<string>;

const keyOf = (ref: TrackRef) => `${ref.track_id}\u0000${ref.friend_id}`;

/**
 * The plan as it was when the diff was computed. Every planned entry appears
 * in exactly one of the diff's lists — as planned, played instead of, or not
 * played — so it can be rebuilt without another request.
 */
export function planFrom(view: SetDerivationView): PlannedEntry[] {
  const diff = view.diff;
  if (!diff) return [];
  const byIndex = new Map<number, PlannedEntry>();
  for (const { planned } of diff.played_as_planned) byIndex.set(planned.index, planned);
  for (const { planned } of diff.played_instead_of) byIndex.set(planned.index, planned);
  for (const planned of diff.planned_not_played) byIndex.set(planned.index, planned);
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * Everything the review could change, replacements and insertions in the
 * order they were played, then removals in plan order.
 *
 * A track that came back in two stretches is one change, not two: the second
 * replacement of the same slot, or the second insertion of the same track,
 * would do nothing the first did not.
 */
export function changesFrom(view: SetDerivationView): Change[] {
  const diff = view.diff;
  if (!diff) return [];

  // Which plan slot each play landed in, to place an insertion after it.
  const slotOf = new Map<number, number>();
  for (const { play, planned } of diff.played_as_planned) slotOf.set(play, planned.index);
  for (const { play, planned } of diff.played_instead_of) slotOf.set(play, planned.index);

  const played: Array<Extract<Change, { play: number }>> = [];
  const replaced = new Set<number>();
  for (const { play, planned } of diff.played_instead_of) {
    if (replaced.has(planned.index)) continue;
    replaced.add(planned.index);
    played.push({ kind: "replace", play, planned });
  }

  const inserted = new Set<string>();
  for (const { play } of diff.played_not_planned) {
    const key = keyOf(view.tracklist[play]);
    if (inserted.has(key)) continue;
    inserted.add(key);
    let after: number | null = null;
    for (let j = play - 1; j >= 0; j--) {
      const slot = slotOf.get(j);
      if (slot !== undefined) {
        after = slot;
        break;
      }
    }
    played.push({ kind: "insert", play, after });
  }

  played.sort((a, b) => a.play - b.play);
  const removals: Change[] = diff.planned_not_played.map((planned) => ({ kind: "remove", planned }));
  return [...played, ...removals];
}

/**
 * The corrected playlist: the plan with accepted replacements swapped in,
 * accepted removals dropped, and accepted insertions placed after the slot
 * played before them — at the start when nothing planned came before.
 */
export function applyChanges(
  plan: PlannedEntry[],
  view: SetDerivationView,
  accepted: Change[]
): TrackRef[] {
  const replaceAt = new Map<number, TrackRef>();
  const removeAt = new Set<number>();
  const insertAfter = new Map<number | null, TrackRef[]>();

  for (const change of accepted) {
    if (change.kind === "replace") {
      const play = view.tracklist[change.play];
      replaceAt.set(change.planned.index, { track_id: play.track_id, friend_id: play.friend_id });
    } else if (change.kind === "remove") {
      removeAt.add(change.planned.index);
    } else {
      const play = view.tracklist[change.play];
      const list = insertAfter.get(change.after) ?? [];
      list.push({ track_id: play.track_id, friend_id: play.friend_id });
      insertAfter.set(change.after, list);
    }
  }

  const result: TrackRef[] = [...(insertAfter.get(null) ?? [])];
  for (const entry of plan) {
    if (!removeAt.has(entry.index)) {
      result.push(replaceAt.get(entry.index) ?? { track_id: entry.track_id, friend_id: entry.friend_id });
    }
    result.push(...(insertAfter.get(entry.index) ?? []));
  }
  return result;
}

/** One change, as the question put to the user. */
export function describeChange(change: Change, view: SetDerivationView, plan: PlannedEntry[]): string[] {
  if (change.kind === "replace") {
    const play = view.tracklist[change.play];
    return [
      `${chalk.magenta("⇄")} ${formatClock(play.start_seconds)}  ${describeTrack(play.track, play.track_id)}`,
      `    was planned as  ${describeTrack(change.planned, change.planned.track_id)} ${chalk.gray(`(slot ${change.planned.index + 1})`)}`,
      "    Replace it in the playlist?",
    ];
  }
  if (change.kind === "insert") {
    const play = view.tracklist[change.play];
    const before = change.after === null ? null : plan.find((e) => e.index === change.after);
    return [
      `${chalk.cyan("+")} ${formatClock(play.start_seconds)}  ${describeTrack(play.track, play.track_id)}  ${chalk.gray("not planned")}`,
      before
        ? `    Add it after  ${describeTrack(before, before.track_id)}?`
        : "    Add it at the start of the playlist?",
    ];
  }
  return [
    `${chalk.red("−")} ${describeTrack(change.planned, change.planned.track_id)}  ${chalk.gray("planned but not played")}`,
    ...(change.planned.fingerprinted
      ? []
      : [chalk.yellow("    Not fingerprinted — it may have been played and not recognised.")]),
    "    Remove it from the playlist?",
  ];
}

export function readlineAsk(): Ask {
  return async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  };
}

type Answer = "yes" | "no" | "quit";

function parseAnswer(raw: string): Answer | null {
  const answer = raw.trim().toLowerCase();
  if (answer === "y" || answer === "yes") return "yes";
  // Enter skips: a correction is written only when asked for.
  if (answer === "" || answer === "n" || answer === "no") return "no";
  if (answer === "q" || answer === "quit") return "quit";
  return null;
}

async function askUntilAnswered(ask: Ask, question: string, io: SetsIO): Promise<Answer> {
  for (;;) {
    const answer = parseAnswer(await ask(question));
    if (answer) return answer;
    io.log(chalk.gray("    y to accept, n (or Enter) to skip, q to stop reviewing"));
  }
}

const sameList = (a: TrackRef[], b: TrackRef[]) =>
  a.length === b.length && a.every((ref, i) => keyOf(ref) === keyOf(b[i]));

/**
 * One review, start to finish. Returns the exit code.
 *
 * `--dry-run` goes through the same questions and shows the resulting
 * playlist without writing it. Before a real write the playlist is read again
 * and the write is refused if it changed since the diff was computed, so a
 * review can never undo an edit made in the meantime.
 */
export async function runReview(
  client: ReviewClient,
  id: string,
  opts: ReviewOptions,
  ask: Ask,
  io: SetsIO = consoleIO
): Promise<number> {
  if (opts.playlist !== undefined && opts.liveSet !== undefined) {
    throw new Error("Choose --playlist or --live-set, not both");
  }
  if (opts.playlist === undefined && opts.liveSet === undefined) {
    throw new Error("Review needs the plan to correct: --playlist <id> or --live-set <id>");
  }

  const view = await client.getSetDerivation(id, { playlist_id: opts.playlist, live_set_id: opts.liveSet });
  if (view.derivation.status !== "processed" || !view.diff) {
    throw new Error(`Derivation ${id} is ${view.derivation.status}; there is nothing to review yet`);
  }
  const playlistId = view.diff.playlist_id;
  const plan = planFrom(view);
  const changes = changesFrom(view);

  if (changes.length === 0) {
    io.log(chalk.green(`Playlist ${playlistId} already matches what was played. Nothing to review.`));
    return 0;
  }

  io.log(chalk.bold(`Reviewing ${changes.length} difference(s) against playlist ${playlistId}`));
  const accepted: Change[] = [];
  for (const [i, change] of changes.entries()) {
    io.log("");
    const lines = describeChange(change, view, plan);
    io.log(chalk.gray(`[${i + 1}/${changes.length}] `) + lines[0]);
    lines.slice(1, -1).forEach((line) => io.log(line));
    const answer = await askUntilAnswered(ask, `${lines[lines.length - 1]} [y/N/q] `, io);
    if (answer === "quit") break;
    if (answer === "yes") accepted.push(change);
  }

  io.log("");
  if (accepted.length === 0) {
    io.log(chalk.gray("No changes accepted. The playlist is unchanged."));
    return 0;
  }

  const corrected = applyChanges(plan, view, accepted);
  const original = new Set(plan.map(keyOf));
  const names = new Map(view.tracklist.map((p) => [keyOf(p), p.track]));
  for (const entry of plan) names.set(keyOf(entry), entry);
  io.log(chalk.bold(`Playlist ${playlistId} with ${accepted.length} change(s):`));
  corrected.forEach((ref, i) => {
    const mark = original.has(keyOf(ref)) ? " " : chalk.green("*");
    io.log(`  ${mark} ${String(i + 1).padStart(2)}  ${describeTrack(names.get(keyOf(ref)) ?? null, ref.track_id)}`);
  });

  if (opts.dryRun) {
    io.log(chalk.gray("\n--dry-run: nothing written."));
    return 0;
  }

  const answer = await askUntilAnswered(ask, `\nWrite this to playlist ${playlistId}? [y/N] `, io);
  if (answer !== "yes") {
    io.log(chalk.gray("Not written. The playlist is unchanged."));
    return 0;
  }

  const current = (await client.getPlaylistTracks(playlistId)).track_refs.map(({ track_id, friend_id }) => ({
    track_id,
    friend_id,
  }));
  if (!sameList(current, plan)) {
    io.log(
      chalk.red(
        `Playlist ${playlistId} has changed since this diff was computed. Nothing written — run the review again.`
      )
    );
    return 1;
  }

  await client.setPlaylistTracks(playlistId, corrected);
  io.log(chalk.green(`✓ Playlist ${playlistId} updated: ${accepted.length} change(s).`));
  return 0;
}
