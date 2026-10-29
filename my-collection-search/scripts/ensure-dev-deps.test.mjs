import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ensureDevDependencies } from "./ensure-dev-deps.mjs";

const inputs = [
  "package.json",
  "package-lock.json",
  "../packages/groovenet-contracts/package.json",
  "../packages/groovenet-client/package.json",
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "groovenet-dev-deps-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, "app");
  mkdirSync(app);
  mkdirSync(join(root, "packages/groovenet-contracts"), { recursive: true });
  mkdirSync(join(root, "packages/groovenet-client"), { recursive: true });
  for (const file of inputs) {
    writeFileSync(join(app, file), "{}");
  }
  let installs = 0;
  let npmVersion = "12.0.1";
  let fail = false;
  const marker = join(app, "node_modules/.groovenet-install");
  const next = join(app, "node_modules/.bin/next");
  function run(command, args, options) {
    assert.equal(command, "npm");
    assert.equal(options.cwd, app);
    if (args[0] === "--version") return npmVersion;
    assert.deepEqual(args, ["ci"]);
    assert.equal(options.stdio, "inherit");
    assert.equal(existsSync(marker), false);
    installs++;
    if (fail) throw new Error("install failed");
    mkdirSync(join(app, "node_modules/.bin"), { recursive: true });
    writeFileSync(next, "next");
  }
  return {
    app,
    run,
    marker,
    next,
    get installs() {
      return installs;
    },
    set npmVersion(value) {
      npmVersion = value;
    },
    set fail(value) {
      fail = value;
    },
  };
}

test("installs a fresh volume and skips an unchanged restart", (t) => {
  const f = fixture(t);
  assert.equal(ensureDevDependencies(f.app, f.run), true);
  assert.match(readFileSync(f.marker, "utf8"), /^[a-f0-9]{64}$/);
  assert.equal(ensureDevDependencies(f.app, f.run), false);
  assert.equal(f.installs, 1);
});

for (const file of inputs) {
  test(`reinstalls when ${file} changes`, (t) => {
    const f = fixture(t);
    ensureDevDependencies(f.app, f.run);
    writeFileSync(join(f.app, file), '{"changed":true}');
    assert.equal(ensureDevDependencies(f.app, f.run), true);
    assert.equal(f.installs, 2);
  });
}

test("reinstalls for a changed npm version or missing Next executable", (t) => {
  const f = fixture(t);
  ensureDevDependencies(f.app, f.run);
  f.npmVersion = "12.0.2";
  assert.equal(ensureDevDependencies(f.app, f.run), true);
  rmSync(f.next);
  assert.equal(ensureDevDependencies(f.app, f.run), true);
  assert.equal(f.installs, 3);
});

test("reinstalls when the Node version changes", (t) => {
  const f = fixture(t);
  ensureDevDependencies(f.app, f.run);
  const descriptor = Object.getOwnPropertyDescriptor(process, "version");
  try {
    Object.defineProperty(process, "version", { value: "v27.0.0" });
    assert.equal(ensureDevDependencies(f.app, f.run), true);
    assert.equal(f.installs, 2);
  } finally {
    Object.defineProperty(process, "version", descriptor);
  }
});

test("a failed install removes the old marker and retries on the next start", (t) => {
  const f = fixture(t);
  ensureDevDependencies(f.app, f.run);
  f.npmVersion = "12.0.2";
  f.fail = true;
  assert.throws(() => ensureDevDependencies(f.app, f.run), /install failed/);
  assert.equal(existsSync(f.marker), false);
  f.fail = false;
  assert.equal(ensureDevDependencies(f.app, f.run), true);
  assert.equal(f.installs, 3);
});

test("CLI uses its working directory and propagates an npm failure", (t) => {
  const f = fixture(t);
  const bin = join(f.app, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "npm"),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 12.0.1; else exit 42; fi\n',
    { mode: 0o755 },
  );
  const script = fileURLToPath(new URL("./ensure-dev-deps.mjs", import.meta.url));
  assert.throws(
    () =>
      execFileSync(process.execPath, [script], {
        cwd: f.app,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        stdio: "pipe",
      }),
    (error) => error.status !== 0 && /Command failed: npm ci/.test(error.stderr.toString()),
  );
  assert.equal(existsSync(f.marker), false);
});
