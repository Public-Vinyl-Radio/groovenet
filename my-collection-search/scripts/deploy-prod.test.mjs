import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function deployment({ players = false, template = false, base = true, failBuild = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'groovenet-prod-'));
  try {
    const scripts = join(root, 'my-collection-search/scripts');
    const bin = join(root, 'bin');
    mkdirSync(scripts, { recursive: true }); mkdirSync(bin);
    mkdirSync(join(root, 'my-collection-search/migrations'));
    writeFileSync(join(root, 'my-collection-search/migrations/123_players.js'), '');
    copyFileSync(new URL('./deploy-prod.sh', import.meta.url), join(scripts, 'deploy-prod.sh'));
    if (base) writeFileSync(join(root, '.env'), 'POSTGRES_PASSWORD=collection-secret\n');
    if (players) writeFileSync(join(root, '.env.players'), 'PLAYER_API_KEY=player-secret\n', { mode: 0o600 });
    if (template) writeFileSync(join(root, '.env.tpl'), 'POSTGRES_PASSWORD=op://example\n');
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    // A fake op only removes its wrapper arguments, then runs fake Docker.
    writeFileSync(join(bin, 'op'), '#!/bin/sh\nshift 4\nexec "$@"\n', { mode: 0o755 });
    writeFileSync(join(bin, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> "$DEPLOY_TEST_LOG"
case "$*" in
  *"build player-clock player-worker"*) exit "$DEPLOY_TEST_BUILD_STATUS" ;;
  *"SELECT EXISTS"*) echo t ;;
esac
`, { mode: 0o755 });
    const log = join(root, 'calls');
    const result = spawnSync('bash', [join(scripts, 'deploy-prod.sh'), 'sha-1234567'], {
      env: { PATH: `${bin}:${process.env.PATH}`, MIN_FREE_GB: '0', DEPLOY_TEST_LOG: log, DEPLOY_TEST_BUILD_STATUS: failBuild ? '1' : '0' },
      encoding: 'utf8',
    });
    return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n'), root };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const template of [false, true]) {
  test(`retains ordinary deployment without players (template=${template})`, () => {
    const run = deployment({ template, base: !template });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.calls.some((call) => call.includes('up -d --remove-orphans')));
    for (const call of run.calls) {
      assert.ok(!call.includes('.env.players') && !call.includes('docker-compose.players.yml'));
      assert.ok(!call.includes('build player-clock player-worker'));
    }
  });
  test(`includes players throughout deployment (template=${template})`, () => {
    const run = deployment({ players: true, template, base: !template });
    assert.equal(run.status, 0, run.stderr);
    for (const call of run.calls) {
      assert.ok(call.includes(`--env-file ${run.root}/.env.players --profile players`));
      assert.ok(call.includes('-p dj-playlist'));
      assert.ok(call.includes('-f docker-compose.players.yml'));
      assert.ok(!call.includes('player-secret') && !call.includes('collection-secret'));
    }
    const build = run.calls.findIndex((call) => call.includes('build player-clock player-worker'));
    const up = run.calls.findIndex((call) => call.includes('up -d db redis'));
    assert.ok(build >= 0 && build < up);
    assert.ok(run.calls.at(-1).endsWith('up -d --remove-orphans'));
    assert.ok(!run.calls.find((call) => call.includes(' pull ')).includes('player-worker'));
  });
}

test('an image build failure stops deployment before touching running services', () => {
  const run = deployment({ players: true, failBuild: true });
  assert.equal(run.status, 1);
  assert.ok(!run.calls.some((call) => call.includes(' up ') || call.includes(' run ')));
});

test('player-only settings can augment a deployment without a base env file', () => {
  const run = deployment({ players: true, base: false });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.every((call) => call.includes('.env.players')));
});

function remoteDeployment({ optedIn = true, validSecrets = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'groovenet-op-deploy-'));
  try {
    const bin = join(root, 'bin'); mkdirSync(bin);
    const scripts = join(root, 'my-collection-search/scripts'); mkdirSync(scripts, { recursive: true });
    copyFileSync(new URL('./render-player-env.mjs', import.meta.url), join(scripts, 'render-player-env.mjs'));
    copyFileSync(new URL('../../.env.players.tpl', import.meta.url), join(root, '.env.players.tpl'));
    const justfile = readFileSync(new URL('../../justfile', import.meta.url), 'utf8');
    const recipe = justfile.split('deploy-prod-remote:\n')[1].split('\n# Pulls images')[0]
      .replace(/^  /gm, '').replaceAll('{{prod_host}}', 'fixture-host')
      .replaceAll('{{prod_stack_dir}}', '/fixture').replaceAll('{{tag}}', 'sha-1234567');
    const script = join(root, 'deploy.sh'); writeFileSync(script, recipe);
    const log = join(root, 'calls');
    writeFileSync(join(bin, 'ssh'), `#!/bin/sh
printf 'ssh %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
case "$*" in *"test -f "*) exit "$DEPLOY_TEST_OPT_IN" ;; esac
`, { mode: 0o755 });
    writeFileSync(join(bin, 'op'), '#!/bin/sh\nprintf "op run\\n" >> "$DEPLOY_TEST_LOG"\nshift 4\nexec "$@"\n', { mode: 0o755 });
    writeFileSync(join(bin, 'scp'), '#!/bin/sh\nprintf "scp\\n" >> "$DEPLOY_TEST_LOG"\ncp "$1" "$DEPLOY_TEST_CAPTURE"\n', { mode: 0o755 });
    const capture = join(root, 'captured.env');
    const result = spawnSync('bash', [script], { cwd: root, encoding: 'utf8', env: {
      PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_LOG: log, DEPLOY_TEST_OPT_IN: optedIn ? '0' : '1', DEPLOY_TEST_CAPTURE: capture,
      PLAYER_API_KEY: validSecrets ? 'test-api-key-'.repeat(5) : 'short', PLAYER_ENGINE_A_PASSWORD: 'engine-a', PLAYER_ENGINE_B_PASSWORD: 'engine-b',
    } });
    return { ...result, calls: readFileSync(log, 'utf8'), rendered: optedIn && validSecrets ? readFileSync(capture, 'utf8') : '' };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('remote deployment refreshes opted-in player secrets from op before deploying', () => {
  const run = remoteDeployment();
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.includes('op run\nscp\nssh fixture-host chmod 600 /fixture/.env.players'));
  assert.ok(run.rendered.includes('PLAYER_API_KEY="test-api-key-'));
  assert.ok(!run.calls.includes('test-api-key-'));
  assert.ok(run.calls.indexOf('scp') < run.calls.indexOf('git fetch'));
});

test('remote deployment leaves hosts without .env.players opted out', () => {
  const run = remoteDeployment({ optedIn: false });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(!run.calls.includes('op run') && !run.calls.includes('scp'));
  assert.ok(run.calls.includes('git fetch'));
});

test('invalid op credentials stop remote deployment before copying or restarting anything', () => {
  const run = remoteDeployment({ validSecrets: false });
  assert.equal(run.status, 1);
  assert.ok(!run.calls.includes('scp') && !run.calls.includes('git fetch'));
  assert.match(run.stderr, /at least 32 characters/);
});
