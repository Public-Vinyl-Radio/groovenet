import type {
  GroovenetClient,
  GenreProposal,
  GenreProposalApplyResult,
  GenreProposalDecision,
  GenreProposalQuery,
  GenreProposalSnapshot,
  GenreTreeNode,
} from "@groovenet/client";
import chalk from "chalk";
import type { Ask } from "./setsReview.js";
import type { GenresIO } from "./genres.js";

/**
 * `groovenet genres review` (#373): getting through reconciliation proposals
 * fast. Proposals are grouped by what they would do — every value mapping to
 * Cumbia is one question — and the biggest groups come first, so the first
 * minutes cover most tracks. One key decides a whole group, decisions are
 * written as they are made (quit and come back), and `u` undoes the last one,
 * group and all.
 *
 * The logic is kept apart from the terminal: `groupProposals`,
 * `searchTaxonomy` and `decisionsFor` are pure, and `runReview` takes its
 * key reader and line reader as arguments so a whole session can be scripted.
 */

/** Reads one keypress: a lowercase letter or digit, or "enter" / "esc". */
export type KeyReader = (prompt: string) => Promise<string>;

export type ReviewClient = Pick<
  GroovenetClient,
  | "listGenreProposals"
  | "decideGenreProposals"
  | "restoreGenreProposals"
  | "getGenreProposalTracks"
  | "getGenres"
  | "applyGenreProposals"
>;

export interface GenresReviewOptions {
  friendId?: number;
  minTracks?: number;
  method?: "ai" | "exact";
  autoAcceptExact?: boolean;
  examples?: number;
}

export type ProposalGroup = {
  key: string;
  label: string;
  proposals: GenreProposal[];
  trackCount: number;
};

export type TaxonomyEntry = { id: string; name: string; parent_name: string | null };

/** The decisions endpoint takes at most this many per request. */
const BATCH = 500;
const MAX_VALUES_SHOWN = 6;

const genreLabel = (g: { name: string; parent_name: string | null }) =>
  g.parent_name ? `${g.name} (${g.parent_name})` : g.name;

/** What a proposal would do; proposals doing the same thing share a group. */
export function groupOf(p: GenreProposal): { key: string; label: string } {
  switch (p.action) {
    case "map":
      return {
        key: `map:${[...p.target_genre_ids].sort().join(",")}`,
        label: p.target_genres.map(genreLabel).join(", ") || "(targets gone)",
      };
    case "new_genre":
      return {
        key: `new:${(p.proposed_genre_name ?? "").trim().toLowerCase()}|${p.proposed_parent_id ?? ""}`,
        label: `new genre ${p.proposed_genre_name?.trim() || "?"} under ${p.proposed_parent_name ?? "?"}`,
      };
    case "descriptor":
      return { key: "descriptor", label: "descriptor (mood or description, not a genre)" };
    case "drop":
      return { key: "drop", label: "drop (no genre)" };
  }
}

/** Groups by what the proposals would do, most tracks first. */
export function groupProposals(proposals: GenreProposal[]): ProposalGroup[] {
  const groups = new Map<string, ProposalGroup>();
  for (const p of proposals) {
    const { key, label } = groupOf(p);
    const group = groups.get(key) ?? { key, label, proposals: [], trackCount: 0 };
    group.proposals.push(p);
    group.trackCount += p.track_count;
    groups.set(key, group);
  }
  for (const group of groups.values()) group.proposals.sort((a, b) => b.track_count - a.track_count);
  return [...groups.values()].sort((a, b) => b.trackCount - a.trackCount || a.label.localeCompare(b.label));
}

/** One group per value, for deciding a group's values one by one. */
export function splitGroup(group: ProposalGroup): ProposalGroup[] {
  return group.proposals.map((p) => ({
    key: `${group.key}#${p.id}`,
    label: group.label,
    proposals: [p],
    trackCount: p.track_count,
  }));
}

export function flattenTaxonomy(nodes: GenreTreeNode[], parent: string | null = null): TaxonomyEntry[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, parent_name: parent },
    ...flattenTaxonomy(node.children, node.name),
  ]);
}

const fold = (value: string) =>
  value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const c of haystack) if (c === needle[i]) i += 1;
  return i === needle.length;
}

/**
 * Taxonomy entries matching `query`, best first: exact, prefix, a word
 * prefix, a substring, then letters in order ("psy cum" finds Psychedelic
 * Cumbia). Accents and punctuation are ignored.
 */
export function searchTaxonomy(entries: TaxonomyEntry[], query: string, limit = 9): TaxonomyEntry[] {
  const q = fold(query);
  if (!q) return [];
  const rank = (name: string): number | null => {
    const n = fold(name);
    if (n === q) return 0;
    if (n.startsWith(q)) return 1;
    if (n.split(" ").some((word) => word.startsWith(q))) return 2;
    if (n.includes(q)) return 3;
    if (isSubsequence(q.replace(/ /g, ""), n.replace(/ /g, ""))) return 4;
    return null;
  };
  return entries
    .map((entry) => ({ entry, score: rank(entry.name) }))
    .filter((r): r is { entry: TaxonomyEntry; score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.entry.name.length - b.entry.name.length || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((r) => r.entry);
}

export type Verdict =
  | { kind: "accept" }
  | { kind: "remap"; genreId: string }
  | { kind: "new"; name: string; parentId: string }
  | { kind: "descriptor" }
  | { kind: "drop" };

/**
 * The per-proposal decisions for a verdict on a group. Marking a value as
 * what it already proposes is an accept, so it keeps its method; anything
 * else changes the proposal, which the server records as `edited`.
 */
export function decisionsFor(group: ProposalGroup, verdict: Verdict): GenreProposalDecision[] {
  return group.proposals.map((p): GenreProposalDecision => {
    switch (verdict.kind) {
      case "accept":
        return { id: p.id, status: "accepted" };
      case "remap":
        return p.action === "map" && p.target_genre_ids.length === 1 && p.target_genre_ids[0] === verdict.genreId
          ? { id: p.id, status: "accepted" }
          : { id: p.id, action: "map", target_genres: [verdict.genreId] };
      case "new":
        return { id: p.id, action: "new_genre", proposed_genre_name: verdict.name, proposed_parent_id: verdict.parentId };
      case "descriptor":
      case "drop":
        return p.action === verdict.kind ? { id: p.id, status: "accepted" } : { id: p.id, action: verdict.kind };
    }
  });
}

/** Every page of a proposal listing. */
export async function listAll(
  client: Pick<GroovenetClient, "listGenreProposals">,
  query: GenreProposalQuery
): Promise<GenreProposal[]> {
  const all: GenreProposal[] = [];
  for (;;) {
    const page = await client.listGenreProposals({ ...query, limit: BATCH, offset: all.length });
    all.push(...page.proposals);
    if (page.proposals.length === 0 || all.length >= page.total) return all;
  }
}

async function decide(
  client: Pick<GroovenetClient, "decideGenreProposals">,
  decisions: GenreProposalDecision[]
): Promise<GenreProposalSnapshot[]> {
  const previous: GenreProposalSnapshot[] = [];
  for (let i = 0; i < decisions.length; i += BATCH) {
    previous.push(...(await client.decideGenreProposals(decisions.slice(i, i + BATCH))).previous);
  }
  return previous;
}

async function restore(
  client: Pick<GroovenetClient, "restoreGenreProposals">,
  snapshots: GenreProposalSnapshot[]
): Promise<void> {
  for (let i = 0; i < snapshots.length; i += BATCH) {
    await client.restoreGenreProposals(snapshots.slice(i, i + BATCH));
  }
}

export function formatGroup(group: ProposalGroup, position: string): string[] {
  const values = group.proposals.slice(0, MAX_VALUES_SHOWN).map((p) => {
    const conf = p.confidence === null ? "" : chalk.gray(` ${p.method} ${p.confidence.toFixed(2)}`);
    return `    ${p.value_normalized} ${chalk.gray(`(${p.track_count})`)}${conf}`;
  });
  const more = group.proposals.length - MAX_VALUES_SHOWN;
  if (more > 0) values.push(chalk.gray(`    … and ${more} more`));
  const size = `${group.proposals.length} value${group.proposals.length === 1 ? "" : "s"}, ${group.trackCount} tracks`;
  return [chalk.gray(position) + " " + chalk.bold(group.label) + chalk.gray(` ← ${size}`), ...values];
}

export function formatProgress(done: { values: number; tracks: number }, total: { values: number; tracks: number }): string {
  const pct = total.tracks ? Math.round((done.tracks / total.tracks) * 100) : 100;
  return chalk.cyan(`  ${done.values}/${total.values} values · ${done.tracks}/${total.tracks} track tags (${pct}%)`);
}

export function formatApplySummary(result: GenreProposalApplyResult): string[] {
  const lines = [
    chalk.green(
      `✓ ${result.proposals_applied} proposals applied: ${result.tracks_linked} genre links, ` +
        `${result.descriptors_added} descriptors, ${result.aliases_added} aliases, ${result.genres_created} new genres`
    ),
  ];
  for (const s of result.skipped) lines.push(chalk.yellow(`  skipped ${s.value}: ${s.reason}`));
  return lines;
}

const KEYS = "[a]ccept  [x] split  [r]emap  [n]ew genre  [d]escriptor  [k] drop  [s]kip  [u]ndo  [q]uit ";

/** Asks for a genre by fuzzy search; null when cancelled or nothing matched. */
async function pickGenre(
  label: string,
  taxonomy: TaxonomyEntry[],
  ask: Ask,
  readKey: KeyReader,
  io: GenresIO
): Promise<TaxonomyEntry | null> {
  const query = await ask(`  ${label}: `);
  const matches = searchTaxonomy(taxonomy, query);
  if (matches.length === 0) {
    io.log(chalk.yellow(`  No genre matches "${query}".`));
    return null;
  }
  matches.forEach((m, i) => io.log(`  ${i + 1}  ${genreLabel(m)}`));
  const key = await readKey(`  pick 1-${matches.length}, Enter for 1, Esc to cancel `);
  if (key === "enter") return matches[0];
  const index = Number.parseInt(key, 10) - 1;
  return matches[index] ?? null;
}

/**
 * One review session. Returns the exit code.
 *
 * Decisions are written as they are made; applying them to tracks is a
 * separate, confirmed step at the end, so an accidental accept is one `u`
 * away until then.
 */
export async function runReview(
  client: ReviewClient,
  opts: GenresReviewOptions,
  readKey: KeyReader,
  ask: Ask,
  io: GenresIO
): Promise<number> {
  const scope = { min_tracks: opts.minTracks ?? 1 };
  const friendLabel = opts.friendId === undefined ? "all friends" : `friend ${opts.friendId}`;

  if (opts.autoAcceptExact) {
    const exact = await listAll(client, { status: "pending", method: "exact", ...scope });
    if (exact.length) await decide(client, exact.map((p) => ({ id: p.id, status: "accepted" })));
    io.log(chalk.green(`✓ Accepted ${exact.length} exact matches`));
  }

  const pending = await listAll(client, { status: "pending", ...scope, ...(opts.method ? { method: opts.method } : {}) });
  const queue = groupProposals(pending);
  const total = { values: pending.length, tracks: pending.reduce((n, p) => n + p.track_count, 0) };
  const done = { values: 0, tracks: 0 };
  const history: Array<{ group: ProposalGroup; previous: GenreProposalSnapshot[] }> = [];
  let taxonomy: TaxonomyEntry[] | null = null;
  const loadTaxonomy = async () => (taxonomy ??= flattenTaxonomy((await client.getGenres()).genres));

  if (queue.length === 0) io.log(chalk.green("No pending proposals to review."));
  else io.log(chalk.bold(`Reviewing ${total.values} values in ${queue.length} groups — ${friendLabel}`));

  while (queue.length > 0) {
    const group = queue.shift()!;
    io.log("");
    for (const line of formatGroup(group, `[${queue.length} left]`)) io.log(line);
    try {
      const tracks = await client.getGenreProposalTracks(group.proposals[0].id, {
        ...(opts.friendId === undefined ? {} : { friend_id: opts.friendId }),
        limit: opts.examples ?? 3,
      });
      for (const t of tracks) {
        const styles = t.styles.length ? chalk.gray(`  [${t.styles.slice(0, 3).join(", ")}]`) : "";
        io.log(chalk.gray(`      ${t.artist} – ${t.title}`) + styles);
      }
    } catch {
      // Examples are a convenience; a review never stops for them.
    }

    const key = await readKey(KEYS);
    let verdict: Verdict | null = null;
    switch (key) {
      case "a":
        verdict = { kind: "accept" };
        break;
      case "d":
        verdict = { kind: "descriptor" };
        break;
      case "k":
        verdict = { kind: "drop" };
        break;
      case "s":
        continue;
      case "x":
        if (group.proposals.length === 1) io.log(chalk.gray("  Only one value; nothing to split."));
        queue.unshift(...(group.proposals.length === 1 ? [group] : splitGroup(group)));
        continue;
      case "r": {
        const genre = await pickGenre("genre", await loadTaxonomy(), ask, readKey, io);
        if (genre) verdict = { kind: "remap", genreId: genre.id };
        break;
      }
      case "n": {
        const suggested = group.proposals[0].proposed_genre_name ?? "";
        const name = (await ask(`  new genre name${suggested ? ` [${suggested}]` : ""}: `)).trim() || suggested;
        if (!name) break;
        const parent = await pickGenre("parent genre", await loadTaxonomy(), ask, readKey, io);
        if (parent) verdict = { kind: "new", name, parentId: parent.id };
        break;
      }
      case "u": {
        const last = history.pop();
        queue.unshift(group);
        if (!last) {
          io.log(chalk.gray("  Nothing to undo."));
          continue;
        }
        await restore(client, last.previous);
        queue.unshift(last.group);
        done.values -= last.group.proposals.length;
        done.tracks -= last.group.trackCount;
        io.log(chalk.yellow(`  ↶ Undid: ${last.group.label}`));
        continue;
      }
      case "q":
        queue.length = 0;
        continue;
      default:
        io.log(chalk.gray(`  ${KEYS.trim()}`));
        queue.unshift(group);
        continue;
    }

    if (!verdict) {
      // Cancelled or nothing matched: ask about the same group again.
      queue.unshift(group);
      continue;
    }
    const previous = await decide(client, decisionsFor(group, verdict));
    history.push({ group, previous });
    done.values += group.proposals.length;
    done.tracks += group.trackCount;
    io.log(formatProgress(done, total));
  }

  io.log("");
  io.log(chalk.bold(`Decided ${done.values} values (${done.tracks} track tags) this session.`));
  if (history.length === 0) return 0;

  const answer = await readKey(`Apply approved proposals to ${friendLabel}'s tracks now? [y/N] `);
  if (answer !== "y") {
    io.log(chalk.gray("Nothing applied. Run `groovenet genres apply` when ready."));
    return 0;
  }
  const result = await client.applyGenreProposals(undefined, opts.friendId);
  for (const line of formatApplySummary(result)) io.log(line);
  return 0;
}

/**
 * Single keypresses from a TTY, without Enter. Ctrl-C quits the review
 * cleanly (decisions are already saved) rather than killing the process.
 */
export function rawKeyReader(
  stdin: Pick<NodeJS.ReadStream, "setRawMode" | "resume" | "pause" | "once"> = process.stdin,
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout
): KeyReader {
  return (prompt) =>
    new Promise((resolve) => {
      stdout.write(prompt);
      stdin.setRawMode(true);
      stdin.resume();
      stdin.once("data", (data: Buffer) => {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        const key = data.toString();
        if (key === "\u0003") resolve("q");
        else if (key === "\r" || key === "\n") resolve("enter");
        else if (key.startsWith("\u001b")) resolve("esc");
        else resolve(key[0].toLowerCase());
      });
    });
}
