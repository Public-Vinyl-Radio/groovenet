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
  splitAuto?: boolean;
  merge?: number;
  unmerge?: number;
  name?: string;
  sortName?: string;
  placeholder?: boolean;
  dryRun?: boolean;
  json?: boolean;
  list?: boolean;
  verbose?: boolean;
  limit?: number;
  offset?: number;
}
export function artistDecision(opts: ArtistReviewOptions): ArtistReviewAction | null {
  const actions = [
    opts.accept,
    opts.split !== undefined,
    opts.splitAuto,
    opts.merge !== undefined,
    opts.unmerge !== undefined,
    opts.name !== undefined || opts.sortName !== undefined,
    opts.placeholder !== undefined,
  ].filter(Boolean);
  if (actions.length > 1) throw new Error("Choose exactly one review action");
  if (!actions.length) return null;
  if (opts.unmerge !== undefined) return { action: "unmerge", merge_id: opts.unmerge };
  if (!opts.artist) throw new Error("--artist <id> is required for this action");
  if (opts.splitAuto) return null;
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
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/** One short line per record: its id, title and the credit string it was imported with. */
function evidenceLine(entry: Record<string, unknown>, idKey: string): string {
  const original = text(entry.original_string);
  return `  ${text(entry[idKey])}  ${text(entry.title)}${original ? ` — ${original}` : ""}`;
}

export function formatArtistEvidence(item: ArtistReviewDetail, verbose = false): string {
  const head = `${item.id}: ${item.name} (sort: ${item.sort_name})\nAliases: ${item.aliases.join("; ")}`;
  if (verbose)
    return `${head}\nAlbums / Discogs credits: ${JSON.stringify(item.albums, null, 2)}\nTracks / Apple tags: ${JSON.stringify(item.tracks, null, 2)}\nActive merges: ${JSON.stringify(item.merges)}`;
  const section = (label: string, entries: Record<string, unknown>[], idKey: string) =>
    entries.length ? [`${label}:`, ...entries.map((e) => evidenceLine(e, idKey))] : [];
  return [
    head,
    ...section("Albums", item.albums, "release_id"),
    ...section("Tracks", item.tracks, "track_id"),
    ...(item.merges.length
      ? [
          `Active merges: ${item.merges.map((m) => `#${m.id} (${m.source_id} → ${m.target_id})`).join(", ")}`,
        ]
      : []),
  ].join("\n");
}

export async function runArtistReview(
  client: Pick<GroovenetClient, "listArtistReview" | "reviewArtist" | "getArtistSplitProposal">,
  opts: ArtistReviewOptions,
  io: ArtistReviewIO,
): Promise<void> {
  const decision = artistDecision(opts);
  if (decision || opts.splitAuto) {
    const selected: ArtistReviewAction = decision ?? {
      action: "split",
      artist_id: opts.artist!,
      credits: (await client.getArtistSplitProposal(opts.artist!)).credits,
    };
    const result = await client.reviewArtist(selected, opts.dryRun);
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
    for (const item of page.items) io.log(formatArtistEvidence(item, opts.verbose));
    return;
  }
  if (!io.terminal)
    throw new Error("Interactive review needs a terminal; use --list, --json or an action flag");
  for (const item of page.items) {
    // Load source-file evidence only for the item currently being reviewed.
    const detail = await client.listArtistReview({ artist_id: item.id });
    io.log(formatArtistEvidence(detail.items[0] ?? item, opts.verbose));
    const answer = (
      await io.ask("accept / split / merge / unmerge / rename / placeholder / skip / quit: ")
    ).trim();
    if (answer === "quit") break;
    if (answer === "skip" || !answer) continue;
    const current: ArtistReviewOptions = { artist: item.id };
    let splitConfirmed = false;
    if (answer === "accept") current.accept = true;
    else if (answer === "placeholder") current.placeholder = true;
    else if (answer === "merge") current.merge = intOption(await io.ask("Target artist ID: "));
    else if (answer === "unmerge")
      current.unmerge = intOption(await io.ask("Merge ID (shown above): "));
    else if (answer === "split") {
      const credits = (await client.getArtistSplitProposal(item.id)).credits;
      while (true) {
        io.log(
          "Proposed split:\n" +
            credits
              .map(
                (c) =>
                  `  ${c.position} ${c.role} ${c.credited_as} ${"artist_id" in c ? `existing #${c.artist_id}` : `new (sort: ${c.sort_name ?? c.name})`}`,
              )
              .join("\n"),
        );
        const choice = (await io.ask("[y]es / [e]dit / [n]o: ")).trim().toLowerCase();
        if (choice === "n") break;
        if (choice === "y") {
          if (credits.length < 2) {
            io.log("A split needs at least two credits; accept the artist instead.");
            continue;
          }
          current.split = JSON.stringify(credits);
          splitConfirmed = true;
          break;
        }
        if (choice !== "e") continue;
        const index = Number(await io.ask("Row number: "));
        if (!Number.isInteger(index) || index < 0 || index >= credits.length) {
          io.log("Invalid row");
          continue;
        }
        const row = credits[index];
        const edit = (await io.ask("role / join / artist / rename: ")).trim().toLowerCase();
        if (edit === "role") {
          const role = (await io.ask("Role (primary / featured / remixer / composer): ")).trim();
          if (
            role === "primary" ||
            role === "featured" ||
            role === "remixer" ||
            role === "composer"
          )
            row.role = role;
          else io.log("Invalid role");
        } else if (edit === "join" && index + 1 < credits.length) {
          const next = credits[index + 1].credited_as;
          const start = item.name.indexOf(row.credited_as);
          const end = start < 0 ? -1 : item.name.indexOf(next, start + row.credited_as.length);
          const name =
            end < 0 ? `${row.credited_as} & ${next}` : item.name.slice(start, end + next.length);
          credits.splice(index, 2, { name, credited_as: name, role: row.role, position: index });
          credits.forEach((c, i) => {
            c.position = i;
          });
        } else if (edit === "artist") {
          const artist_id = intOption(await io.ask("Artist ID: "));
          credits[index] = {
            artist_id,
            role: row.role,
            position: row.position,
            credited_as: row.credited_as,
          };
        } else if (edit === "rename") {
          const name = (await io.ask("Name: ")).trim();
          if (name)
            credits[index] = { name, credited_as: name, role: row.role, position: row.position };
          else io.log("Name cannot be empty");
        } else io.log("Invalid edit");
      }
      if (!current.split) continue;
    } else if (answer === "rename") {
      current.name = await io.ask("Canonical name: ");
      current.sortName = await io.ask("Sort name: ");
    } else {
      io.log("Unknown action; skipped");
      continue;
    }
    const selected = artistDecision(current)!;
    // Make the concrete preview visible before committing a terminal decision.
    io.log(JSON.stringify(await client.reviewArtist(selected, true)));
    if (
      !opts.dryRun &&
      (splitConfirmed || (await io.ask("Save this decision? [y/N] ")).trim().toLowerCase() === "y")
    )
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
    .option("--split-auto", "Apply the proposed split without prompting")
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
    .option("--verbose", "Show the full album and track JSON as evidence")
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
