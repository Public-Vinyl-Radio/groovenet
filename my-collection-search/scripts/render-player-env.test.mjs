import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { renderPlayerEnv, writePlayerEnv } from './render-player-env.mjs';

const valid = { PLAYER_API_KEY: 'a'.repeat(64), PLAYER_LIBRARY_FRIEND_ID: '1', PLAYER_ENGINE_A_PASSWORD: 'engine-a_secret', PLAYER_ENGINE_B_PASSWORD: 'engine-b_secret', PLAYER_ENGINE_C_PASSWORD: 'engine-c_secret' };
const composeAvailable = spawnSync('docker', ['compose', 'version']).status === 0;

for (const changes of [
  { PLAYER_API_KEY: undefined }, { PLAYER_API_KEY: 'short' },
  { PLAYER_API_KEY: `${'a'.repeat(32)}\n` }, { PLAYER_API_KEY: `${'a'.repeat(32)}\0` },
  { PLAYER_ENGINE_A_PASSWORD: undefined }, { PLAYER_ENGINE_A_PASSWORD: 'bad"password' },
  { PLAYER_ENGINE_B_PASSWORD: '' }, { PLAYER_ENGINE_B_PASSWORD: 'bad$password' },
  { PLAYER_ENGINE_C_PASSWORD: undefined }, { PLAYER_ENGINE_C_PASSWORD: 'bad password' },
  { PLAYER_ENGINE_B_PASSWORD: valid.PLAYER_ENGINE_A_PASSWORD },
  { PLAYER_ENGINE_C_PASSWORD: valid.PLAYER_ENGINE_A_PASSWORD },
  { PLAYER_ENGINE_C_PASSWORD: valid.PLAYER_ENGINE_B_PASSWORD },
  { PLAYER_LIBRARY_FRIEND_ID: '' }, { PLAYER_LIBRARY_FRIEND_ID: '0' },
]) {
  test(`rejects invalid ${Object.keys(changes).join(',')} before replacing configuration`, () => {
    const root = mkdtempSync(join(tmpdir(), 'player-env-'));
    try {
      const output = join(root, '.env.players'); writeFileSync(output, 'existing configuration');
      assert.throws(() => writePlayerEnv(output, { ...valid, ...changes }));
      assert.equal(readFileSync(output, 'utf8'), 'existing configuration');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('writes a private atomic file and builds matching engine credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'player-env-'));
  try {
    const output = join(root, '.env.players');
    writePlayerEnv(output, valid);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const values = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map((line) => {
      const at = line.indexOf('='); return [line.slice(0, at), JSON.parse(line.slice(at + 1))];
    }));
    assert.equal(values.PLAYER_AUDIO_MOUNT, 'music_data');
    assert.equal(values.PLAYER_LIBRARY_FRIEND_ID, '1');
    const engines = JSON.parse(values.PLAYER_ENGINES_JSON);
    assert.equal(engines.primary.password, values.PLAYER_ENGINE_A_PASSWORD);
    assert.equal(engines.secondary.password, values.PLAYER_ENGINE_B_PASSWORD);
    assert.equal(engines.secondary.libraryRoot, '/srv/media');
    assert.deepEqual(Object.keys(engines), ['primary', 'secondary', 'tertiary']);
    assert.equal(values.PLAYER_ENGINE_C_PASSWORD, 'engine-c_secret');
    assert.deepEqual(engines.tertiary, { apiUrl: 'http://host.docker.internal:13692/api', password: 'engine-c_secret', libraryRoot: '/srv/media' });
    assert.equal(engines.primary.apiUrl, 'http://host.docker.internal:13689/api');
    assert.equal(engines.secondary.apiUrl, 'http://host.docker.internal:13690/api');
    writePlayerEnv(output, { ...valid, PLAYER_API_KEY: 'b'.repeat(64) });
    assert.ok(readFileSync(output, 'utf8').includes('b'.repeat(64)));
    assert.throws(() => writePlayerEnv(join(root, 'absent/file'), valid));
    assert.throws(() => writePlayerEnv(undefined, valid), /Usage/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('names the offending field and rejects any pair of equal engine passwords', () => {
  assert.throws(() => renderPlayerEnv({ ...valid, PLAYER_ENGINE_C_PASSWORD: undefined }), /PLAYER_ENGINE_C_PASSWORD must be a nonempty/);
  assert.throws(() => renderPlayerEnv({ ...valid, PLAYER_ENGINE_C_PASSWORD: 'bad"password' }), /PLAYER_ENGINE_C_PASSWORD/);
  for (const [x, y] of [['A', 'B'], ['A', 'C'], ['B', 'C']]) {
    assert.throws(() => renderPlayerEnv({ ...valid, [`PLAYER_ENGINE_${y}_PASSWORD`]: valid[`PLAYER_ENGINE_${x}_PASSWORD`] }), /three engine passwords must be pairwise distinct/);
  }
});

test('preserves explicit interface, mount and observer configuration', () => {
  const content = renderPlayerEnv({ ...valid, PLAYER_LAN_INTERFACE: 'eth0', PLAYER_AUDIO_MOUNT: '/srv/music', PLAYER_HA_URL: 'http://ha', PLAYER_HA_TOKEN: 'ha-token', PLAYER_HA_ENTITIES_JSON: '{"speaker":"media_player.room"}', PLAYER_HA_SENDERS_JSON: '{"primary":{"client_name":"Groovenet-primary"}}' });
  assert.ok(content.includes('PLAYER_LAN_INTERFACE="eth0"'));
  assert.ok(content.includes('PLAYER_AUDIO_MOUNT="/srv/music"'));
  assert.ok(content.includes('PLAYER_HA_TOKEN="ha-token"'));
  assert.ok(content.includes('PLAYER_HA_SENDERS_JSON=' + JSON.stringify('{"primary":{"client_name":"Groovenet-primary"}}')));
});

test('Compose preserves literal dollars, quotes and backslashes in actual secrets', { skip: !composeAvailable }, () => {
  const root = mkdtempSync(join(tmpdir(), 'player-env-'));
  try {
    const output = join(root, '.env.players');
    const key = `${'a'.repeat(32)}$variable'"\\\${literal}`;
    writePlayerEnv(output, { ...valid, PLAYER_API_KEY: key });
    const compose = join(root, 'compose.yml');
    writeFileSync(compose, 'services:\n  test:\n    image: scratch\n    environment:\n      PLAYER_API_KEY: ${PLAYER_API_KEY}\n');
    const result = spawnSync('docker', ['compose', '--env-file', output, '-f', compose, 'config', '--environment'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.split('\n').includes(`PLAYER_API_KEY=${key}`));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI succeeds silently and reports missing fields without exposing values', () => {
  const root = mkdtempSync(join(tmpdir(), 'player-env-'));
  try {
    const script = new URL('./render-player-env.mjs', import.meta.url);
    const run = (args, env) => spawnSync(process.execPath, [script.pathname, ...args], { encoding: 'utf8', env });
    const success = run([join(root, '.env.players')], valid);
    assert.equal(success.status, 0, success.stderr); assert.equal(success.stdout, '');
    const usage = run([], valid); assert.equal(usage.status, 1); assert.match(usage.stderr, /Usage/);
    const failure = run([join(root, '.env.players')], { ...valid, PLAYER_API_KEY: 'short' });
    assert.equal(failure.status, 1);
    assert.ok(!failure.stderr.includes('engine-a_secret'));
    const missingC = run([join(root, '.env.players')], { ...valid, PLAYER_ENGINE_C_PASSWORD: undefined });
    assert.equal(missingC.status, 1); assert.match(missingC.stderr, /PLAYER_ENGINE_C_PASSWORD/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
