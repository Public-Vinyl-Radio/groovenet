import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { changedFiles, classify, writeOutputs } from "./ci-changes.mjs";

const enabled = (files) =>
  Object.entries(classify(files))
    .filter(([, value]) => value)
    .map(([key]) => key)
    .sort();

test("web design changes skip services, SDKs and database jobs", () => {
  assert.deepEqual(
    enabled([
      "my-collection-search/src/components/AlbumResult.tsx",
      "my-collection-search/src/app/albums/page.tsx",
    ]),
    ["ci_image", "lint", "web", "webapp"],
  );
});

test("service edits select their own suite and image", () => {
  assert.deepEqual(enabled(["fingerprint-service/fingerprint_service/worker.py"]), [
    "ci_image",
    "fingerprint",
    "fingerprint_service",
  ]);
  assert.deepEqual(enabled(["download-worker/uv.lock"]), ["download", "download_worker"]);
  assert.deepEqual(enabled(["ga-service/main.py"]), ["ga", "ga_service"]);
  assert.deepEqual(enabled(["essentia-api/Dockerfile"]), ["essentia"]);
});

test("shared clients and contracts select downstream consumers", () => {
  for (const key of [
    "python",
    "download",
    "fingerprint",
    "download_worker",
    "fingerprint_service",
  ]) {
    assert.equal(classify(["packages/groovenet-python/src/client.py"])[key], true, key);
  }
  for (const key of ["contracts", "client", "player", "cli", "web", "python", "migrate", "redis"]) {
    assert.equal(classify(["packages/groovenet-contracts/src/index.ts"])[key], true, key);
  }
  for (const key of ["cli", "web", "webapp"])
    assert.equal(classify(["packages/groovenet-client/src/client.ts"])[key], true, key);
  assert.equal(classify(["packages/groovenet-player/src/server/store.ts"]).migrate, true);
});

test("server, migration and API edits retain contract and integration checks", () => {
  for (const path of [
    "src/api-contract/routes.ts",
    "src/server/db.ts",
    "src/app/api/tracks/route.ts",
    "migrations/001.js",
    "package-lock.json",
    "scripts/generate-openapi-json.ts",
    "tsconfig.json",
  ]) {
    const result = classify([`my-collection-search/${path}`]);
    for (const key of ["web", "python", "migrate", "redis"])
      assert.equal(result[key], true, `${path}: ${key}`);
  }
});

test("workflow and toolchain edits rerun tests; main always has every release image", () => {
  for (const path of [
    ".github/workflows/test.yml",
    ".github/workflows/changes.yml",
    ".github/scripts/ci-changes.mjs",
    ".mise.toml",
  ]) {
    const result = classify([path]);
    for (const key of ["web", "fingerprint", "download", "ga", "client", "cli", "python"])
      assert.equal(result[key], true, `${path}: ${key}`);
  }
  assert.equal(classify(["README.md"], { mainPush: true }).force_all, true);
  assert.ok(Object.values(classify([], { full: true })).every(Boolean));
  assert.deepEqual(enabled(["README.md", "ios/app.swift"]), []);
});

test("workspace manifests affect installation and npm toolchain checks retain coverage", () => {
  assert.equal(classify(["packages/groovenet-cli/package.json"]).webapp, true);
  assert.equal(classify(["package-lock.json"]).client, true);
  assert.equal(classify(["scripts/check-npm-toolchain.mjs"]).client, true);
});

test("git comparison handles diverged PR bases, multi-commit pushes, renames and deletes", () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-changes-"));
  const git = (args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const commit = (message) => {
    git(["add", "-A"]);
    git(["commit", "-qm", message]);
    return git(["rev-parse", "HEAD"]).trim();
  };
  try {
    git(["init", "-q"]);
    git(["config", "user.name", "CI Test"]);
    git(["config", "user.email", "ci@example.invalid"]);
    writeFileSync(join(dir, "old.txt"), "original\n");
    const base = commit("base");
    git(["checkout", "-qb", "feature"]);
    git(["mv", "old.txt", "new.txt"]);
    commit("rename");
    writeFileSync(join(dir, "ui.txt"), "design\n");
    const head = commit("design");
    git(["checkout", "--detach", base]);
    writeFileSync(join(dir, "base-only.txt"), "other change\n");
    const target = commit("base advanced");
    const expected = ["new.txt", "old.txt", "ui.txt"];
    assert.deepEqual(
      changedFiles(
        { pull_request: { base: { sha: target }, head: { sha: head } } },
        "pull_request",
        git,
      ).sort(),
      expected,
    );
    assert.deepEqual(changedFiles({ before: base, after: head }, "push", git).sort(), expected);
    assert.equal(changedFiles({ before: "0".repeat(40), after: head }, "push", git), null);
    assert.throws(() => changedFiles({ before: "missing-ref", after: head }, "push", git));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GitHub event input produces boolean outputs for Actions and falls back conservatively", () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-output-"));
  const env = {
    GITHUB_EVENT_PATH: join(dir, "event.json"),
    GITHUB_OUTPUT: join(dir, "outputs"),
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF: "refs/heads/main",
  };
  try {
    writeFileSync(env.GITHUB_EVENT_PATH, JSON.stringify({ before: "base", after: "head" }));
    writeOutputs(env, () => "my-collection-search/src/components/Album.tsx\0");
    const output = readFileSync(env.GITHUB_OUTPUT, "utf8");
    assert.match(output, /^web=true$/m);
    assert.match(output, /^fingerprint=false$/m);
    assert.match(output, /^force_all=true$/m);
    writeFileSync(env.GITHUB_OUTPUT, "");
    env.GITHUB_EVENT_NAME = "workflow_dispatch";
    writeOutputs(env);
    assert.ok(
      readFileSync(env.GITHUB_OUTPUT, "utf8")
        .trim()
        .split("\n")
        .every((line) => line.endsWith("=true")),
    );
    writeFileSync(env.GITHUB_EVENT_PATH, "invalid JSON");
    assert.throws(() => writeOutputs(env));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
