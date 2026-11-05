import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { appZipUrl, main, npmTarballUrl, updateFormula } from "./update-homebrew-formula.mjs";

// A copy of Formula/groovenet-now-playing.rb from Public-Vinyl-Radio/homebrew-tap.
const fixture = readFileSync(
  new URL("./fixtures/groovenet-now-playing.rb", import.meta.url),
  "utf8",
);
const npmSha256 = "a".repeat(64);
const appSha256 = "b".repeat(64);
const release = { version: "0.2.0", npmSha256, appSha256 };

const changedLines = (before, after) => {
  const a = before.split("\n");
  return after.split("\n").filter((line, i) => line !== a[i]);
};

test("rewrites the main and app url and sha256 lines, and nothing else", () => {
  const after = updateFormula(fixture, release);
  assert.deepEqual(changedLines(fixture, after), [
    '  url "https://registry.npmjs.org/@groovenet/player/-/player-0.2.0.tgz"',
    `  sha256 "${npmSha256}"`,
    `    url "${appZipUrl("0.2.0")}"`,
    `    sha256 "${appSha256}"`,
  ]);
  assert.equal(after.split("\n").length, fixture.split("\n").length);
});

test("the urls match the release asset names", () => {
  assert.equal(
    npmTarballUrl("1.2.3"),
    "https://registry.npmjs.org/@groovenet/player/-/player-1.2.3.tgz",
  );
  assert.equal(
    appZipUrl("1.2.3"),
    "https://github.com/Public-Vinyl-Radio/groovenet/releases/download/groovenet-player-v1.2.3/groovenet-now-playing-1.2.3-macos-universal.zip",
  );
});

test("is a no-op for the release the formula already names", () => {
  const once = updateFormula(fixture, release);
  assert.equal(updateFormula(once, release), once);
});

test("updates a top-level version line and leaves other blocks alone", () => {
  const formula = fixture
    .replace('  license "MIT"', '  version "0.1.11"\n  license "MIT"')
    .replace(
      '  APP = "',
      '  resource "other" do\n    url "https://example.com/other.tgz"\n    sha256 "' +
        "c".repeat(64) +
        '"\n  end\n\n  APP = "',
    );
  const changed = changedLines(formula, updateFormula(formula, release));
  assert.ok(changed.includes('  version "0.2.0"'));
  assert.equal(changed.length, 5);
  assert.match(updateFormula(formula, release), /url "https:\/\/example\.com\/other\.tgz"/);
});

test("rejects bad versions and checksums", () => {
  assert.throws(() => updateFormula(fixture, { ...release, version: "v0.2.0" }), /release version/);
  assert.throws(
    () => updateFormula(fixture, { ...release, npmSha256: "A".repeat(64) }),
    /npmSha256 is not a lowercase sha256/,
  );
  assert.throws(
    () => updateFormula(fixture, { ...release, appSha256: "b".repeat(63) }),
    /appSha256 is not a lowercase sha256/,
  );
});

test("fails on a layout it does not recognise", () => {
  const noResource = fixture.replace('  resource "app" do', '  resource "zip" do');
  assert.throws(() => updateFormula(noResource, release), /No url line in the app block/);
  const twoUrls = fixture.replace('  license "MIT"', '  url "https://example.com/x.tgz"');
  assert.throws(() => updateFormula(twoUrls, release), /More than one url line in the main block/);
  const appVersion = fixture.replace(/( {4}sha256 "[0-9a-f]+")/, '$1\n    version "0.1.11"');
  assert.throws(
    () => updateFormula(appVersion, release),
    /Unexpected version line in the app block/,
  );
  assert.throws(
    () => updateFormula("class X < Formula\nend\n", release),
    /No url line in the main block/,
  );
});

test("main rewrites the file once and reports whether it changed", () => {
  const dir = mkdtempSync(join(tmpdir(), "formula-"));
  try {
    const path = join(dir, "groovenet-now-playing.rb");
    writeFileSync(path, fixture);
    const logs = [];
    const args = [path, release.version, npmSha256, appSha256];
    main(args, (line) => logs.push(line));
    assert.equal(readFileSync(path, "utf8"), updateFormula(fixture, release));
    main(args, (line) => logs.push(line));
    assert.deepEqual(logs, ["updated", "unchanged"]);
    assert.throws(() => main([path], () => {}), /Usage/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the command line prints the result, or the error with exit status 1", () => {
  const script = fileURLToPath(new URL("./update-homebrew-formula.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "formula-"));
  try {
    const path = join(dir, "groovenet-now-playing.rb");
    writeFileSync(path, fixture);
    const ok = spawnSync(process.execPath, [script, path, "0.2.0", npmSha256, appSha256], {
      encoding: "utf8",
    });
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout, "updated\n");
    const bad = spawnSync(process.execPath, [script, path, "nope", npmSha256, appSha256], {
      encoding: "utf8",
    });
    assert.equal(bad.status, 1);
    assert.equal(bad.stderr, "Not a release version: nope\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
