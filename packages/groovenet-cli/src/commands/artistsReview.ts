import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import type {
  ArtistReviewAction,
  ArtistReviewCredit,
  ArtistReviewDetail,
  GroovenetClient,
} from "@groovenet/client";
import { intOption } from "../options.js";
import { printError } from "../output.js";
import { makeClient } from "./fingerprintLibrary.js";

export interface ArtistReviewOptions {
  artist?: number;
  accept?: boolean;
  split?: string;
  merge?: number;
  unmerge?: number;
  name?: string;
  sortName?: string;
  placeholder?: boolean;
  dryRun?: boolean;
  json?: boolean;
  list?: boolean;
  limit?: number;
  offset?: number;
}
export function artistDecision(opts: ArtistReviewOptions): ArtistReviewAction | null {
  const actions = [
    opts.accept,
    opts.split !== undefined,
    opts.merge !== undefined,
    opts.unmerge !== undefined,
    opts.name !== undefined || opts.sortName !== undefined,
    opts.placeholder !== undefined,
  ].filter(Boolean);
  if (actions.length > 1) throw new Error("Choose exactly one review action");
  if (!actions.length) return null;
  if (opts.unmerge !== undefined) return { action: "unmerge", merge_id: opts.unmerge };
  if (!opts.artist) throw new Error("--artist <id> is required for this action");
  if (opts.accept) return { action: "accept", artist_id: opts.artist };
  if (opts.merge !== undefined)
    return { action: "merge", artist_id: opts.artist, target_id: opts.merge };
  if (opts.split !== undefined) {
    const credits: unknown = JSON.parse(opts.split);
    if (!Array.isArray(credits) || credits.length < 2)
      throw new Error(
        "--split needs a JSON array of at least two credits (artist_id, role, position, credited_as)",
      );
    return { action: "split", artist_id: opts.artist, credits: credits as ArtistReviewCredit[] };
  }
  if (opts.placeholder !== undefined)
    return { action: "placeholder", artist_id: opts.artist, is_placeholder: opts.placeholder };
  if (!opts.name || !opts.sortName) throw new Error("Rename needs both --name and --sort-name");
  return { action: "rename", artist_id: opts.artist, name: opts.name, sort_name: opts.sortName };
}
export interface ArtistReviewIO {
  log(text: string): void;
  ask(prompt: string): Promise<string>;
  terminal: boolean;
}
export function formatArtistEvidence(item: ArtistReviewDetail): string {
  return `${item.id}: ${item.name} (sort: ${item.sort_name})\nAliases: ${item.aliases.join("; ")}\nAlbums / Discogs credits: ${JSON.stringify(item.albums, null, 2)}\nTracks / Apple tags: ${JSON.stringify(item.tracks, null, 2)}\nActive merges: ${JSON.stringify(item.merges)}`;
}

export async function runArtistReview(
  client: Pick<GroovenetClient, "listArtistReview" | "reviewArtist">,
  opts: ArtistReviewOptions,
  io: ArtistReviewIO,
): Promise<void> {
  const decision = artistDecision(opts);
  if (decision) {
    const result = await client.reviewArtist(decision, opts.dryRun);
    io.log(
      opts.json
        ? JSON.stringify(result)
        : `${result.dry_run ? "Dry run" : "Saved"}: ${JSON.stringify(result)}`,
    );
    return;
  }
  const page = await client.listArtistReview({
    artist_id: opts.artist,
    limit: opts.limit,
    offset: opts.offset,
  });
  if (opts.json) {
    io.log(JSON.stringify(page));
    return;
  }
  if (opts.list) {
    for (const item of page.items) io.log(formatArtistEvidence(item));
    return;
  }
  if (!io.terminal)
    throw new Error("Interactive review needs a terminal; use --list, --json or an action flag");
  for (const item of page.items) {
    // Load source-file evidence only for the item currently being reviewed.
    const detail = await client.listArtistReview({ artist_id: item.id });
    io.log(formatArtistEvidence(detail.items[0] ?? item));
    const answer = (
      await io.ask("accept / split / merge / unmerge / rename / placeholder / skip / quit: ")
    ).trim();
    if (answer === "quit") break;
    if (answer === "skip" || !answer) continue;
    const current: ArtistReviewOptions = { artist: item.id };
    if (answer === "accept") current.accept = true;
    else if (answer === "placeholder") current.placeholder = true;
    else if (answer === "merge") current.merge = intOption(await io.ask("Target artist ID: "));
    else if (answer === "unmerge")
      current.unmerge = intOption(await io.ask("Merge ID (shown above): "));
    else if (answer === "split")
      current.split = await io.ask(
        "Credits JSON [{artist_id, role, position, credited_as}, ...]: ",
      );
    else if (answer === "rename") {
      current.name = await io.ask("Canonical name: ");
      current.sortName = await io.ask("Sort name: ");
    } else {
      io.log("Unknown action; skipped");
      continue;
    }
    const selected = artistDecision(current)!;
    // Make the concrete preview visible before committing a terminal decision.
    io.log(JSON.stringify(await client.reviewArtist(selected, true)));
    if (!opts.dryRun && (await io.ask("Save this decision? [y/N] ")).trim().toLowerCase() === "y")
      io.log(JSON.stringify(await client.reviewArtist(selected)));
  }
}

export function addArtistsReviewCommand(artists: Command): void {
  artists
    .command("review")
    .description("Review unresolved strings; decisions apply across all friends")
    .option("--artist <id>", "Artist ID (also inspect a reviewed artist)", intOption)
    .option("--accept", "Accept this string as one artist")
    .option("--split <json>", "Replace this artist with ordered credits JSON")
    .option("--merge <id>", "Merge --artist into this target ID", intOption)
    .option("--unmerge <id>", "Undo a recorded merge", intOption)
    .option("--name <name>", "Canonical name")
    .option("--sort-name <name>", "Sort name, required with --name")
    .option("--placeholder", "Mark as a placeholder")
    .option("--no-placeholder", "Clear placeholder status")
    .option("--dry-run", "Validate and preview without saving")
    .option("--list", "Print the queue without prompts")
    .option("--limit <n>", "Queue page size", intOption, 20)
    .option("--offset <n>", "Queue offset", intOption, 0)
    .option("--json", "Output JSON without prompts")
    .action(async (opts: ArtistReviewOptions) => {
      let lines: ReturnType<typeof createInterface> | undefined;
      try {
        await runArtistReview(makeClient(), opts, {
          terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
          log: console.log,
          ask: async (prompt) => {
            lines ??= createInterface({ input: process.stdin, output: process.stdout });
            return lines.question(prompt);
          },
        });
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        lines?.close();
      }
    });
}
