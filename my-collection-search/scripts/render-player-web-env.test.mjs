import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderPlayerWebEnv, writePlayerWebEnv } from './render-player-web-env.mjs';

const valid = {
  PLAYER_WEB_ORIGIN: 'https://groovenet.example:8443',
  PLAYER_WEB_PASSPHRASE: 'mock-web-passphrase-'.repeat(3),
  PLAYER_WEB_SESSION_SECRET: 'mock-session-secret-'.repeat(3),
  PLAYER_API_KEY: 'mock-worker-key-'.repeat(4),
};
const composeAvailable = spawnSync('docker', ['compose', 'version']).status === 0;
const readSettings = output => Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map(line => {
  const at = line.indexOf('=');
  return [line.slice(0, at), JSON.parse(line.slice(at + 1))];
}));

for (const name of ['PLAYER_WEB_PASSPHRASE', 'PLAYER_WEB_SESSION_SECRET', 'PLAYER_API_KEY']) {
  for (const value of [undefined, 'short', `${valid[name]}\n`, `${valid[name]}\r`, `${valid[name]}\0`]) {
    test(`rejects invalid ${name} (${value === undefined ? 'absent' : value.length}) without replacing existing settings`, () => {
      const root = mkdtempSync(join(tmpdir(), 'player-web-env-'));
      try {
        const output = join(root, '.env.player-web'); writeFileSync(output, 'existing settings');
        assert.throws(() => writePlayerWebEnv(output, { ...valid, [name]: value }), new RegExp(name));
        assert.equal(readFileSync(output, 'utf8'), 'existing settings'); assert.deepEqual(readdirSync(root), ['.env.player-web']);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}
for (const changes of [
  { PLAYER_WEB_PASSPHRASE: valid.PLAYER_API_KEY },
  { PLAYER_WEB_SESSION_SECRET: valid.PLAYER_API_KEY },
  { PLAYER_WEB_SESSION_SECRET: valid.PLAYER_WEB_PASSPHRASE },
]) test('rejects shared credentials', () => assert.throws(() => renderPlayerWebEnv({ ...valid, ...changes }), /must be distinct/));
for (const origin of [undefined, 'invalid', 'http://groovenet.example', 'https://groovenet.example/', 'https://groovenet.example/path', 'https://groovenet.example?secret', 'https://groovenet.example#fragment', 'https://user:password@groovenet.example']) {
  test(`rejects invalid origin (${origin})`, () => assert.throws(() => renderPlayerWebEnv({ ...valid, PLAYER_WEB_ORIGIN: origin }), /exact HTTPS origin/));
}
for (const days of ['', '0', '-1', '1.5', ' 2', '2 ', '+2', '1e2', '3651', '999999999999999999999']) {
  test(`rejects invalid session days (${days})`, () => assert.throws(() => renderPlayerWebEnv({ ...valid, PLAYER_WEB_SESSION_DAYS: days }), /PLAYER_WEB_SESSION_DAYS/));
}
for (const days of ['1', '30', '3650']) {
  test(`preserves configured session days (${days})`, () => {
    assert.match(renderPlayerWebEnv({ ...valid, PLAYER_WEB_SESSION_DAYS: days }), new RegExp(`PLAYER_WEB_SESSION_DAYS="${days}"`));
  });
}

test('writes only the web settings atomically with private permissions', () => {
  const root = mkdtempSync(join(tmpdir(), 'player-web-env-'));
  try {
    const output = join(root, '.env.player-web'); writePlayerWebEnv(output, valid);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const content = readFileSync(output, 'utf8');
    const values = readSettings(output);
    assert.deepEqual(values, { PLAYER_WEB_ORIGIN: valid.PLAYER_WEB_ORIGIN, PLAYER_WEB_PASSPHRASE: valid.PLAYER_WEB_PASSPHRASE, PLAYER_WEB_SESSION_SECRET: valid.PLAYER_WEB_SESSION_SECRET, PLAYER_WEB_SESSION_DAYS: '365' });
    assert.ok(!content.includes(valid.PLAYER_API_KEY) && !content.includes('PLAYER_API_KEY'));
    writePlayerWebEnv(output, { ...valid, PLAYER_WEB_ORIGIN: 'https://new.example', PLAYER_WEB_SESSION_DAYS: '30' });
    assert.deepEqual(readSettings(output), { ...values, PLAYER_WEB_ORIGIN: 'https://new.example', PLAYER_WEB_SESSION_DAYS: '30' });
    assert.deepEqual(readdirSync(root), ['.env.player-web']);
    assert.throws(() => writePlayerWebEnv(join(root, 'missing/settings'), valid));
    assert.throws(() => writePlayerWebEnv(undefined, valid), /Usage/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('service env_file preserves literal dollars, quotes and backslashes', { skip: !composeAvailable }, () => {
  const root = mkdtempSync(join(tmpdir(), 'player-web-env-'));
  try {
    const output = join(root, '.env.player-web');
    const passphrase = `${valid.PLAYER_WEB_PASSPHRASE}$variable'"\\\${literal}`;
    writePlayerWebEnv(output, { ...valid, PLAYER_WEB_PASSPHRASE: passphrase });
    const compose = join(root, 'compose.yml');
    writeFileSync(compose, `services:\n  app:\n    image: scratch\n    env_file:\n      - ${output}\n`);
    const result = spawnSync('docker', ['compose', '--env-file', '/dev/null', '-f', compose, 'config', '--format', 'json'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 0, result.stderr);
    // Compose re-escapes dollars when serializing a reusable config file.
    assert.equal(JSON.parse(result.stdout).services.app.environment.PLAYER_WEB_PASSPHRASE, passphrase.replaceAll('$', () => '$$'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI is silent on success and errors never expose credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'player-web-env-'));
  try {
    const script = new URL('./render-player-web-env.mjs', import.meta.url).pathname;
    const run = (args, env) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
    const success = run([join(root, '.env.player-web')], valid); assert.equal(success.status, 0, success.stderr); assert.equal(success.stdout, ''); assert.equal(success.stderr, '');
    const usage = run([], valid); assert.equal(usage.status, 1); assert.match(usage.stderr, /Usage/);
    const failure = run([join(root, '.env.player-web')], { ...valid, PLAYER_WEB_ORIGIN: 'http://invalid' }); assert.equal(failure.status, 1);
    for (const secret of [valid.PLAYER_WEB_PASSPHRASE, valid.PLAYER_WEB_SESSION_SECRET, valid.PLAYER_API_KEY]) assert.ok(!failure.stderr.includes(secret));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
