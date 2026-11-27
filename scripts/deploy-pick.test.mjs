import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import {
  buildRows,
  checkHost,
  formatTable,
  formatTime,
  imageStatus,
  indexRuns,
  main,
  parseArgs,
  parseCommits,
  parseImageTag,
} from "./deploy-pick.mjs";

process.env.TZ = "UTC";

const HOST = "deploy@prod.test";
const DIR = "/srv/stack";
const FS = "\x1f";
const sha = (c) => c.repeat(40);

const MAIN = [
  [
    sha("a"),
    "2026-11-27T15:14:00+00:00",
    "feat(backup): keep lossless out of the remote backup target and more words to force truncation here (#1320)",
  ],
  [sha("b"), "2026-11-27T12:55:00+00:00", "feat(settings): contextual guidance (#1319)"],
  [sha("c"), "2026-11-27T10:00:00+00:00", "fix: a broken build (#1318)"],
  [sha("d"), "2026-11-26T09:00:00+00:00", "chore: never built (#1317)"],
];
const RELEASES = [
  ["v0.4.2", sha("e"), "2026-11-26T12:02:00+00:00", "chore: release main (#1309)"],
  ["v0.4.1", sha("f"), "2026-11-20T08:30:00+00:00", "chore: release main (#1290)"],
];
const run = (headSha, headBranch, status, conclusion) => ({
  headSha,
  headBranch,
  status,
  conclusion,
  createdAt: "x",
});
const RUNS = [
  run(sha("a"), "main", "in_progress", ""),
  run(sha("b"), "main", "completed", "success"),
  run(sha("c"), "main", "completed", "failure"),
  run(sha("e"), "v0.4.2", "completed", "success"),
  run(sha("e"), "main", "completed", "success"),
];

const STUBS = {
  git: `#!/bin/bash
echo "git $*" >> "$STUB_DIR/calls.log"
case "$1" in
  fetch) exit "\${STUB_GIT_FETCH_EXIT:-0}" ;;
  tag) cat "$STUB_DIR/tags" ;;
  log)
    if [[ " $* " == *" --no-walk=unsorted "* ]]; then
      n=0; seen=0
      for a in "\${@:2}"; do
        [[ "$a" == "--" ]] && break
        [[ "$seen" == 1 ]] && n=$((n+1))
        [[ "$a" == --format=* ]] && seen=1
      done
      head -n "$n" "$STUB_DIR/releases"
    else
      n="\${2#-n}"
      head -n "$n" "$STUB_DIR/main"
    fi ;;
esac
`,
  gh: `#!/bin/bash
echo "gh $*" >> "$STUB_DIR/calls.log"
[[ -n "$STUB_GH_FAIL" ]] && { echo "gh: boom" >&2; exit 1; }
cat "$STUB_DIR/runs.json"
`,
  ssh: `#!/bin/bash
echo "ssh $*" >> "$STUB_DIR/calls.log"
if [[ -n "$STUB_SSH_FAIL" ]]; then echo "ssh: connect to host timed out" >&2; exit 255; fi
cat "$STUB_DIR/ssh.out"
`,
  fzf: `#!/bin/bash
[[ "$1" == "--version" ]] && exit 0
echo "fzf $*" >> "$STUB_DIR/calls.log"
[[ -n "$STUB_FZF_EXIT" ]] && exit "$STUB_FZF_EXIT"
sed -n "\${STUB_FZF_PICK}p"
`,
  just: `#!/bin/bash
echo "just $*" >> "$STUB_DIR/calls.log"
exit "\${STUB_JUST_EXIT:-0}"
`,
};

function sandbox(
  t,
  { stubs = Object.keys(STUBS), env = {}, sshOut = "ghcr.io/org/webapp:sha-bbbbbbb\n" } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "deploy-pick-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of stubs) {
    writeFileSync(join(dir, name), STUBS[name]);
    chmodSync(join(dir, name), 0o755);
  }
  writeFileSync(join(dir, "tags"), ["v0.4.2", "v0.4.1", "v20261127T010101Z", "v0.4.0"].join("\n"));
  writeFileSync(join(dir, "main"), MAIN.map((r) => r.join(FS)).join("\n"));
  writeFileSync(join(dir, "releases"), RELEASES.map(([, ...r]) => r.join(FS)).join("\n"));
  writeFileSync(join(dir, "runs.json"), JSON.stringify(RUNS));
  writeFileSync(join(dir, "ssh.out"), sshOut);
  return {
    dir,
    calls: () =>
      existsSync(join(dir, "calls.log"))
        ? readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n")
        : [],
    env: { PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir, TZ: "UTC", ...env },
  };
}

async function pick(box, argv, { input = [], host = HOST, stackDir = DIR } = {}) {
  const out = [];
  const err = [];
  const prompt = [];
  const code = await main(
    ["--host", host, "--stack-dir", stackDir, "--registry", "ghcr.io/example", ...argv],
    {
      env: box.env,
      out: (text) => out.push(text),
      err: (text) => err.push(text),
      stdin: Readable.from(input),
      stdout: { write: (text) => prompt.push(text) },
    },
  );
  return { code, out: out.join("\n"), err: err.join("\n"), prompt: prompt.join("") };
}

test("parseArgs reads the options and rejects bad ones", () => {
  assert.deepEqual(parseArgs([]), { limit: 5, list: false, noFzf: false, help: false });
  assert.equal(parseArgs(["--limit", "3"]).limit, 3);
  assert.equal(parseArgs(["--limit=7", "--list", "--no-fzf", "-h"]).limit, 7);
  assert.deepEqual(
    ["list", "noFzf", "help"].map((k) => parseArgs(["--list", "--no-fzf", "--help"])[k]),
    [true, true, true],
  );
  const o = parseArgs(["--host", "h", "--stack-dir", "/d", "--registry", "r"]);
  assert.deepEqual([o.host, o.stackDir, o.registry], ["h", "/d", "r"]);
  assert.equal(parseArgs(["--host"]).host, "");
  for (const bad of [["--limit", "0"], ["--limit", "x"], ["--limit"], ["--limit=-2"], ["--nope"]]) {
    assert.throws(() => parseArgs(bad), /limit|unknown/);
  }
});

test("checkHost refuses the placeholder and example hosts only", () => {
  assert.match(checkHost("your-server.example.com"), /PROD_HOST is not set/);
  assert.match(checkHost("deploy@your-server.example.com"), /\.envrc/);
  assert.match(checkHost("deploy@example.com"), /PROD_HOST/);
  assert.match(checkHost(""), /PROD_HOST/);
  assert.match(checkHost(undefined), /PROD_HOST/);
  assert.equal(checkHost("deploy@prod.test"), null);
  assert.equal(checkHost("notexample.com"), null);
});

test("imageStatus maps ready, building, failed and no run", () => {
  assert.equal(imageStatus(undefined), "no run");
  assert.equal(imageStatus({ status: "in_progress", conclusion: "" }), "building");
  assert.equal(imageStatus({ status: "queued", conclusion: "" }), "building");
  assert.equal(imageStatus({ status: "completed", conclusion: "success" }), "ready");
  for (const conclusion of ["failure", "cancelled", "timed_out", "skipped"]) {
    assert.equal(imageStatus({ status: "completed", conclusion }), "failed");
  }
});

test("indexRuns keeps the newest run and tells a tag build from the main build of its commit", () => {
  const { byMainSha, byTag } = indexRuns([
    run(sha("e"), "main", "completed", "success"),
    run(sha("e"), "main", "completed", "failure"),
    run(sha("e"), "v0.4.2", "in_progress", ""),
    run(sha("e"), "v0.4.2", "completed", "failure"),
    run(sha("z"), "some-branch", "completed", "success"),
    run(sha("y"), "v20261127T010101Z", "completed", "success"),
    { headSha: sha("x") },
  ]);
  assert.equal(byMainSha.get(sha("e")).conclusion, "success");
  assert.equal(byTag.get("v0.4.2").status, "in_progress");
  assert.equal(byMainSha.size, 1);
  assert.equal(byTag.size, 1);
});

test("parseImageTag reads the tag from an image reference", () => {
  assert.equal(parseImageTag("ghcr.io/org/webapp:v0.4.2\n"), "v0.4.2");
  assert.equal(parseImageTag("\nlocalhost:5000/webapp:sha-abc1234\nother:x"), "sha-abc1234");
  assert.equal(parseImageTag("ghcr.io/org/webapp:v1@sha256:deadbeef"), "v1");
  assert.equal(parseImageTag("localhost:5000/webapp"), null);
  assert.equal(parseImageTag("ghcr.io/org/webapp@sha256:abc"), null);
  assert.equal(parseImageTag(""), null);
  assert.equal(parseImageTag(null), null);
});

test("parseCommits splits sha, date and a subject that may contain the separator", () => {
  const [commit] = parseCommits(`${sha("a")}${FS}2026-11-27T15:14:00+00:00${FS}a${FS}b\n\n`);
  assert.equal(commit.subject, `a${FS}b`);
  assert.equal(commit.time.toISOString(), "2026-11-27T15:14:00.000Z");
  assert.deepEqual(parseCommits(undefined), []);
});

test("formatTime is local, and unknown for a bad date", () => {
  assert.equal(formatTime(new Date("2026-01-02T03:04:00Z")), "2026-01-02 03:04");
  assert.equal(formatTime(new Date("nope")), "unknown");
});

test("buildRows orders newest first, flags deployable and current rows, skips unmatched tags", () => {
  const rows = buildRows({
    tags: ["v0.4.2", "v0.4.1"],
    releaseCommits: [{ sha: sha("e"), time: new Date("2026-11-26T12:02:00Z"), subject: "r" }],
    mainCommits: [{ sha: sha("b"), time: new Date("2026-11-27T12:55:00Z"), subject: "m" }],
    runs: RUNS,
    current: "sha-bbbbbbb",
  });
  assert.deepEqual(
    rows.map((r) => [r.kind, r.ref, r.status, r.deployable, r.current]),
    [
      ["main", "sha-bbbbbbb", "ready", true, true],
      ["release", "v0.4.2", "ready", true, false],
    ],
  );
  assert.deepEqual(rows[0].command, ["deploy-rc", "bbbbbbb"]);
  assert.deepEqual(rows[1].command, ["deploy", "v0.4.2"]);
  assert.equal(
    buildRows({ tags: [], releaseCommits: [], mainCommits: [], runs: [], current: null }).length,
    0,
  );
  assert.match(formatTable(rows), /^ {2}KIND/);
});

test("--list prints the table with timestamps, image status and the production marker", async (t) => {
  const box = sandbox(t);
  const { code, out, err } = await pick(box, ["--list"]);
  assert.equal(code, 0, err);
  assert.equal(err, "");
  const lines = out.split("\n");
  assert.match(lines[0], /^ {2}KIND +REF +BUILT +IMAGES +SUMMARY$/);
  const body = lines.slice(1).map((l) => l.replace(/\s+/g, " ").trim());
  assert.deepEqual(body, [
    "main sha-aaaaaaa 2026-11-27 15:14 building feat(backup): keep lossless out of the remote backup target…",
    "main sha-bbbbbbb 2026-11-27 12:55 ready ● feat(settings): contextual guidance (#1319)",
    "main sha-ccccccc 2026-11-27 10:00 failed fix: a broken build (#1318)",
    "release v0.4.2 2026-11-26 12:02 ready chore: release main (#1309)",
    "main sha-ddddddd 2026-11-26 09:00 no run chore: never built (#1317)",
    "release v0.4.1 2026-11-20 08:30 no run chore: release main (#1290)",
  ]);
  const calls = box.calls();
  assert.equal(calls.filter((c) => c.startsWith("gh ")).length, 1);
  assert.match(
    calls.find((c) => c.startsWith("gh ")),
    /--workflow docker-publish\.yml .*--json headSha,headBranch,status,conclusion,createdAt/,
  );
  assert.match(
    calls.find((c) => c.startsWith("ssh ")),
    /-o ConnectTimeout=5 .*deploy@prod\.test cd '\/srv\/stack' && docker compose ps app/,
  );
  assert.equal(
    calls.some((c) => c.startsWith("just ") || c.startsWith("fzf ")),
    false,
  );
});

test("--list never prompts even when fzf is installed", async (t) => {
  const box = sandbox(t);
  const { code, prompt } = await pick(box, ["--list"], { input: ["1\n", "y\n"] });
  assert.equal(code, 0);
  assert.equal(prompt, "");
  assert.equal(
    box.calls().some((c) => /^(fzf|just) /.test(c)),
    false,
  );
});

test("a failing ssh warns, drops the marker and carries on", async (t) => {
  const box = sandbox(t, { env: { STUB_SSH_FAIL: "1" } });
  const { code, out, err } = await pick(box, ["--list"]);
  assert.equal(code, 0);
  assert.match(
    err,
    /warning: could not read what is running on deploy@prod\.test \(ssh: connect to host timed out\); showing no ● marker\./,
  );
  assert.doesNotMatch(out, /●/);
  assert.match(out, /sha-bbbbbbb/);
});

test("an unreadable image reference also warns", async (t) => {
  const box = sandbox(t, { sshOut: "" });
  const { code, err } = await pick(box, ["--list"]);
  assert.equal(code, 0);
  assert.match(err, /no image reported/);
});

test("a missing ssh binary warns instead of failing the listing", async (t) => {
  const box = sandbox(t, { stubs: ["git", "gh"], env: {} });
  const { code, err, out } = await pick(box, ["--list"]);
  assert.equal(code, 0);
  assert.match(err, /warning: could not read what is running/);
  assert.match(out, /sha-aaaaaaa/);
});

test("the placeholder host is refused before anything is called", async (t) => {
  const box = sandbox(t);
  for (const host of ["your-server.example.com", "", "deploy@example.com"]) {
    const { code, err } = await pick(box, ["--list"], { host });
    assert.equal(code, 1);
    assert.match(err, /PROD_HOST is not set/);
    assert.match(err, /shell profile or a direnv\n\.envrc; \.envrc\.example/);
  }
  assert.deepEqual(box.calls(), []);
});

test("an empty stack dir is refused", async (t) => {
  const box = sandbox(t);
  const { code, err } = await pick(box, ["--list"], { stackDir: "" });
  assert.equal(code, 1);
  assert.match(err, /PROD_STACK_DIR is empty/);
});

test("--limit bounds the rows of each kind", async (t) => {
  const box = sandbox(t);
  const { code, out } = await pick(box, ["--list", "--limit", "1"]);
  assert.equal(code, 0);
  assert.equal(out.split("\n").length - 1, 2);
  assert.match(out, /sha-aaaaaaa/);
  assert.match(out, /v0\.4\.2/);
  assert.doesNotMatch(out, /sha-bbbbbbb|v0\.4\.1/);
  const calls = box.calls();
  assert.ok(calls.some((c) => /^git log -n1 /.test(c)));
  assert.ok(calls.some((c) => /^git log --no-walk=unsorted .* v0\.4\.2 --$/.test(c)));
});

test("the default limit is five of each kind and timestamp tags are never listed", async (t) => {
  const box = sandbox(t);
  const { out } = await pick(box, ["--list"]);
  assert.doesNotMatch(out, /v2026/);
  assert.ok(box.calls().some((c) => /^git log -n5 /.test(c)));
  assert.ok(box.calls().some((c) => / v0\.4\.2 v0\.4\.1 v0\.4\.0 --$/.test(c)));
});

test("numbered prompt: a ready row runs the matching recipe after confirmation", async (t) => {
  const box = sandbox(t);
  const { code, prompt, out } = await pick(box, ["--no-fzf"], { input: ["2\ny\n"] });
  assert.equal(code, 0);
  assert.match(out, / 2\) main +sha-bbbbbbb/);
  assert.match(
    prompt,
    /Run `just deploy-rc bbbbbbb` against deploy@prod\.test:\/srv\/stack\? \[y\/N\] /,
  );
  assert.equal(
    box.calls().at(-1),
    "just registry=ghcr.io/example prod_host=deploy@prod.test prod_stack_dir=/srv/stack deploy-rc bbbbbbb",
  );
});

test("numbered prompt: a release runs `just deploy vX.Y.Z`", async (t) => {
  const box = sandbox(t);
  const { code } = await pick(box, ["--no-fzf"], { input: ["4\nyes\n"] });
  assert.equal(code, 0);
  assert.match(box.calls().at(-1), /^just .* deploy v0\.4\.2$/);
});

test("numbered prompt: rows that are not ready are refused and the prompt asks again", async (t) => {
  const box = sandbox(t);
  const { code, out } = await pick(box, ["--no-fzf"], { input: ["1\n3\n5\n9\nx\n2\ny\n"] });
  assert.equal(code, 0);
  assert.match(out, /sha-aaaaaaa cannot be deployed: images are building\./);
  assert.match(out, /sha-ccccccc cannot be deployed: images are failed\./);
  assert.match(out, /sha-ddddddd cannot be deployed: images are no run\./);
  assert.match(out, /Not a row: 9/);
  assert.match(out, /Not a row: x/);
  assert.equal(box.calls().filter((c) => c.startsWith("just ")).length, 1);
});

test("numbered prompt: quitting, end of input, or declining deploys nothing", async (t) => {
  for (const input of [["q\n"], ["\n"], [], ["2\nn\n"], ["2\n"]]) {
    const box = sandbox(t);
    const { code, out } = await pick(box, ["--no-fzf"], { input });
    assert.equal(code, 0);
    assert.match(out, /Nothing deployed\./);
    assert.equal(
      box.calls().some((c) => c.startsWith("just ")),
      false,
    );
  }
});

test("fzf path: the chosen ready row runs its recipe", async (t) => {
  const box = sandbox(t, { env: { STUB_FZF_PICK: "2" } });
  const { code, prompt } = await pick(box, [], { input: ["y\n"] });
  assert.equal(code, 0);
  assert.match(prompt, /just deploy-rc bbbbbbb/);
  assert.ok(box.calls().some((c) => /^fzf --delimiter/.test(c)));
  assert.match(box.calls().at(-1), /^just .* deploy-rc bbbbbbb$/);
});

test("fzf path: a row that is not ready cannot be deployed", async (t) => {
  const box = sandbox(t, { env: { STUB_FZF_PICK: "1" } });
  const { code, err } = await pick(box, []);
  assert.equal(code, 1);
  assert.match(err, /sha-aaaaaaa cannot be deployed: images are building\./);
  assert.equal(
    box.calls().some((c) => c.startsWith("just ")),
    false,
  );
});

test("fzf path: cancelling deploys nothing", async (t) => {
  const box = sandbox(t, { env: { STUB_FZF_EXIT: "130" } });
  const { code, out } = await pick(box, []);
  assert.equal(code, 0);
  assert.match(out, /Nothing deployed\./);
  assert.equal(
    box.calls().some((c) => c.startsWith("just ")),
    false,
  );
});

test("fzf path: unusable output counts as a cancel", async (t) => {
  const box = sandbox(t, { env: { STUB_FZF_PICK: "40" } });
  const { code, out } = await pick(box, []);
  assert.equal(code, 0);
  assert.match(out, /Nothing deployed\./);
});

test("without fzf the numbered prompt is used", async (t) => {
  const box = sandbox(t, { stubs: ["git", "gh", "ssh", "just"] });
  const { code, out } = await pick(box, [], { input: ["2\ny\n"] });
  assert.equal(code, 0);
  assert.match(out, /Deploy which row|1\) main/);
  assert.match(box.calls().at(-1), /deploy-rc bbbbbbb$/);
});

test("the recipe's exit status is passed back, and a registry is optional", async (t) => {
  const box = sandbox(t, { env: { STUB_JUST_EXIT: "3" } });
  const out = [];
  const code = await main(["--host", HOST, "--stack-dir", DIR, "--no-fzf"], {
    env: box.env,
    out: (x) => out.push(x),
    err: () => {},
    stdin: Readable.from(["2\ny\n"]),
    stdout: { write: () => {} },
  });
  assert.equal(code, 3);
  assert.equal(
    box.calls().at(-1),
    "just prod_host=deploy@prod.test prod_stack_dir=/srv/stack deploy-rc bbbbbbb",
  );
});

test("a missing just is reported", async (t) => {
  const box = sandbox(t, { stubs: ["git", "gh", "ssh"] });
  const { code, err } = await pick(box, ["--no-fzf"], { input: ["2\ny\n"] });
  assert.equal(code, 1);
  assert.match(err, /could not run just/);
});

test("gh and git failures stop with a clear message", async (t) => {
  let box = sandbox(t, { env: { STUB_GH_FAIL: "1" } });
  let r = await pick(box, ["--list"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /deploy-pick: gh run list failed: gh: boom/);

  box = sandbox(t, { stubs: ["git", "ssh"] });
  r = await pick(box, ["--list"]);
  assert.equal(r.code, 1);
  assert.match(r.err, /gh is required but was not found on PATH/);
});

test("a failed git fetch warns and uses local refs", async (t) => {
  const box = sandbox(t, { env: { STUB_GIT_FETCH_EXIT: "1" } });
  const { code, err, out } = await pick(box, ["--list"]);
  assert.equal(code, 0);
  assert.match(err, /git fetch failed/);
  assert.match(out, /sha-bbbbbbb/);
});

test("no tags and no runs still lists main commits as no run", async (t) => {
  const box = sandbox(t);
  writeFileSync(join(box.dir, "tags"), "");
  writeFileSync(join(box.dir, "runs.json"), "");
  const { code, out } = await pick(box, ["--list"]);
  assert.equal(code, 0);
  assert.doesNotMatch(out, /release/);
  assert.equal((out.match(/no run/g) ?? []).length, 4);
  assert.equal(
    box.calls().some((c) => c.startsWith("git log --no-walk")),
    false,
  );
});

test("nothing to list is an error", async (t) => {
  const box = sandbox(t);
  writeFileSync(join(box.dir, "tags"), "");
  writeFileSync(join(box.dir, "main"), "");
  const { code, err } = await pick(box, ["--list"]);
  assert.equal(code, 1);
  assert.match(err, /no releases or main commits found/);
});

test("usage errors exit 2 and --help prints usage", async (t) => {
  const box = sandbox(t);
  let r = await pick(box, ["--bogus"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /unknown argument: --bogus[\s\S]*Usage:/);
  r = await pick(box, ["--limit", "0"]);
  assert.equal(r.code, 2);
  r = await pick(box, ["--help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /Usage: just deploy-pick/);
});

test("the CLI entry point runs against the real process streams", async (t) => {
  const box = sandbox(t);
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync(
    process.execPath,
    [
      new URL("./deploy-pick.mjs", import.meta.url).pathname,
      "--host",
      "your-server.example.com",
      "--stack-dir",
      DIR,
      "--list",
    ],
    { env: box.env, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PROD_HOST is not set/);
});
