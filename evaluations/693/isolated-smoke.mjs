// Full worker + Postgres + two real engines, on a Docker INTERNAL network.
// No published ports, production data, LAN discovery or real speakers.
// Images: groovenet-owntone:693-test and groovenet-player-server:693-test.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { up } from '../../my-collection-search/migrations/1792900000000_add-server-players.js';
const exec = promisify(execFile);
const docker = async (...args) => (await exec('docker', args, { maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const prefix = `groovenet-693-${process.pid}`;
const network = `${prefix}-net`;
const db = `${prefix}-db`, engine = `${prefix}-engine`, worker = `${prefix}-worker`;
const key = 'isolated-player-test-key-12345678901234567890';
const resources = [];
const wait = async (predicate, message, timeout = 45000) => {
 const deadline = Date.now() + timeout;
 while (Date.now() < deadline) {
  if (await predicate()) return;
  await delay(100);
 }
 throw new Error(`Timed out: ${message}`);
};
const sql = (text) => docker('exec', db, 'psql', '-U', 'test', '-d', 'test', '-v', 'ON_ERROR_STOP=1', '-c', text);
const api = async (path, method = 'GET', body) => {
 const program = `const r=await fetch('http://127.0.0.1:13700'+process.argv[1],{method:process.argv[2],headers:{Authorization:'Bearer '+process.env.PLAYER_API_KEY,'Content-Type':'application/json'},...(process.argv[3]?{body:process.argv[3]}:{})});console.log(JSON.stringify({status:r.status,body:await r.json()}));`;
 return JSON.parse(await docker('exec', worker, 'node', '--input-type=module', '-e', program, path, method, body === undefined ? '' : JSON.stringify(body)));
};
const state = async (id) => (await api(`/players/${id}`)).body;
const command = async (id, body) => {
 const current = await state(id);
 const result = await api(`/players/${id}/commands`, 'POST', { ...body, expected_revision: current.revision });
 assert.equal(result.status, 200, JSON.stringify(result));
 return result.body;
};
const config = (id, port, websocket, audio) => `general {
 uid = "nobody"
 admin_password = "isolated-engine-password"
 db_path = "/tmp/${id}/library.db"
 cache_dir = "/tmp/${id}"
 logfile = "/dev/stderr"
 loglevel = info
 trusted_networks = { "localhost" }
 websocket_port = ${websocket}
 speaker_autoselect = no
}
library {
 name = "isolated-${id}"
 port = ${port}
 directories = { "/tmp/media" }
 clear_queue_on_stop_disable = true
 pipe_autostart = false
}
${audio}
mpd { port = 0 }
`;
try {
 await docker('image', 'inspect', 'groovenet-owntone:693-test');
 await docker('image', 'inspect', 'groovenet-player-server:693-test');
 await docker('network', 'create', '--internal', network);
 await docker('run', '-d', '--name', db, '--network', network, '--network-alias', 'db', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=test', 'pgvector/pgvector:pg15');
 resources.push(db);
 await wait(async () => { try { await docker('exec', db, 'pg_isready', '-h', '127.0.0.1', '-U', 'test'); return true; } catch { return false; } }, 'Postgres');
 let migrationSql;
 up({ sql: text => { migrationSql = text; } });
 await sql(migrationSql);
 await sql("CREATE TABLE tracks(track_id text, friend_id integer, title text, artist text, local_audio_url text); INSERT INTO tracks VALUES ('short',1,'Short','Fixture','short.wav'),('long',1,'Long','Fixture','long.wav');");
 const a = config('a', 13689, 13688, 'audio { type = "dummy" }');
 const b = config('b', 13690, 13691, 'audio { type = "disabled" }\nfifo { nickname = "Silent drain" path = "/tmp/drain" }');
 const startup = `set -eu
 mkdir -p /tmp/a /tmp/b /tmp/media /run/dbus
 chown nobody /tmp/a /tmp/b /tmp/media
 printf '%s' '${a}' > /tmp/a.conf
 printf '%s' '${b}' > /tmp/b.conf
 ffmpeg -v error -f lavfi -i sine=duration=12 -af volume=0.01 /tmp/media/short.wav
 ffmpeg -v error -f lavfi -i sine=duration=60 -af volume=0.01 /tmp/media/long.wav
 mkfifo /tmp/drain
 chmod 666 /tmp/drain
 while :; do cat /tmp/drain >/dev/null; done &
 dbus-uuidgen --ensure
 dbus-daemon --system --fork
 avahi-daemon --daemonize --no-drop-root
 /usr/sbin/airptpd -f &
 sleep 1
 /usr/sbin/owntone -f -c /tmp/a.conf &
 /usr/sbin/owntone -f -c /tmp/b.conf &
 wait
 `;
 await docker('run', '-d', '--name', engine, '--network', network, '--network-alias', 'engine', '--entrypoint', '/bin/sh', 'groovenet-owntone:693-test', '-ec', startup);
 resources.push(engine);
 await wait(async () => {
  try {
   const response = await docker('exec', engine, 'curl', '-fsS', 'http://127.0.0.1:13690/api/library/files?directory=%2Ftmp%2Fmedia');
   return JSON.parse(response).tracks.items.length === 2;
  } catch { return false; }
 }, 'two engine indexes');
 const engines = { a: { apiUrl: 'http://engine:13689/api', password: 'isolated-engine-password', libraryRoot: '/tmp/media' }, b: { apiUrl: 'http://engine:13690/api', password: 'isolated-engine-password', libraryRoot: '/tmp/media' } };
 await docker('run', '-d', '--name', worker, '--network', network, '-e', 'DATABASE_URL=postgres://test:test@db:5432/test', '-e', `PLAYER_API_KEY=${key}`, '-e', `PLAYER_ENGINES_JSON=${JSON.stringify(engines)}`, 'groovenet-player-server:693-test');
 resources.push(worker);
 await wait(async () => { try { return (await api('/health')).status === 200; } catch { return false; } }, 'worker');
 for (const [id, output] of [['a', '0'], ['b', '100']]) {
  assert.equal((await api('/players', 'POST', { id, name: id.toUpperCase(), engine_id: id })).status, 201);
  await command(id, { type: 'queue.add', tracks: [{ track_id: id === 'a' ? 'short' : 'long', friend_id: 1 }, { track_id: 'long', friend_id: 1 }] });
  await command(id, { type: 'output.select', output_id: output });
  const unknown = await api(`/players/${id}/commands`, 'POST', { type: 'play', expected_revision: (await state(id)).revision });
  assert.equal(unknown.status, 409);
  assert.equal(unknown.body.code, 'AVAILABILITY_UNKNOWN');
  await command(id, { type: 'play', allow_unknown: true });
 }
 await wait(async () => (await state('a')).state.position > 0.2 && (await state('b')).state.position > 0.2, 'both independent outputs playing');
 const beforeA = await state('a'), beforeB = await state('b');
 assert.equal(beforeA.assigned_output, '0'); assert.equal(beforeB.assigned_output, '100');
 console.log('PASS: two persistent players control disjoint silent outputs through real engines');
 const streamProgram = `const c=new AbortController();const r=await fetch('http://127.0.0.1:13700/players/a/events',{headers:{Authorization:'Bearer '+process.env.PLAYER_API_KEY},signal:c.signal});const v=await r.body.getReader().read();if(!new TextDecoder().decode(v.value).includes('snapshot'))process.exit(1);c.abort();`;
 await docker('exec', worker, 'node', '--input-type=module', '-e', streamProgram);
 await wait(async () => (await state('a')).state.position > beforeA.state.position + 0.2, 'playback after client disconnect');
 console.log('PASS: closing an SSE client does not stop playback');
 await command('b', { type: 'pause' });
 await wait(async () => (await state('a')).state.current_entry_id !== beforeA.state.current_entry_id, 'only A advances', 25000);
 assert.equal((await state('b')).state.current_entry_id, beforeB.state.current_entry_id);
 assert.equal((await state('b')).state.status, 'paused', JSON.stringify(await state('b')));
 console.log('PASS: natural EOF advances only A; B preserves its independent paused queue');
 const conflict = await api('/players/a/commands', 'POST', { type: 'rename', expected_revision: 0, name: 'Stale' });
 assert.equal(conflict.status, 409);
 const savedA = await state('a'), savedB = await state('b');
 await docker('restart', worker);
 await wait(async () => { try { return (await api('/health')).status === 200; } catch { return false; } }, 'worker restart');
 for (const saved of [savedA, savedB]) {
  const restored = await state(saved.id);
  assert.deepEqual(restored.state.queue, saved.state.queue);
  assert.equal(restored.state.current_entry_id, saved.state.current_entry_id);
  assert.equal(restored.state.status, 'stopped');
  assert.equal(restored.state.checkpoint, true);
  assert.equal(restored.assigned_output, null);
 }
 for (const port of ['13689', '13690']) {
  const actual = JSON.parse(await docker('exec', engine, 'curl', '-fsS', `http://127.0.0.1:${port}/api/player`));
  assert.equal(actual.state, 'stop');
 }
 console.log('PASS: worker restart restores both queues/checkpoints without resuming or claiming speakers');
 console.log('PASS: isolated server-player smoke complete; no AirPlay hardware or synchronization claimed');
} catch (error) {
 for (const name of resources) {
  try { const logs = await exec('docker', ['logs', '--tail', '35', name]); console.error(logs.stdout + logs.stderr); } catch { /* absent */ }
 }
 throw error;
} finally {
 for (const name of resources.reverse()) { try { await docker('rm', '-f', name); } catch { /* absent */ } }
 try { await docker('network', 'rm', network); } catch { /* absent */ }
}
