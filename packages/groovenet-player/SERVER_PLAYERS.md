# Persistent server players

Server players run on the Debian Docker host. Closing a laptop, TUI or event
subscription leaves playback running. Each named player has its own persistent
queue and one dedicated OwnTone engine. Different players can use different
speakers concurrently; synchronized groups are deferred. This is the backend
for #693; remote TUI controls are tracked in #694. There is no new web/iOS UI yet.

## Deployment

Use the repository's existing Debian Compose stack and apply migrations first
(`just migrate-up` with the stack's normal environment). Do not start a second
stack against the production database volume. Add `docker-compose.players.yml`
after your usual Compose files and enable profile `players`. This extension is
optional; the ordinary stack does not start any player engines.

For production, put the following player settings in a private root `.env.players`
(`chmod 600 .env.players`), using `.env.example` as the reference. Its presence
opts the production deploy script into the player Compose overlay/profile and
builds the two local images before starting services. It survives the normal
`.env` rendering step. Keep the existing database/collection secrets in `.env`.
Player secrets and private worktree files are excluded from Docker build contexts.

The optional `.env.players.tpl` uses the existing `GROOVENET_OP_VAULT` /
`GROOVENET_OP_ITEM` selection (defaults `Homelab` / `groovenet`). Add three fields
to that 1Password item: `PLAYER_API_KEY`, `PLAYER_ENGINE_A_PASSWORD`, and
`PLAYER_ENGINE_B_PASSWORD`. API keys must be at least 32 characters on one line;
engine passwords must be distinct hex/base64url values. To render locally:

```sh
mkdir -p .worktree
op run --env-file .env.players.tpl -- node my-collection-search/scripts/render-player-env.mjs .worktree/players.env
# Copy to the production checkout as .env.players with mode 0600.
```

The renderer validates credentials before replacing any existing file, writes
atomically with private permissions, and constructs the engine JSON from the same
passwords. It quotes literal dollar signs/backslashes so Compose preserves secret
values. Never commit the rendered file. `just deploy` refreshes `.env.players`
from 1Password only on a host that already has that file; other hosts stay opted
out. The ordinary collection credential template is unchanged.

For the laptop CLI, load only the API key (never the engine passwords):

```sh
PLAYER_API_KEY='op://Homelab/groovenet/PLAYER_API_KEY' op run -- groovenet player list
```

Use the installed executable or the built Node entrypoint inside `op run`; shell
functions such as `gn` are not executables that `op run` can invoke directly.
Existing CLI collection credentials remain independent.

Configure player settings:

* Generate `PLAYER_API_KEY` with `openssl rand -hex 32`. It is a **shared
  household/admin credential**, with access to every player and friend’s queued
  track references. All reads, commands and SSE require it. Existing browser
  cookies and the ordinary app API key do not grant player access. Give it only
  to trusted controllers and use HTTPS when reaching the app across a network.
* Generate distinct hex/base64url `PLAYER_ENGINE_A_PASSWORD` and
  `PLAYER_ENGINE_B_PASSWORD` values (`openssl rand -hex 24`).
* Set `PLAYER_LAN_INTERFACE` to the Debian host's actual speaker-facing interface.
  Engines and the shared clock use host networking for discovery/AirPlay.
  Reserve API ports 13689/13690, WebSocket ports 13688/13691 and PTP UDP 319/320.
  Restrict engine APIs to trusted host/network access; never expose them publicly.
* Set `PLAYER_AUDIO_MOUNT=music_data` with the production overlay: this logical
  Compose volume maps to the existing `PROD_MUSIC_DATA_VOLUME`. Alternatively use
  an absolute directory visible to Docker. Do not supply an undeclared Docker
  volume name. The mount is read-only. OwnTone must finish indexing before play.
* Set `PLAYER_ENGINES_JSON` to the following single-line JSON, replacing passwords
  to match the engine environment variables. These credentials stay server-side.

```json
{"primary":{"apiUrl":"http://host.docker.internal:13689/api","password":"A_PASSWORD","libraryRoot":"/srv/media"},"secondary":{"apiUrl":"http://host.docker.internal:13690/api","password":"B_PASSWORD","libraryRoot":"/srv/media"}}
```

For example, with the existing production environment loaded:

```sh
docker compose --env-file .env --env-file .env.players -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.players.yml --profile players build player-clock player-worker
docker compose --env-file .env --env-file .env.players -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.players.yml --profile players up -d app player-clock player-engine-a player-engine-b player-worker
```

The worker has no published port: the app proxies to `http://player-worker:13700`.
The two engine cache databases use separate persistent volumes. Both engines
must share the clock's IPC namespace (`ipc: service:player-clock`): AirPlay 2
requires `/dev/shm/airptp_shm`, as well as network access to the clock. The engine
entrypoint refuses startup without it. Run only one such shared clock per host.

Outside Compose, build packages with `just build-packages`, then run
`groovenet-player-server` with `DATABASE_URL`, `PLAYER_API_KEY` and
`PLAYER_ENGINES_JSON`. Set the app's `PLAYER_WORKER_URL` to that private worker.
The standalone worker binds `0.0.0.0:13700` (override `PLAYER_WORKER_PORT`), so
restrict access at the host/network boundary.

## Control API

All public paths start with `/api/players`. Supply
`Authorization: Bearer <PLAYER_API_KEY>` on every request.

| Method and path | Purpose |
| --- | --- |
| `GET /api/players` | List persistent players |
| `GET /api/players/engines` | List configured engine IDs |
| `POST /api/players` | Create `{ "id": "lounge", "name": "Lounge", "engine_id": "primary" }` |
| `GET /api/players/lounge` | Get full state and revision |
| `GET /api/players/lounge/devices` | Discovered outputs, assignments and observations |
| `POST /api/players/lounge/commands` | Apply a revisioned command |
| `GET /api/players/lounge/events` | SSE snapshots and lightweight position updates |

Each engine can belong to only one named player. Names can be changed; player
IDs and engine assignments are fixed. Engine configuration is an operator
allowlist, never a client-provided URL. Player deletion is not implemented.

Commands include `expected_revision` from the most recent snapshot. A stale
revision returns `REVISION_CONFLICT`; fetch fresh state before deciding whether
to retry. Position ticks do not change the edit revision. For example:

```json
{"type":"queue.add","expected_revision":0,"tracks":[{"track_id":"TRACK_ID","friend_id":1}]}
```

After each command, use its returned player revision for the next command:

```json
{"type":"output.select","expected_revision":1,"output_id":"OUTPUT_ID"}
```

```json
{"type":"play","expected_revision":2,"allow_unknown":true}
```

Selecting an output remembers intent; it does not connect or reserve the
speaker. Playback requires indexed local audio, resolved afresh from Postgres.
Queue entries get stable UUIDs, including repeated copies of the same track.
Use those entry IDs for `queue.remove`, `queue.move` and an explicit `play`.
Other commands are `rename`, `queue.clear`, `pause`, `resume`, `stop`, `next`,
`previous`, `seek` (seconds) and `volume` (0–100). Stop clears the current entry
and position while preserving the queue. Natural EOF advances only that player's
queue; interruption/error preserves the current entry and requires a command.

SSE begins with a complete `snapshot`. `position` events include player ID,
revision, current entry ID and observation time; apply them only to a matching
snapshot revision/entry. Each event also carries worker instance and sequence.
Reconnect for a fresh snapshot; there is no event replay. Slow clients are
disconnected, and client disconnection never stops audio. The SDK exposes the
list/create/get/command/devices/engines requests; SSE can be consumed directly.

## Speaker activity and transfers

Optionally configure `PLAYER_HA_URL`, `PLAYER_HA_TOKEN` and an output-to-entity
map such as `PLAYER_HA_ENTITIES_JSON={"OUTPUT_ID":"media_player.lounge"}`.
The observer only reads HA state, with a 2-second timeout and 5-second cache.
`idle`, `off`, `standby` mean observed idle; active/paused states mean occupied;
unavailable, missing configuration and failed observations mean unknown.
HA does not prove which app is sending audio. Observations can race another app.

Connecting to unknown activity requires explicit `allow_unknown: true`.
Occupied activity requires `takeover: true`. A paused engine may release its
AirPlay transport, so resuming may require another availability decision.
Neither acknowledgement can steal another Groovenet player's assignment.
For that, send `output.transfer` to the destination player:

```json
{"type":"output.transfer","expected_revision":7,"from_player_id":"lounge","from_revision":12,"output_id":"OUTPUT_ID","play":true,"allow_unknown":true}
```

Transfer detaches the source first and keeps each player's own queue and
checkpoint. `play: false` only changes the destination's desired output.
Inspect `transfer.detached`, `attached` and `error` even when HTTP status is 200:
the source can be detached while destination playback fails. It is never
automatically reconnected to hide that partial result.

## Restarts and recovery

Postgres holds names, independent queues, current entry, volume, desired output
and position checkpoints (at most once per five seconds, plus command/shutdown
writes). Only one worker holds the database lifecycle lease. Commands and engine
events share a serial lane; a slow engine can delay commands to other players.

A worker restart restores **stopped checkpoints**, clears transient assignments
and creates no engine connections. It never resumes or reclaims a speaker
automatically. `checkpoint: true` means saved position, not observed live audio.
An abrupt crash can leave an old engine playing; stop that engine explicitly
before issuing new playback if its ownership cannot be established. Do not use
the dedicated engines from other controller apps.

If engine cleanup fails, an uncertain assignment remains reserved and commands
return `RELEASE_UNCERTAIN`. Stop/restart the affected engine, then restart the
worker to restore stopped checkpoints and clear the claim. Investigate DB/engine
connectivity before retrying. Do not run a second worker to bypass a lease error.

Some receivers ignore AirPlay volume. The saved volume is the requested sender
value, not a measured loudness guarantee. The implementation does not promise
synchronization, automatic recovery after receiver outages, or Sonos validation.

Validation and the successful two-room hardware results are recorded in
[evaluations/693](../../../evaluations/693/README.md).
