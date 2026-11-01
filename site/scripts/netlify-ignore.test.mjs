import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { classify } from "../../.github/scripts/ci-changes.mjs";

const script = fileURLToPath(new URL("./netlify-ignore.sh", import.meta.url));
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Ignore test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Ignore test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
};
function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    env: gitEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "netlify-ignore-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, "init", "-b", "main");
  function commit(path, content = path) {
    mkdirSync(dirname(join(origin, path)), { recursive: true });
    writeFileSync(join(origin, path), content);
    git(origin, "add", ".");
    git(origin, "commit", "-qm", path);
    return git(origin, "rev-parse", "HEAD");
  }
  commit("site/index.html");
  commit("docs/start.md");
  const base = commit("CHANGELOG.md");
  function clone(branch = "main") {
    const repo = join(root, "clone");
    git(root, "clone", "--quiet", "--depth=1", "--branch", branch, `file://${origin}`, repo);
    return repo;
  }
  return { root, origin, base, commit, clone };
}
function run(repo, env = {}, expected = 1, reason = expected === 0 ? /skip/ : /build/) {
  const cleanEnv = { ...gitEnv };
  for (const key of [
    "CONTEXT",
    "COMMIT_REF",
    "CACHED_COMMIT_REF",
    "HEAD",
    "BRANCH",
    "INCOMING_HOOK_TITLE",
    "INCOMING_HOOK_URL",
    "INCOMING_HOOK_BODY",
  ])
    delete cleanEnv[key];
  const result = spawnSync("bash", [script], {
    cwd: join(repo, "site"),
    env: { ...cleanEnv, ...env },
    encoding: "utf8",
  });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim().split("\n").length, 1);
  assert.match(result.stdout, /^netlify-ignore: /);
  assert.match(result.stdout, reason);
}

for (const key of ["INCOMING_HOOK_TITLE", "INCOMING_HOOK_URL", "INCOMING_HOOK_BODY"]) {
  test(`hook identified by ${key} always builds, even without git or other variables`, (t) => {
    const f = fixture(t);
    rmSync(join(f.origin, ".git"), { recursive: true });
    run(f.origin, { [key]: "{}" }, 1, /build hook/);
  });
}

// Compare actual shell decisions to CI's content filter, including deletions,
// renames out of watched paths, and near misses on each watched path.
for (const path of [
  "my-collection-search/app.ts",
  "site/page.html",
  "docs/guide.md",
  "CHANGELOG.md",
  "site-other/file",
  "docs-other/file",
  "CHANGELOG.md.bak",
]) {
  test(`preview content filter matches CI: ${path}`, (t) => {
    const f = fixture(t);
    git(f.origin, "checkout", "-qb", "preview");
    f.commit(path, "changed");
    git(f.origin, "checkout", "main");
    f.commit("docs/base-only.md"); // Must not count changes made only on main.
    const repo = f.clone("preview");
    run(
      repo,
      { CONTEXT: "deploy-preview", CACHED_COMMIT_REF: "invalid", HEAD: "preview", BRANCH: "main" },
      classify([path]).site ? 1 : 0,
    );
  });
}

for (const operation of ["delete", "rename"]) {
  test(`preview builds after ${operation} of a watched file`, (t) => {
    const f = fixture(t);
    git(f.origin, "checkout", "-qb", "preview");
    if (operation === "delete") git(f.origin, "rm", "docs/start.md");
    else git(f.origin, "mv", "docs/start.md", "app-file.md");
    git(f.origin, "commit", "-qm", operation);
    run(f.clone("preview"), { CONTEXT: "deploy-preview" });
  });
}

test("preview deepens both histories when the merge-base is beyond 200 commits", (t) => {
  const f = fixture(t);
  git(f.origin, "checkout", "-qb", "preview");
  f.commit("my-collection-search/app.ts");
  git(f.origin, "checkout", "main");
  const tree = git(f.origin, "rev-parse", "HEAD^{tree}");
  let parent = f.base;
  for (let i = 0; i < 205; i++)
    parent = git(f.origin, "commit-tree", tree, "-p", parent, "-m", `main ${i}`);
  git(f.origin, "reset", "--hard", parent);
  const repo = f.clone("preview");
  run(repo, { CONTEXT: "deploy-preview" }, 0, /skip/);
  assert.equal(git(repo, "rev-parse", "--is-shallow-repository"), "false");
});

for (const context of ["production", "branch-deploy"]) {
  for (const path of ["my-collection-search/app.ts", "docs/guide.md"]) {
    test(`${context} fetches missing cached ref: ${path}`, (t) => {
      const f = fixture(t);
      const head = f.commit(path);
      const repo = f.clone();
      assert.equal(spawnSync("git", ["cat-file", "-e", f.base], { cwd: repo }).status, 1);
      run(
        repo,
        { CONTEXT: context, COMMIT_REF: head, CACHED_COMMIT_REF: f.base },
        classify([path]).site ? 1 : 0,
      );
      assert.equal(git(repo, "rev-parse", "--verify", `${f.base}^{commit}`), f.base);
    });
  }
  test(`${context} skips equal cached and current refs without a hook`, (t) => {
    const f = fixture(t);
    run(f.clone(), { CONTEXT: context, COMMIT_REF: f.base, CACHED_COMMIT_REF: f.base }, 0, /skip/);
  });
}

for (const env of [
  {},
  { CONTEXT: "dev" },
  { CONTEXT: "production" },
  { CONTEXT: "production", CACHED_COMMIT_REF: "invalid" },
  { CONTEXT: "production", CACHED_COMMIT_REF: "invalid", COMMIT_REF: "invalid" },
]) {
  test(`missing or invalid metadata builds: ${JSON.stringify(env)}`, (t) => {
    const f = fixture(t);
    run(f.clone(), env);
  });
}

test("unfetchable cached ref builds", (t) => {
  const f = fixture(t);
  run(
    f.clone(),
    { CONTEXT: "production", COMMIT_REF: f.base, CACHED_COMMIT_REF: "a".repeat(40) },
    1,
    /cannot fetch/,
  );
});

test("preview fetch failure builds even if cached and current refs are equal", (t) => {
  const f = fixture(t);
  const repo = f.clone();
  git(repo, "remote", "remove", "origin");
  run(
    repo,
    { CONTEXT: "deploy-preview", COMMIT_REF: f.base, CACHED_COMMIT_REF: f.base },
    1,
    /cannot fetch/,
  );
});

test("unrelated preview history builds when there is no merge-base", (t) => {
  const f = fixture(t);
  git(f.origin, "checkout", "--orphan", "preview");
  git(f.origin, "commit", "-qm", "unrelated");
  run(f.clone("preview"), { CONTEXT: "deploy-preview" }, 1, /no merge-base/);
});

test("git diff error builds", (t) => {
  const f = fixture(t);
  const repo = f.clone();
  // Inject a diff failure after resolving real commits in the temporary repo.
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh\nif [ "$1" = diff ]; then exit 128; fi\nexec "${realGit}" "$@"\n`,
    { mode: 0o755 },
  );
  run(
    repo,
    {
      CONTEXT: "production",
      COMMIT_REF: f.base,
      CACHED_COMMIT_REF: f.base,
      PATH: `${bin}:${process.env.PATH}`,
    },
    1,
    /git diff failed/,
  );
});
