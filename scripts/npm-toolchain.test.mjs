import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkNpmToolchain } from "./check-npm-toolchain.mjs";

function fixture(
  t,
  { rootPin = "12.0.0", appPin = "12.0.0", mise = '[tools]\nnpm = "12.0.0"\n' } = {},
) {
  const root = mkdtempSync(join(tmpdir(), "groovenet-515-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "my-collection-search"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ engines: { npm: rootPin } }));
  writeFileSync(
    join(root, "my-collection-search/package.json"),
    JSON.stringify({ engines: { npm: appPin } }),
  );
  writeFileSync(join(root, ".mise.toml"), mise);
  return root;
}

test("accepts matching pins and the installed npm version", (t) => {
  const root = fixture(t);
  assert.equal(
    checkNpmToolchain(root, (command, args, options) => {
      assert.equal(command, "npm");
      assert.deepEqual(args, ["--version"]);
      assert.equal(options.encoding, "utf8");
      return "12.0.0\n";
    }),
    "12.0.0",
  );
});

for (const rootPin of ["^12.0.0", "latest", "12", null]) {
  test(`rejects a non-exact root pin: ${rootPin}`, (t) => {
    assert.throws(
      () => checkNpmToolchain(fixture(t, { rootPin })),
      /must pin an exact npm version/,
    );
  });
}

test("rejects a root manifest without engines", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "package.json"), "{}");
  assert.throws(() => checkNpmToolchain(root), /must pin an exact npm version/);
});

for (const mise of ['[tools]\nnpm = "11.18.0"\n', '[tools]\nnode = "26"\n']) {
  test(`rejects mise pin drift or omission: ${mise.trim()}`, (t) => {
    assert.throws(
      () => checkNpmToolchain(fixture(t, { mise }), () => "12.0.0"),
      /\.mise.toml npm: expected npm 12.0.0/,
    );
  });
}

test("allows a comment on the mise pin", (t) => {
  assert.equal(
    checkNpmToolchain(fixture(t, { mise: '[tools]\nnpm = "12.0.0" # pinned\n' }), () => "12.0.0"),
    "12.0.0",
  );
});

test("rejects app pin drift", (t) => {
  assert.throws(
    () => checkNpmToolchain(fixture(t, { appPin: "11.18.0" }), () => "12.0.0"),
    /my-collection-search\/package.json engines.npm: expected npm 12.0.0/,
  );
});

test("rejects an app manifest without engines", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "my-collection-search/package.json"), "{}");
  assert.throws(
    () => checkNpmToolchain(root, () => "12.0.0"),
    /engines.npm: expected npm 12.0.0, got undefined/,
  );
});

test("rejects the wrong npm on PATH", (t) => {
  assert.throws(
    () => checkNpmToolchain(fixture(t), () => "11.18.0\n"),
    /npm on PATH: expected npm 12.0.0, got 11.18.0/,
  );
});

test("propagates npm execution failure", (t) => {
  assert.throws(
    () =>
      checkNpmToolchain(fixture(t), () => {
        throw new Error("npm unavailable");
      }),
    /npm unavailable/,
  );
});

test("CLI resolves configuration from the repository, regardless of cwd", (t) => {
  const cwd = fixture(t, { rootPin: "wrong" });
  const script = fileURLToPath(new URL("./check-npm-toolchain.mjs", import.meta.url));
  assert.equal(
    execFileSync(process.execPath, [script], { cwd, encoding: "utf8" }),
    `npm toolchain verified: ${checkNpmToolchain()}\n`,
  );
});

test("CLI fails before installs when npm on PATH has drifted", (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, "npm"), "#!/bin/sh\necho 11.18.0\n", { mode: 0o755 });
  const script = fileURLToPath(new URL("./check-npm-toolchain.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    cwd,
    env: { ...process.env, PATH: `${cwd}:${process.env.PATH}` },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.ok(
    result.stderr.includes(`npm on PATH: expected npm ${checkNpmToolchain()}, got 11.18.0`),
  );
});
