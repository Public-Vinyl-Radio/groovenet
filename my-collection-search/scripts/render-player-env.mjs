#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { writeFileSync, renameSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Called under op run. Never log the resolved values. */
export function renderPlayerEnv(env) {
  const key = env.PLAYER_API_KEY;
  if (typeof key !== 'string' || key.length < 32 || /[\r\n\0]/.test(key)) {
    throw new Error('PLAYER_API_KEY must have at least 32 characters on one line.');
  }
  const a = env.PLAYER_ENGINE_A_PASSWORD;
  const b = env.PLAYER_ENGINE_B_PASSWORD;
  for (const name of ['PLAYER_ENGINE_A_PASSWORD', 'PLAYER_ENGINE_B_PASSWORD']) {
    if (typeof env[name] !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(env[name])) {
      throw new Error(`${name} must be a nonempty hex/base64url password.`);
    }
  }
  if (a === b) throw new Error('The two engine passwords must be distinct.');
  if (!/^[1-9][0-9]*$/.test(env.PLAYER_LIBRARY_FRIEND_ID || '')) throw new Error('PLAYER_LIBRARY_FRIEND_ID must be a positive integer.');
  const values = {
    PLAYER_API_KEY: key,
    PLAYER_LIBRARY_FRIEND_ID: env.PLAYER_LIBRARY_FRIEND_ID,
    PLAYER_WORKER_URL: 'http://player-worker:13700',
    PLAYER_ENGINE_A_PASSWORD: a,
    PLAYER_ENGINE_B_PASSWORD: b,
    PLAYER_LAN_INTERFACE: env.PLAYER_LAN_INTERFACE || 'enp170s0',
    PLAYER_AUDIO_MOUNT: env.PLAYER_AUDIO_MOUNT || 'music_data',
    PLAYER_ENGINES_JSON: JSON.stringify({
      primary: { apiUrl: 'http://host.docker.internal:13689/api', password: a, libraryRoot: '/srv/media' },
      secondary: { apiUrl: 'http://host.docker.internal:13690/api', password: b, libraryRoot: '/srv/media' },
    }),
    PLAYER_HA_URL: env.PLAYER_HA_URL || '',
    PLAYER_HA_TOKEN: env.PLAYER_HA_TOKEN || '',
    PLAYER_HA_ENTITIES_JSON: env.PLAYER_HA_ENTITIES_JSON || '{}',
    PLAYER_HA_SENDERS_JSON: env.PLAYER_HA_SENDERS_JSON || '{}',
  };
  // Double-quoted dotenv values preserve JSON/quotes/backslashes; $$ prevents
  // Compose from interpolating dollar signs inside an actual secret.
  return Object.entries(values).map(([name, value]) => `${name}=${JSON.stringify(value).replaceAll('$', () => '$$')}\n`).join('');
}

export function writePlayerEnv(output, env) {
  if (!output) throw new Error('Usage: render-player-env.mjs <private-output-file>');
  const content = renderPlayerEnv(env);
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, output);
  } finally { rmSync(temporary, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { writePlayerEnv(process.argv[2], process.env); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
