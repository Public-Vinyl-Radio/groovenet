// Points the Homebrew tap's groovenet-now-playing formula at a player release:
// the npm tarball (the main url) and the helper zip (the "app" resource).
//
//   node update-homebrew-formula.mjs FORMULA VERSION NPM_SHA256 APP_SHA256
//
// Rewrites only the url and sha256 lines of those two blocks, plus a top-level
// version line if the formula has one, and fails on any other layout rather
// than guessing. Prints "updated" or "unchanged".
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Two-space indent is the formula's top level; four is inside a block.
const LINE = /^( {2}| {4})(url|sha256|version) "[^"]*"$/;

export const npmTarballUrl = (version) =>
  `https://registry.npmjs.org/@groovenet/player/-/player-${version}.tgz`;

export const appZipUrl = (version) =>
  "https://github.com/Public-Vinyl-Radio/groovenet/releases/download/" +
  `groovenet-player-v${version}/groovenet-now-playing-${version}-macos-universal.zip`;

export function updateFormula(text, { version, npmSha256, appSha256 }) {
  if (!VERSION.test(version)) throw new Error(`Not a release version: ${version}`);
  for (const [name, sha] of Object.entries({ npmSha256, appSha256 }))
    if (!SHA256.test(sha)) throw new Error(`${name} is not a lowercase sha256: ${sha}`);

  const wanted = {
    main: { url: npmTarballUrl(version), sha256: npmSha256, version },
    app: { url: appZipUrl(version), sha256: appSha256 },
  };
  const seen = { main: new Set(), app: new Set() };
  let block = "main";
  const lines = text.split("\n").map((line) => {
    if (line === '  resource "app" do') block = "app";
    else if (line === "  end") block = "main";
    const match = LINE.exec(line);
    if (!match) return line;
    const [, indent, key] = match;
    // Top-level keys sit outside every block; the app's sit inside its resource.
    // Other blocks (service, test, another resource) are left alone.
    if ((indent.length === 4) !== (block === "app")) return line;
    const value = wanted[block][key];
    if (value === undefined) throw new Error(`Unexpected ${key} line in the ${block} block`);
    if (seen[block].has(key)) throw new Error(`More than one ${key} line in the ${block} block`);
    seen[block].add(key);
    return `${indent}${key} "${value}"`;
  });
  for (const [name, keys] of Object.entries({ main: ["url", "sha256"], app: ["url", "sha256"] }))
    for (const key of keys)
      if (!seen[name].has(key)) throw new Error(`No ${key} line in the ${name} block`);
  return lines.join("\n");
}

export function main(argv = process.argv.slice(2), log = console.log) {
  if (argv.length !== 4)
    throw new Error("Usage: update-homebrew-formula.mjs FORMULA VERSION NPM_SHA256 APP_SHA256");
  const [path, version, npmSha256, appSha256] = argv;
  const before = readFileSync(path, "utf8");
  const after = updateFormula(before, { version, npmSha256, appSha256 });
  if (after !== before) writeFileSync(path, after);
  log(after === before ? "unchanged" : "updated");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
