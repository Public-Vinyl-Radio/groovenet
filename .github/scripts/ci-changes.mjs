import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const testKeys = ['lint', 'web', 'contracts', 'client', 'player', 'cli', 'python', 'download', 'ga', 'fingerprint', 'migrate', 'redis'];
const buildKeys = ['webapp', 'essentia', 'ga_service', 'download_worker', 'fingerprint_service', 'force_all'];

export function classify(files, { full = false, mainPush = false } = {}) {
  const result = Object.fromEntries([...testKeys, ...buildKeys].map(key => [key, full]));
  const enable = (...keys) => keys.forEach(key => { result[key] = true; });
  for (const file of files) {
    if (/^(\.github\/(workflows\/(test|changes|ci-image)\.yml|actions\/|docker\/|scripts\/)|\.mise\.toml$|mise\.lock$|justfile$)/.test(file)) {
      enable(...testKeys);
    }
    if (/^(package(-lock)?\.json|packages\/[^/]+\/package\.json|mcp-server\/package\.json)$/.test(file)) {
      enable('lint', 'web', 'contracts', 'client', 'player', 'cli', 'python', 'migrate', 'redis', 'webapp');
    }
    if (file === 'eslint.config.node.mjs') enable('lint');
    if (file.startsWith('my-collection-search/')) enable('web', 'lint', 'webapp');
    // API generation and integration jobs consume server code, not UI components.
    if (/^my-collection-search\/(src\/(server\/|app\/api\/|api-contract\/|types\/)|scripts\/|migrations\/|config\/|[^/]+$)/.test(file)) {
      enable('python', 'migrate', 'redis');
    }
    if (file.startsWith('packages/groovenet-contracts/')) {
      enable('contracts', 'client', 'player', 'cli', 'web', 'python', 'migrate', 'redis', 'lint', 'webapp');
    }
    if (file.startsWith('packages/groovenet-client/')) enable('client', 'player', 'cli', 'migrate', 'lint');
    if (file.startsWith('packages/groovenet-player/')) enable('player', 'cli', 'migrate', 'lint');
    if (/^(packages\/groovenet-cli\/|mcp-server\/|evaluations\/)/.test(file)) enable('cli', 'lint');
    if (file.startsWith('scripts/') && /npm.*toolchain|check-npm-toolchain/.test(file)) enable('client', 'lint');
    if (file.startsWith('packages/groovenet-python/')) enable('python', 'download', 'fingerprint', 'download_worker', 'fingerprint_service');
    if (file.startsWith('download-worker/')) enable('download', 'download_worker');
    if (file.startsWith('fingerprint-service/')) enable('fingerprint', 'fingerprint_service');
    if (file.startsWith('ga-service/')) enable('ga', 'ga_service');
    if (file.startsWith('essentia-api/')) enable('essentia');
    if (['.github/workflows/docker-publish.yml', '.github/workflows/changes.yml', 'justfile', '.dockerignore'].includes(file) || file.startsWith('.github/scripts/')) {
      enable(...buildKeys);
    }
    if (file.startsWith('docker-compose') || file === '.env.example') enable('web', 'migrate', 'redis');
  }
  // Releases and deploy-rc require a complete set of sha-<commit> images.
  if (mainPush) result.force_all = true;
  result.ci_image = result.web || result.fingerprint;
  return result;
}

export function changedFiles(event, eventName, git = args => execFileSync('git', args, { encoding: 'utf8' })) {
  let base;
  let head;
  if (eventName === 'pull_request') {
    head = event.pull_request.head.sha;
    // Compare the PR branch against its fork point, excluding base-only changes.
    base = git(['merge-base', event.pull_request.base.sha, head]).trim();
  } else if (eventName === 'push' && event.before && !/^0+$/.test(event.before)) {
    base = event.before;
    head = event.after;
  } else {
    return null; // First push / unknown event: run everything conservatively.
  }
  // Include deletions and both names of renames; never truncate a large diff.
  return git(['diff', '--name-only', '--no-renames', '-z', base, head]).split('\0').filter(Boolean);
}

export function writeOutputs(env = process.env, git) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  // Git errors deliberately fail the detection job rather than silently skip tests.
  const files = changedFiles(event, env.GITHUB_EVENT_NAME, git);
  const result = classify(files ?? [], {
    full: files === null,
    mainPush: env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main',
  });
  const output = Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  appendFileSync(env.GITHUB_OUTPUT, output);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(writeOutputs());
}
