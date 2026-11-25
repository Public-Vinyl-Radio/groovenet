import { readFile, writeFile, stat } from "node:fs/promises";
import { MAX_RANKING_FILE_BYTES, parseRankingProfileFile } from "@groovenet/contracts";
/**
 * `groovenet profiles` (#1192): list, show, copy a preset into your own
 * profiles, choose the one each surface ranks with, and delete. Presets are
 * read-only; `create --from <preset>` is how one is tuned.
 */
import { Command, InvalidArgumentError } from "commander";
import { GroovenetClient, loadConfig } from "@groovenet/client";
import type {
  RankingProfileEntry,
  RankingProfilesResponse,
  RankingSurface,
} from "@groovenet/client";
import { boundedIntOption } from "../options.js";
import { printError } from "../output.js";

const SURFACES: RankingSurface[] = ["suggestions", "related", "recommendations"];

export type ProfilesClient = Pick<
  GroovenetClient,
  | "listRankingProfiles"
  | "getRankingProfile"
  | "copyRankingProfile"
  | "setActiveRankingProfile"
  | "deleteRankingProfile"
>;
export type Io = { log: (line: string) => void };

/** `suggestions,related` → surfaces, refusing anything unknown. */
export function surfacesOption(value: string): RankingSurface[] {
  const surfaces = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = surfaces.filter((s) => !SURFACES.includes(s as RankingSurface));
  if (surfaces.length === 0 || unknown.length > 0)
    throw new InvalidArgumentError(`expected surfaces from: ${SURFACES.join(", ")}`);
  return [...new Set(surfaces)] as RankingSurface[];
}

const formatWeight = (value: number) => String(Number(value.toFixed(3)));

/** One line per profile, `*` where a surface uses it. */
export function formatProfileList(result: RankingProfilesResponse): string[] {
  const usedOn = (id: string) => SURFACES.filter((surface) => result.active[surface] === id);
  return result.profiles.map((profile) => {
    const where = usedOn(profile.id);
    const flags = [
      profile.kind === "preset" ? "preset" : "custom",
      ...(profile.invalid ? ["unreadable, ranks as Default"] : []),
      ...(where.length ? [`active: ${where.join(", ")}`] : []),
    ];
    return `${where.length ? "*" : " "} ${profile.id.padEnd(12)} ${profile.name}  (${flags.join("; ")})`;
  });
}

/** A profile's weights and constraints, readable. */
export function formatProfile(profile: RankingProfileEntry): string[] {
  const lines = [
    `${profile.name} (${profile.id}, ${profile.kind})`,
    ...(profile.description ? [profile.description] : []),
    `Surfaces: ${profile.surfaces.join(", ")}`,
  ];
  if (profile.invalid) lines.push("This profile can't be read; it ranks as Default.");
  const base = new Set(profile.base?.signals ?? []);
  lines.push("Weights:");
  for (const [signal, weight] of Object.entries(profile.weights)) {
    lines.push(
      `  ${signal.padEnd(20)} ${formatWeight(weight ?? 0)}${base.has(signal as never) ? "  (base: best of)" : ""}`,
    );
  }
  const { bpm_window, key_rule, genre_floor, energy_range } = profile.constraints;
  const constraints = [
    bpm_window &&
      `BPM within ${bpm_window.unit === "ratio" ? `±${formatWeight(bpm_window.max * 100)}%` : `±${bpm_window.max} BPM`}${bpm_window.half_double ? ", half and double time" : ""}`,
    key_rule &&
      (key_rule.metric === "wheel" && key_rule.max === 0
        ? "Key: same"
        : key_rule.metric === "wheel" && key_rule.max === 1
          ? "Key: adjacent"
          : `Key: ${key_rule.metric} ≤ ${key_rule.max}`),
    genre_floor && `Genre overlap ≥ ${genre_floor.min}`,
    energy_range && `Energy: drop ≤ ${energy_range.max_drop}, rise ≤ ${energy_range.max_rise}`,
  ].filter((line): line is string => Boolean(line));
  lines.push(`Constraints: ${constraints.length ? "" : "none"}`);
  for (const line of constraints) lines.push(`  ${line}`);
  return lines;
}

export async function runList(client: ProfilesClient, friendId: number, json: boolean, io: Io) {
  const result = await client.listRankingProfiles(friendId);
  if (json) io.log(JSON.stringify(result, null, 2));
  else formatProfileList(result).forEach((line) => io.log(line));
}

export async function runShow(client: ProfilesClient, id: string, json: boolean, io: Io) {
  const profile = await client.getRankingProfile(id);
  if (json) io.log(JSON.stringify(profile, null, 2));
  else formatProfile(profile).forEach((line) => io.log(line));
}

export async function runCreate(
  client: ProfilesClient,
  opts: { from: string; name?: string; friendId: number; use?: boolean; json?: boolean },
  io: Io,
) {
  const profile = await client.copyRankingProfile(opts.from, opts.friendId, opts.name);
  if (opts.use) await client.setActiveRankingProfile(opts.friendId, profile.id);
  if (opts.json) io.log(JSON.stringify(profile, null, 2));
  else
    io.log(
      `✓ Created ${profile.name} (${profile.id}) from ${opts.from}${opts.use ? ", now active" : ""}.`,
    );
}

export async function runUse(
  client: ProfilesClient,
  opts: { id: string; friendId: number; surfaces?: RankingSurface[]; json?: boolean },
  io: Io,
) {
  const result = await client.setActiveRankingProfile(opts.friendId, opts.id, opts.surfaces);
  if (opts.json) {
    io.log(JSON.stringify(result, null, 2));
    return;
  }
  const on = SURFACES.filter((surface) => result.active[surface] === opts.id);
  io.log(`✓ ${opts.id} ranks ${on.join(", ")}.`);
}

export async function runDelete(client: ProfilesClient, id: string, json: boolean, io: Io) {
  const result = await client.deleteRankingProfile(id);
  io.log(json ? JSON.stringify(result, null, 2) : `✓ Deleted profile ${result.id}.`);
}

export async function runExport(
  client: Pick<GroovenetClient, "exportRankingProfile">,
  id: string,
  output: string | undefined,
  io: Io,
) {
  const file = await client.exportRankingProfile(id);
  const text = JSON.stringify(file, null, 2) + "\n";
  if (output) await writeFile(output, text);
  else io.log(text.trimEnd());
}

export async function runImport(
  client: Pick<GroovenetClient, "importRankingProfile">,
  path: string,
  friendId: number,
  io: Io & { warn: (line: string) => void },
) {
  if ((await stat(path)).size > MAX_RANKING_FILE_BYTES)
    throw new Error(`Ranking file exceeds ${MAX_RANKING_FILE_BYTES} bytes`);
  const text = await readFile(path, "utf8");
  // Validate locally but send the original so the server returns the same warnings.
  parseRankingProfileFile(text);
  const result = await client.importRankingProfile(friendId, text);
  result.warnings.forEach((warning) => io.warn(warning));
  io.log(JSON.stringify(result.profile, null, 2));
}

function makeClient(): GroovenetClient {
  const cfg = loadConfig();
  return new GroovenetClient({
    baseUrl: cfg.api_base,
    apiKey: cfg.api_key,
    caCert: cfg.ca_cert,
    clientName: "cli",
  });
}

const friendIdOf = (opts: { friendId?: number }) => opts.friendId ?? loadConfig().default_friend_id;
const io: Io = { log: (line) => console.log(line) };

function handle<A extends unknown[]>(action: (...args: A) => Promise<void>) {
  return async (...args: A) => {
    try {
      await action(...args);
    } catch (error: unknown) {
      printError(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
}

export function addProfilesCommands(program: Command): void {
  const profiles = program
    .command("profiles")
    .alias("ranking-profiles")
    .description("Ranking profiles: how suggestions and recommendations are ranked");
  const friend = [
    "--friend-id <id>",
    "Library (default: default_friend_id)",
    boundedIntOption(1),
  ] as const;

  profiles
    .command("export <id>")
    .description("Export a portable JSON ranking profile")
    .option("-o, --output <file>", "Write to file instead of stdout")
    .action(
      handle(async (id: string, opts: { output?: string }) =>
        runExport(makeClient(), id, opts.output, io),
      ),
    );

  profiles
    .command("import <file>")
    .description("Import a portable JSON ranking profile; warnings go to stderr")
    .option(...friend)
    .option("--json", "Output as JSON")
    .action(
      handle(async (path: string, opts: { friendId?: number }) =>
        runImport(makeClient(), path, friendIdOf(opts), {
          ...io,
          warn: (line) => console.error(line),
        }),
      ),
    );

  profiles
    .command("list")
    .description("List presets and your profiles; * marks the active ones")
    .option(...friend)
    .option("--json", "Output as JSON")
    .action(
      handle(async (opts: { friendId?: number; json?: boolean }) =>
        runList(makeClient(), friendIdOf(opts), opts.json ?? false, io),
      ),
    );

  profiles
    .command("show <id>")
    .description("Show a profile's weights and constraints")
    .option("--json", "Output as JSON")
    .action(
      handle(async (id: string, opts: { json?: boolean }) =>
        runShow(makeClient(), id, opts.json ?? false, io),
      ),
    );

  profiles
    .command("create")
    .description("Create a profile as a copy of a preset or another profile")
    .requiredOption("--from <id>", "Preset (default, beatmatcher, selector) or profile id")
    .option("--name <name>", 'Name (default: "<name> copy")')
    .option("--use", "Make it active on every surface it applies to")
    .option(...friend)
    .option("--json", "Output as JSON")
    .action(
      handle(
        async (opts: {
          from: string;
          name?: string;
          use?: boolean;
          friendId?: number;
          json?: boolean;
        }) => runCreate(makeClient(), { ...opts, friendId: friendIdOf(opts) }, io),
      ),
    );

  profiles
    .command("use <id>")
    .description("Choose the profile a library ranks with")
    .option(
      "--surface <surfaces>",
      "Comma-separated: suggestions, related, recommendations",
      surfacesOption,
    )
    .option(...friend)
    .option("--json", "Output as JSON")
    .action(
      handle(
        async (
          id: string,
          opts: { surface?: RankingSurface[]; friendId?: number; json?: boolean },
        ) =>
          runUse(
            makeClient(),
            { id, friendId: friendIdOf(opts), surfaces: opts.surface, json: opts.json },
            io,
          ),
      ),
    );

  profiles
    .command("delete <id>")
    .description("Delete one of your profiles; surfaces using it go back to Default")
    .option("--json", "Output as JSON")
    .action(
      handle(async (id: string, opts: { json?: boolean }) =>
        runDelete(makeClient(), id, opts.json ?? false, io),
      ),
    );
}
