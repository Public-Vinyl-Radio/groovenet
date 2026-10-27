import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep the marker inside the dependency volume: a new/cleared volume always
// installs, and an interrupted/failed install must never leave a valid marker.
export function ensureDevDependencies(appDirectory = process.cwd(), run = execFileSync) {
  const marker = resolve(appDirectory, 'node_modules/.groovenet-install');
  const hash = createHash('sha256');
  for (const file of ['package.json', 'package-lock.json', '../packages/groovenet-contracts/package.json', '../packages/groovenet-client/package.json']) {
    hash.update(readFileSync(resolve(appDirectory, file)));
    hash.update('\0');
  }
  hash.update(JSON.stringify({
    node: process.version,
    npm: run('npm', ['--version'], { encoding: 'utf8', cwd: appDirectory }).trim(),
    platform: process.platform,
    arch: process.arch,
  }));
  const fingerprint = hash.digest('hex');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === fingerprint
      && existsSync(resolve(appDirectory, 'node_modules/.bin/next'))) {
    console.log('Dev dependencies unchanged; skipping npm ci');
    return false;
  }

  rmSync(marker, { force: true });
  run('npm', ['ci'], { cwd: appDirectory, stdio: 'inherit' });
  writeFileSync(marker, fingerprint);
  return true;
}

if (import.meta.main) ensureDevDependencies();
