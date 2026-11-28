#!/usr/bin/env node
// Interactive picker for `just deploy-pick` (#1321).
//
// Lists the newest release tags and main commits with their image status from
// the docker-publish.yml run, marks what production runs now, and hands the
// choice to the existing `just deploy` / `just deploy-rc` recipes. It only
// chooses a ref: nothing here deploys, and nothing is written to GitHub.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const PLACEHOLDER_HOST = "your-server.example.com";
export const DEFAULT_LIMIT = 5;
const RELEASE_TAG = /^v\d+\.\d+\.\d+$/;
const SUMMARY_WIDTH = 60;
const FIELD = "\x1f";

export const USAGE = `Usage: just deploy-pick [--limit N] [--list] [--no-fzf]

  --limit N   rows of each kind (releases and main commits), default ${DEFAULT_LIMIT}
  --list      print the table and exit; never prompts, never deploys
  --no-fzf    use the numbered prompt even when fzf is installed`;

export function parseArgs(argv) {
  const opts = { limit: DEFAULT_LIMIT, list: false, noFzf: false, help: false };
  const rest = [...argv];
  while (rest.length) {
    const arg = rest.shift();
    if (arg === "--list") opts.list = true;
    else if (arg === "--no-fzf") opts.noFzf = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--host" || arg === "--stack-dir" || arg === "--registry") {
      opts[arg.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = rest.shift() ?? "";
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const value = arg === "--limit" ? rest.shift() : arg.slice("--limit=".length);
      if (!/^[1-9]\d*$/.test(value ?? "")) throw new Error("--limit needs a positive integer");
      opts.limit = Number(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

// The recipe passes the justfile's values, which fall back to the placeholder.
export function checkHost(host) {
  const name = String(host ?? "").replace(/^.*@/, "");
  if (name === "" || name === PLACEHOLDER_HOST || /(^|\.)example\.(com|org|net)$/.test(name)) {
    return [
      "PROD_HOST is not set, so there is no host to deploy to.",
      "Export PROD_HOST (and PROD_STACK_DIR) in your shell profile or a direnv",
      ".envrc; .envrc.example shows the shape. Nothing host-specific belongs in the repo.",
    ].join("\n");
  }
  return null;
}

// Map one workflow run onto the picker's vocabulary. No run at all is its own
// state: CI never built the commit, which is not the same as a failed build.
export function imageStatus(run) {
  if (!run) return "no run";
  if (run.status !== "completed") return "building";
  return run.conclusion === "success" ? "ready" : "failed";
}

// `gh run list` is newest first, so the first run seen for a key wins. A tag
// push reports the tag as headBranch; main reports "main" — which is why a
// commit sha alone cannot tell a main build from the release built on it.
export function indexRuns(runs) {
  const byMainSha = new Map();
  const byTag = new Map();
  for (const run of runs) {
    if (run.headBranch === "main") {
      if (!byMainSha.has(run.headSha)) byMainSha.set(run.headSha, run);
    } else if (RELEASE_TAG.test(run.headBranch ?? "")) {
      if (!byTag.has(run.headBranch)) byTag.set(run.headBranch, run);
    }
  }
  return { byMainSha, byTag };
}

// Image tag of the running app container, e.g. ghcr.io/org/webapp:v1.2.3.
export function parseImageTag(output) {
  const image = String(output ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!image) return null;
  const match = /:([^:/@]+)$/.exec(image.split("@")[0]);
  return match ? match[1] : null;
}

export function parseCommits(output) {
  return String(output ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, iso, ...subject] = line.split(FIELD);
      return { sha, time: new Date(iso), subject: subject.join(FIELD) };
    });
}

export function buildRows({ tags, releaseCommits, mainCommits, runs, current }) {
  const { byMainSha, byTag } = indexRuns(runs);
  const rows = [];
  tags.forEach((tag, i) => {
    const commit = releaseCommits[i];
    if (!commit) return;
    rows.push({
      kind: "release",
      ref: tag,
      command: ["deploy", tag],
      ...commit,
      status: imageStatus(byTag.get(tag)),
    });
  });
  for (const commit of mainCommits) {
    const short = commit.sha.slice(0, 7);
    rows.push({
      kind: "main",
      ref: `sha-${short}`,
      command: ["deploy-rc", short],
      ...commit,
      status: imageStatus(byMainSha.get(commit.sha)),
    });
  }
  for (const row of rows) {
    row.deployable = row.status === "ready";
    row.current = current !== null && current === row.ref;
  }
  return rows.sort((a, b) => b.time - a.time);
}

const pad2 = (n) => String(n).padStart(2, "0");
export function formatTime(date) {
  if (Number.isNaN(date.getTime())) return "unknown";
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

const truncate = (text, width) => (text.length > width ? `${text.slice(0, width - 1)}…` : text);

export function formatRow(row) {
  return [
    row.kind.padEnd(8),
    row.ref.padEnd(13),
    formatTime(row.time).padEnd(17),
    `${row.status.padEnd(8)}${row.current ? "●" : " "}`.padEnd(11),
    truncate(row.subject, SUMMARY_WIDTH),
  ].join(" ");
}

export function formatTable(rows) {
  const header = [
    "KIND".padEnd(8),
    "REF".padEnd(13),
    "BUILT".padEnd(17),
    "IMAGES".padEnd(11),
    "SUMMARY",
  ];
  return [header.join(" "), ...rows.map(formatRow)].map((line) => `  ${line}`).join("\n");
}

const shellQuote = (value) => `'${String(value).replaceAll("'", `'\\''`)}'`;

function run(command, args, { env, ...options } = {}) {
  const result = spawnSync(command, args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error?.code === "ENOENT") {
    throw new Error(`${command} is required but was not found on PATH`);
  }
  return result;
}

function must(command, args, ctx) {
  const result = run(command, args, { env: ctx.env });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function readCurrentTag({ host, stackDir, env }, warn) {
  const remote = `cd ${shellQuote(stackDir)} && docker compose ps app --format '{{.Image}}'`;
  let result;
  try {
    result = run("ssh", ["-o", "ConnectTimeout=5", "-o", "BatchMode=yes", host, remote], {
      env,
      timeout: 20000,
    });
  } catch (error) {
    result = { status: 1, error };
  }
  const tag = result.status === 0 ? parseImageTag(result.stdout) : null;
  if (!tag) {
    const why = result.error
      ? result.error.message
      : (result.stderr || "").trim() || "no image reported";
    warn(
      `warning: could not read what is running on ${host} (${why.split("\n")[0]}); showing no ● marker.`,
    );
  }
  return tag;
}

export function gather(ctx, warn) {
  const { limit } = ctx;
  const fetched = run("git", ["fetch", "--quiet", "--tags", "origin", "main"], { env: ctx.env });
  if (fetched.status !== 0) warn("warning: git fetch failed; showing what is already local.");

  const tags = must("git", ["tag", "--list", "v*", "--sort=-v:refname"], ctx)
    .split("\n")
    .filter((tag) => RELEASE_TAG.test(tag))
    .slice(0, limit);
  const format = `--format=%H${FIELD}%cI${FIELD}%s`;
  const releaseCommits = tags.length
    ? parseCommits(must("git", ["log", "--no-walk=unsorted", format, ...tags, "--"], ctx))
    : [];
  const mainCommits = parseCommits(
    must("git", ["log", `-n${limit}`, format, "origin/main", "--"], ctx),
  );

  const runs = JSON.parse(
    must(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        "docker-publish.yml",
        "--event",
        "push",
        "--limit",
        String(Math.max(100, limit * 20)),
        "--json",
        "headSha,headBranch,status,conclusion,createdAt",
      ],
      ctx,
    ) || "[]",
  );
  return buildRows({ tags, releaseCommits, mainCommits, runs, current: readCurrentTag(ctx, warn) });
}

function pickWithFzf(rows, ctx) {
  const probe = spawnSync("fzf", ["--version"], { env: ctx.env, stdio: "ignore" });
  if (probe.error || probe.status !== 0) return undefined;
  const input = rows.map((row, i) => `${i}\t${formatRow(row)}`).join("\n");
  const result = spawnSync(
    "fzf",
    [
      "--delimiter",
      "\t",
      "--with-nth",
      "2",
      "--no-sort",
      "--reverse",
      "--header",
      "Pick a ref to deploy (not-ready rows are refused)",
    ],
    { env: ctx.env, input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  );
  if (result.status !== 0) return null; // Esc / Ctrl-C / no match
  const field = result.stdout.split("\t")[0];
  return /^\d+$/.test(field) ? (rows[Number(field)] ?? null) : null;
}

// Lines are queued as they arrive: piped input delivers several at once, and
// readline's question() would drop the ones that land between two questions.
function lineReader(input, out) {
  const rl = createInterface({ input, terminal: false });
  const queue = [];
  let waiting = null;
  let closed = false;
  rl.on("line", (line) => (waiting ? waiting(line) : queue.push(line)));
  rl.on("close", () => {
    closed = true;
    waiting?.(null);
  });
  return {
    ask(question) {
      out.write(question);
      if (queue.length) return Promise.resolve(queue.shift());
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => {
        waiting = (line) => {
          waiting = null;
          resolve(line);
        };
      });
    },
    close: () => rl.close(),
  };
}

async function pickWithPrompt(rows, reader, out) {
  const table = formatTable(rows).split("\n");
  out(
    [
      "      " + table[0].trimStart(),
      ...table.slice(1).map((line, i) => `${String(i + 1).padStart(3)}) ${line.trimStart()}`),
    ].join("\n"),
  );
  for (;;) {
    const answer = await reader.ask(`Deploy which row [1-${rows.length}, q to quit]? `);
    if (answer === null || /^\s*(q|quit)?\s*$/i.test(answer)) return null;
    const row = rows[Number(answer) - 1];
    if (!row) {
      out(`Not a row: ${answer.trim()}`);
    } else if (!row.deployable) {
      out(`${row.ref} cannot be deployed: images are ${row.status}.`);
    } else return row;
  }
}

export async function main(argv, io = {}) {
  const env = io.env ?? process.env;
  const out = io.out ?? ((text) => console.log(text));
  const err = io.err ?? ((text) => console.error(text));
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (error) {
    err(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    out(USAGE);
    return 0;
  }
  const refusal = checkHost(opts.host);
  if (refusal) {
    err(refusal);
    return 1;
  }
  if (!opts.stackDir) {
    err("PROD_STACK_DIR is empty; export it next to PROD_HOST (see .envrc.example).");
    return 1;
  }
  const ctx = { env, limit: opts.limit, host: opts.host, stackDir: opts.stackDir };

  let rows;
  try {
    rows = gather(ctx, err);
  } catch (error) {
    err(`deploy-pick: ${error.message}`);
    return 1;
  }
  if (rows.length === 0) {
    err("deploy-pick: no releases or main commits found.");
    return 1;
  }
  if (opts.list) {
    out(formatTable(rows));
    return 0;
  }

  const reader = lineReader(io.stdin ?? process.stdin, io.stdout ?? process.stdout);
  let row = opts.noFzf ? undefined : pickWithFzf(rows, ctx);
  if (row === undefined) row = await pickWithPrompt(rows, reader, out);
  if (row && !row.deployable) {
    reader.close();
    err(`${row.ref} cannot be deployed: images are ${row.status}.`);
    return 1;
  }
  if (!row) {
    reader.close();
    out("Nothing deployed.");
    return 0;
  }

  const target = `just ${row.command.join(" ")}`;
  const answer = await reader.ask(
    `Run \`${target}\` against ${opts.host}:${opts.stackDir}? [y/N] `,
  );
  reader.close();
  if (!/^\s*y(es)?\s*$/i.test(answer ?? "")) {
    out("Nothing deployed.");
    return 0;
  }
  const recipeArgs = [
    ...(opts.registry ? [`registry=${opts.registry}`] : []),
    `prod_host=${opts.host}`,
    `prod_stack_dir=${opts.stackDir}`,
    ...row.command,
  ];
  const result = spawnSync("just", recipeArgs, { env, stdio: "inherit" });
  if (result.error) {
    err(`deploy-pick: could not run just: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
