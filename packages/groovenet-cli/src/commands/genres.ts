import { Command, InvalidArgumentError } from "commander";
import { loadConfig } from "@groovenet/client";
import type {
  GroovenetClient,
  GenreProposal,
  GenreProposalQuery,
  GenreReconciliationCoverage,
  GenreReconciliationRequest,
  GenreReconciliationRun,
} from "@groovenet/client";
import chalk from "chalk";
import Table from "cli-table3";
import { printError } from "../output.js";
import { boundedIntOption, intOption } from "../options.js";
import { consoleIO, makeClient, type FingerprintLibraryIO } from "./fingerprintLibrary.js";
import { readlineAsk } from "./setsReview.js";
import {
  formatApplySummary,
  rawKeyReader,
  runReview,
  type KeyReader,
  type ReviewClient,
} from "./genresReview.js";

/**
 * `groovenet genres` — reconciling free-text local_tags onto the taxonomy
 * (#372). `reconcile` starts a run on the server and polls it; the app does
 * the splitting, matching and AI calls, so the OpenAI key never leaves it.
 * Reviewing proposals quickly is #373; `proposals` is the plain listing.
 */

export type GenresIO = FingerprintLibraryIO;

export type ReconcileClient = Pick<
  GroovenetClient,
  "startGenreReconciliation" | "getGenreReconciliationRun" | "getGenreReconciliationCoverage"
>;

/** Which friend's tracks a command covers. */
export interface FriendScopeOptions {
  friendId?: number;
  allFriends?: boolean;
}

/**
 * `--friend-id`, else the configured `default_friend_id`, else everyone.
 * `--all-friends` always means everyone; giving both is an error.
 */
export function resolveFriendId(
  opts: FriendScopeOptions,
  defaultFriendId: number | undefined = loadConfig().default_friend_id
): number | undefined {
  if (opts.allFriends && opts.friendId !== undefined) {
    throw new Error("Choose --friend-id or --all-friends, not both");
  }
  if (opts.allFriends) return undefined;
  return opts.friendId ?? defaultFriendId;
}

export interface ReconcileOptions extends FriendScopeOptions {
  ai?: boolean;
  newGenreMinTracks?: number;
  limit?: number;
  refresh?: boolean;
  wait?: boolean;
  pollInterval?: number;
  json?: boolean;
}

export function toRequest(opts: ReconcileOptions, friendId?: number): GenreReconciliationRequest {
  const request: GenreReconciliationRequest = {};
  if (friendId !== undefined) request.friend_id = friendId;
  if (opts.ai === false) request.ai = false;
  if (opts.newGenreMinTracks !== undefined) request.new_genre_min_tracks = opts.newGenreMinTracks;
  if (opts.limit !== undefined) request.limit = opts.limit;
  if (opts.refresh) request.refresh = true;
  return request;
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

/** `mapping  80/120 values  $0.0123` — one line, rewritten in place. */
export function formatRunProgress(run: GenreReconciliationRun): string {
  const toSend = run.distinct_values - run.exact_matches - run.kept - run.ai_pending;
  const done = run.ai_proposed + run.ai_failed;
  return `  mapping  ${done}/${Math.max(toSend, 0)} values  $${run.cost_usd.toFixed(4)}`;
}

export function formatRunSummary(run: GenreReconciliationRun): string[] {
  const lines = [
    `  ${run.distinct_values} distinct values`,
    chalk.green(`  = ${run.exact_matches} exact matches`),
    `  ~ ${run.ai_proposed} proposed by ${run.model ?? "AI"}` +
      (run.ai_failed ? chalk.red(`, ${run.ai_failed} failed`) : ""),
    chalk.gray(`  · ${run.kept} kept from earlier runs`),
  ];
  if (run.ai_pending) lines.push(chalk.yellow(`  … ${run.ai_pending} not sent to the model this run`));
  if (run.ai_batches) {
    lines.push(chalk.gray(
      `  ${run.ai_batches} batches, ${run.input_tokens} in / ${run.output_tokens} out tokens, $${run.cost_usd.toFixed(4)}`
    ));
  }
  if (run.error) lines.push(chalk.red(`  ✗ ${run.error}`));
  return lines;
}

const scopeLabel = (friendId?: number) => (friendId === undefined ? "all friends" : `friend ${friendId}`);

export function formatCoverage(coverage: GenreReconciliationCoverage, friendId?: number): string[] {
  const { tracks, values } = coverage;
  return [
    chalk.bold("Coverage") + chalk.gray(` — ${scopeLabel(friendId)}`),
    `  exact matches  ${values.exact}/${values.distinct} values (${percent(values.exact_share)})`,
    `  proposals      ${values.by_status.pending} pending, ${values.by_status.accepted} accepted, ` +
      `${values.by_status.edited} edited, ${values.by_status.rejected} rejected`,
    `  tracks         ${tracks.with_genres} with genres, ${tracks.descriptors_only} descriptors only, ` +
      `${tracks.no_genre} no genre, ${tracks.unresolved} unresolved — of ${tracks.with_local_tags}`,
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForReconciliation(
  client: Pick<GroovenetClient, "getGenreReconciliationRun">,
  runId: string,
  opts: { pollIntervalMs: number; onProgress?: (run: GenreReconciliationRun) => void }
): Promise<GenreReconciliationRun> {
  for (;;) {
    const run = await client.getGenreReconciliationRun(runId);
    opts.onProgress?.(run);
    if (run.status !== "running") return run;
    await sleep(opts.pollIntervalMs);
  }
}

/** One `genres reconcile`, start to finish. Returns the exit code. */
export async function runReconcile(
  client: ReconcileClient,
  opts: ReconcileOptions,
  io: GenresIO = consoleIO
): Promise<number> {
  const friendId = resolveFriendId(opts);
  const started = await client.startGenreReconciliation(toRequest(opts, friendId));

  if (opts.wait === false) {
    if (opts.json) io.write(JSON.stringify(started, null, 2) + "\n");
    else io.log(chalk.gray(`Reconciliation run ${started.id} started`));
    return 0;
  }

  if (!opts.json) {
    io.log(chalk.bold("Reconciling local_tags") + chalk.gray(` — ${scopeLabel(friendId)}, run ${started.id}`));
  }
  const finished = await waitForReconciliation(client, started.id, {
    pollIntervalMs: opts.pollInterval ?? 2000,
    onProgress: (run) => {
      if (!opts.json && run.ai_batches > 0) io.write(`\r${formatRunProgress(run)}`);
    },
  });
  const coverage = await client.getGenreReconciliationCoverage(friendId);
  const failed = finished.status === "failed" ? 1 : 0;

  if (opts.json) {
    io.write(JSON.stringify({ run: finished, coverage }, null, 2) + "\n");
    return failed;
  }
  io.write("\r\x1b[2K");
  for (const line of formatRunSummary(finished)) io.log(line);
  for (const line of formatCoverage(coverage, friendId)) io.log(line);
  return failed;
}

/** What a proposal would do, in a few words. */
export function describeProposal(proposal: GenreProposal): string {
  switch (proposal.action) {
    case "map":
      return proposal.target_genres
        .map((g) => (g.parent_name ? `${g.name} (${g.parent_name})` : g.name))
        .join(", ") || chalk.red("(targets gone)");
    case "new_genre":
      return chalk.magenta(`new: ${proposal.proposed_genre_name ?? "?"}`) +
        chalk.gray(` under ${proposal.proposed_parent_name ?? "?"}`);
    case "descriptor":
      return chalk.cyan("descriptor");
    case "drop":
      return chalk.gray("drop");
  }
}

export function renderProposals(proposals: GenreProposal[], total: number, offset: number): string {
  if (proposals.length === 0) return chalk.yellow("No proposals found.");
  const table = new Table({
    head: ["Value", "Tracks", "Proposal", "Conf", "Method", "Status"].map((h) => chalk.cyan(h)),
    colWidths: [30, 8, 40, 6, 8, 10],
    wordWrap: true,
  });
  for (const p of proposals) {
    table.push([
      p.value_normalized,
      p.track_count,
      describeProposal(p),
      p.confidence === null ? "-" : p.confidence.toFixed(2),
      p.method,
      p.status,
    ]);
  }
  const shown = `${offset + 1}-${offset + proposals.length} of ${total}`;
  return `${table.toString()}\n${chalk.gray(shown)}`;
}

function enumOption<T extends string>(allowed: readonly T[]) {
  return (value: string): T => {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new InvalidArgumentError(`expected one of ${allowed.join(", ")}`);
    }
    return value as T;
  };
}

export async function runProposals(
  client: Pick<GroovenetClient, "listGenreProposals">,
  query: GenreProposalQuery & { json?: boolean },
  io: GenresIO = consoleIO
): Promise<number> {
  const { json, ...filter } = query;
  const result = await client.listGenreProposals(filter);
  if (json) io.write(JSON.stringify(result, null, 2) + "\n");
  else io.log(renderProposals(result.proposals, result.total, filter.offset ?? 0));
  return 0;
}

export async function runCoverage(
  client: Pick<GroovenetClient, "getGenreReconciliationCoverage">,
  opts: FriendScopeOptions & { json?: boolean },
  io: GenresIO = consoleIO
): Promise<number> {
  const friendId = resolveFriendId(opts);
  const coverage = await client.getGenreReconciliationCoverage(friendId);
  if (opts.json) io.write(JSON.stringify(coverage, null, 2) + "\n");
  else for (const line of formatCoverage(coverage, friendId)) io.log(line);
  return 0;
}

export interface ApplyOptions extends FriendScopeOptions {
  yes?: boolean;
  json?: boolean;
}

/**
 * `genres apply`: writes every accepted and edited proposal to tracks. Asks
 * first unless `--yes`, and refuses to guess without a terminal to ask on.
 */
export async function runApply(
  client: Pick<GroovenetClient, "applyGenreProposals">,
  opts: ApplyOptions,
  readKey: KeyReader,
  isTTY: boolean,
  io: GenresIO = consoleIO
): Promise<number> {
  const friendId = resolveFriendId(opts);
  if (!opts.yes) {
    if (!isTTY) throw new Error("Applying writes track genres: pass --yes to apply without a terminal");
    const answer = await readKey(`Apply all approved proposals to ${scopeLabel(friendId)}'s tracks? [y/N] `);
    if (answer !== "y") {
      io.log(chalk.gray("Nothing applied."));
      return 0;
    }
  }
  const result = await client.applyGenreProposals(undefined, friendId);
  if (opts.json) io.write(JSON.stringify(result, null, 2) + "\n");
  else for (const line of formatApplySummary(result)) io.log(line);
  return 0;
}

export interface ReviewCommandOptions extends FriendScopeOptions {
  minTracks?: number;
  method?: "ai" | "exact";
  autoAcceptExact?: boolean;
  examples?: number;
}

/** Review is interactive only: a terminal, single keys, no JSON. */
export async function runReviewCommand(
  client: ReviewClient,
  opts: ReviewCommandOptions,
  isTTY: boolean,
  readKey: KeyReader = rawKeyReader(),
  ask = readlineAsk(),
  io: GenresIO = consoleIO
): Promise<number> {
  if (!isTTY) throw new Error("Review is interactive: run it in a terminal");
  const { allFriends: _all, friendId: _friend, ...rest } = opts;
  return runReview(client, { ...rest, friendId: resolveFriendId(opts) }, readKey, ask, io);
}

async function action(run: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await run();
  } catch (err: unknown) {
    printError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export function addGenresCommands(program: Command): void {
  const genres = program.command("genres").description("Genre taxonomy and local_tags reconciliation");

  genres
    .command("reconcile")
    .description("Propose taxonomy mappings for every local_tags value (exact matches, then AI)")
    .option("--no-ai", "Exact matches only; no model calls")
    .option("--new-genre-min-tracks <n>", "Fewest tracks before AI may propose a new genre", boundedIntOption(1))
    .option("--limit <n>", "Most values to send to the model this run", boundedIntOption(1))
    .option("--refresh", "Re-ask the model for values with a pending AI proposal")
    .option("--friend-id <n>", "Only this friend's tracks (defaults to config default_friend_id)", boundedIntOption(1))
    .option("--all-friends", "Every friend's tracks")
    .option("--no-wait", "Start the run and exit")
    .option("--poll-interval <ms>", "How often to poll progress", intOption, 2000)
    .option("--json", "Output as JSON")
    .action((opts: ReconcileOptions) => action(() => runReconcile(makeClient(), opts)));

  genres
    .command("proposals")
    .description("List reconciliation proposals, most-used values first")
    .option("--status <status>", "pending | accepted | rejected | edited", enumOption(["pending", "accepted", "rejected", "edited"] as const))
    .option("--action <action>", "map | new_genre | descriptor | drop", enumOption(["map", "new_genre", "descriptor", "drop"] as const))
    .option("--method <method>", "exact | ai | manual", enumOption(["exact", "ai", "manual"] as const))
    .option("--limit <n>", "Page size (max 500)", boundedIntOption(1), 50)
    .option("--offset <n>", "Skip this many", boundedIntOption(0), 0)
    .option("--json", "Output as JSON")
    .action((opts: GenreProposalQuery & { json?: boolean }) => action(() => runProposals(makeClient(), opts)));

  genres
    .command("review")
    .description("Accept, remap or drop proposals, a group at a time, with single keys")
    .option("--friend-id <n>", "Only this friend's tracks (defaults to config default_friend_id)", boundedIntOption(1))
    .option("--all-friends", "Every friend's tracks")
    .option("--min-tracks <n>", "Only values on at least this many tracks", boundedIntOption(0), 1)
    .option("--method <method>", "ai | exact", enumOption(["ai", "exact"] as const))
    .option("--auto-accept-exact", "Accept every pending exact match before reviewing")
    .option("--examples <n>", "Example tracks shown per group", boundedIntOption(0), 3)
    .action((opts: ReviewCommandOptions) =>
      action(() => runReviewCommand(makeClient(), opts, Boolean(process.stdin.isTTY)))
    );

  genres
    .command("apply")
    .description("Write accepted and edited proposals to track genres, descriptors and aliases")
    .option("--friend-id <n>", "Only this friend's tracks (defaults to config default_friend_id)", boundedIntOption(1))
    .option("--all-friends", "Every friend's tracks")
    .option("--yes", "Apply without asking")
    .option("--json", "Output as JSON")
    .action((opts: ApplyOptions) =>
      action(() => runApply(makeClient(), opts, rawKeyReader(), Boolean(process.stdin.isTTY)))
    );

  genres
    .command("coverage")
    .description("How much of the local_tags backlog is reconciled")
    .option("--friend-id <n>", "Only this friend's tracks (defaults to config default_friend_id)", boundedIntOption(1))
    .option("--all-friends", "Every friend's tracks")
    .option("--json", "Output as JSON")
    .action((opts: FriendScopeOptions & { json?: boolean }) => action(() => runCoverage(makeClient(), opts)));
}
