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

function remoteDeployment({ optedIn = true, webOptedIn = false, validSecrets = true, validWebSecrets = true, setup = false, failCopy = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'groovenet-op-deploy-'));
  try {
    const bin = join(root, 'bin'); mkdirSync(bin);
    const scripts = join(root, 'my-collection-search/scripts'); mkdirSync(scripts, { recursive: true });
    copyFileSync(new URL('./render-player-env.mjs', import.meta.url), join(scripts, 'render-player-env.mjs'));
    copyFileSync(new URL('../../.env.players.tpl', import.meta.url), join(root, '.env.players.tpl'));
    copyFileSync(new URL('./render-player-web-env.mjs', import.meta.url), join(scripts, 'render-player-web-env.mjs'));
    copyFileSync(new URL('../../.env.player-web.tpl', import.meta.url), join(root, '.env.player-web.tpl'));
    const justfile = readFileSync(new URL('../../justfile', import.meta.url), 'utf8');
    const recipe = (setup ? justfile.split('player-web-setup:\n')[1].split('\ndeploy-prod-local:')[0] : justfile.split('deploy-prod-remote:\n')[1].split('\n# Pulls images')[0])
      .replace(/^  /gm, '').replaceAll('{{prod_host}}', 'fixture-host')
      .replaceAll('{{prod_stack_dir}}', '/fixture').replaceAll('{{tag}}', 'sha-1234567').replaceAll('{{mise_exec}}', '');
    const script = join(root, 'deploy.sh'); writeFileSync(script, recipe);
    const log = join(root, 'calls');
    writeFileSync(join(bin, 'ssh'), `#!/bin/sh
printf 'ssh %s\\n' "$*" >> "$DEPLOY_TEST_LOG"
case "$*" in
  *"test -f /fixture/.env.player-web.op"*) exit "$DEPLOY_TEST_WEB_OPT_IN" ;;
  *"test -f "*) exit "$DEPLOY_TEST_OPT_IN" ;;
esac
`, { mode: 0o755 });
    writeFileSync(join(bin, 'op'), '#!/bin/sh\nprintf "op run\\n" >> "$DEPLOY_TEST_LOG"\nshift 4\nexec "$@"\n', { mode: 0o755 });
    writeFileSync(join(bin, 'scp'), '#!/bin/sh\nprintf "scp\\n" >> "$DEPLOY_TEST_LOG"\n[ "$DEPLOY_TEST_COPY_FAIL" = "0" ] || exit 1\ncase "$2" in *".env.player-web") cp "$1" "$DEPLOY_TEST_WEB_CAPTURE" ;; *) cp "$1" "$DEPLOY_TEST_CAPTURE" ;; esac\n', { mode: 0o755 });
    const capture = join(root, 'captured.env');
    const webCapture = join(root, 'captured-web.env');
    const result = spawnSync('bash', [script], { cwd: root, encoding: 'utf8', env: {
      PATH: `${bin}:${process.env.PATH}`, DEPLOY_TEST_LOG: log, DEPLOY_TEST_OPT_IN: optedIn ? '0' : '1', DEPLOY_TEST_WEB_OPT_IN: webOptedIn ? '0' : '1', DEPLOY_TEST_CAPTURE: capture, DEPLOY_TEST_WEB_CAPTURE: webCapture, DEPLOY_TEST_COPY_FAIL: failCopy ? '1' : '0',
      PLAYER_API_KEY: validSecrets ? 'test-api-key-'.repeat(5) : 'short', PLAYER_ENGINE_A_PASSWORD: 'engine-a', PLAYER_ENGINE_B_PASSWORD: 'engine-b',
      PLAYER_WEB_ORIGIN: validWebSecrets ? 'https://fixture.example' : 'http://invalid', PLAYER_WEB_PASSPHRASE: 'web-passphrase-'.repeat(4), PLAYER_WEB_SESSION_SECRET: 'web-signing-secret-'.repeat(4),
    } });
    return { ...result, calls: readFileSync(log, 'utf8'), rendered: !setup && optedIn && validSecrets && !failCopy ? readFileSync(capture, 'utf8') : '', webRendered: (setup || webOptedIn) && validWebSecrets && validSecrets && !failCopy ? readFileSync(webCapture, 'utf8') : '' };
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


test('opted-in web settings refresh from op during normal deployment without leaking the worker key', () => {
  const run = remoteDeployment({ webOptedIn: true });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.webRendered.includes('PLAYER_WEB_ORIGIN="https://fixture.example"'));
  assert.ok(!run.webRendered.includes('PLAYER_API_KEY') && !run.webRendered.includes('test-api-key-'));
  assert.ok(run.calls.includes('ssh fixture-host chmod 600 /fixture/.env.player-web'));
  assert.equal(run.calls.split('op run').length - 1, 2);
  for (const secret of ['web-passphrase-', 'web-signing-secret-', 'test-api-key-']) assert.ok(!run.calls.includes(secret) && !run.stdout.includes(secret));
});

test('invalid web settings preserve the remote file and stop deployment', () => {
  const run = remoteDeployment({ webOptedIn: true, validWebSecrets: false });
  assert.equal(run.status, 1); assert.match(run.stderr, /exact HTTPS origin/);
  assert.ok(!run.calls.includes('chmod 600 /fixture/.env.player-web') && !run.calls.includes('git fetch'));
});

test('one-time web setup uploads settings privately without deploying or restarting audio services', () => {
  const run = remoteDeployment({ setup: true });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.webRendered.includes('PLAYER_WEB_PASSPHRASE='));
  assert.equal(run.calls, 'op run\nscp\nssh fixture-host chmod 600 /fixture/.env.player-web && touch /fixture/.env.player-web.op\n');
  assert.match(run.stdout, /normal deployment/);
});

for (const changes of [{ validWebSecrets: false }, { failCopy: true }]) test('failed web setup does not proceed to deployment or restart', () => {
  const run = remoteDeployment({ setup: true, ...changes });
  assert.equal(run.status, 1); assert.ok(!run.calls.includes('chmod 600') && !run.calls.includes('git fetch'));
});

test('deploy preserves manual web settings without the explicit op marker', () => {
  const run = remoteDeployment();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.calls.split('op run').length - 1, 1);
  assert.ok(run.calls.includes('test -f /fixture/.env.player-web.op'));
  assert.ok(!run.calls.includes('chmod 600 /fixture/.env.player-web'));
  assert.equal(run.webRendered, '');
});
