import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

export function checkNpmToolchain(root = repositoryRoot, run = execFileSync) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const pin = manifest.engines?.npm;
  if (!/^\d+\.\d+\.\d+$/.test(pin)) {
    throw new Error("package.json engines.npm must pin an exact npm version");
  }

  // .mise.toml uses a literal npm entry in [tools], not a version range.
  const mise = readFileSync(join(root, ".mise.toml"), "utf8");
  const misePin = mise.match(/^npm\s*=\s*"([^"]+)"\s*(?:#.*)?$/m)?.[1];
  const app = JSON.parse(readFileSync(join(root, "my-collection-search/package.json"), "utf8"));
  for (const [source, version] of [
    [".mise.toml npm", misePin],
    ["my-collection-search/package.json engines.npm", app.engines?.npm],
    ["npm on PATH", run("npm", ["--version"], { encoding: "utf8" }).trim()],
  ]) {
    if (version !== pin) {
      throw new Error(`${source}: expected npm ${pin}, got ${version}`);
    }
  }
  return pin;
}

if (import.meta.main) {
  console.log(`npm toolchain verified: ${checkNpmToolchain()}`);
}
