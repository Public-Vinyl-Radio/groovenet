# Persistent server players

Server players run on the Debian Docker host. Closing a laptop, TUI or event
subscription leaves playback running. Each named player has its own persistent
queue and one dedicated OwnTone engine. Different players can use different
speakers concurrently; synchronized groups are deferred. This is the backend
for #693; remote TUI controls are tracked in #694. The web UI can control these sessions through an optional household browser
session; see [web controls](../../my-collection-search/docs/server-player-web.md).
There is no iOS UI yet. Web authorization can be provisioned from 1Password with
`just player-web-setup`; existing hosts remain opted out until that explicit setup.

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
`GROOVENET_OP_ITEM` selection (defaults `Homelab` / `groovenet`). Add five fields
to that 1Password item: `PLAYER_API_KEY`, `PLAYER_LIBRARY_FRIEND_ID`,
`PLAYER_ENGINE_A_PASSWORD`, `PLAYER_ENGINE_B_PASSWORD` and
`PLAYER_ENGINE_C_PASSWORD`. The friend ID is the positive `friends.id` of the
library owner. API keys must be at least 32 characters on one line; engine
passwords must be pairwise distinct hex/base64url values. A missing field makes
the renderer fail with an error naming it, so `just deploy` stops before it
touches the host.
To render locally:

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
PLAYER_API_KEY='op://Homelab/groovenet/PLAYER_API_KEY' op run --no-masking -- groovenet player --remote lounge
```

Use the installed executable or the built Node entrypoint inside `op run`; shell
functions such as `gn` are not executables that `op run` can invoke directly.
Existing CLI collection credentials remain independent. For the interactive TUI,
`op run` needs `--no-masking`: its default output-masking pipe makes stdout cease
to be a TTY. This option passes terminal output through directly; the player UI
does not print credentials. Keep default masking for noninteractive commands.

Configure player settings:

- Generate `PLAYER_API_KEY` with `openssl rand -hex 32`. It is a **shared
  household/admin credential**, with access to every player and friend’s queued
  track references. All reads, commands and SSE require it. Existing browser
  cookies and the ordinary app API key do not grant player access. The opt-in
  web bridge issues a separate player-only session after web-passphrase
  authorization; it never shares this worker key with browsers. Give it only
  to trusted controllers and use HTTPS when reaching the app across a network.
- Generate distinct hex/base64url `PLAYER_ENGINE_A_PASSWORD`,
  `PLAYER_ENGINE_B_PASSWORD` and `PLAYER_ENGINE_C_PASSWORD` values
  (`openssl rand -hex 24`).
- Set `PLAYER_LAN_INTERFACE` to the Debian host's actual speaker-facing interface.
  Engines and the shared clock use host networking for discovery/AirPlay.
  Reserve API ports 13689/13690/13692, WebSocket ports 13688/13691/13693 and PTP
  UDP 319/320.
  Restrict engine APIs to trusted host/network access; never expose them publicly.
- Set `PLAYER_AUDIO_MOUNT=music_data` with the production overlay: this logical
  Compose volume maps to the existing `PROD_MUSIC_DATA_VOLUME`. Alternatively use
  an absolute directory visible to Docker. Do not supply an undeclared Docker
  volume name. The mount is read-only. OwnTone must finish indexing before play.
- Set `PLAYER_ENGINES_JSON` to the following single-line JSON, replacing passwords
  to match the engine environment variables. These credentials stay server-side.

```json
{
  "primary": {
    "apiUrl": "http://host.docker.internal:13689/api",
    "password": "A_PASSWORD",
    "libraryRoot": "/srv/media"
  },
  "secondary": {
    "apiUrl": "http://host.docker.internal:13690/api",
    "password": "B_PASSWORD",
    "libraryRoot": "/srv/media"
  },
  "tertiary": {
    "apiUrl": "http://host.docker.internal:13692/api",
    "password": "C_PASSWORD",
    "libraryRoot": "/srv/media"
  }
}
```

For example, with the existing production environment loaded:

```sh
docker compose --env-file .env --env-file .env.players -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.players.yml --profile players build player-clock player-worker
docker compose --env-file .env --env-file .env.players -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.players.yml --profile players up -d app player-clock player-engine-a player-engine-b player-engine-c player-worker
```

The worker has no published port: the app proxies to `http://player-worker:13700`.
The three engines (`primary`, `secondary`, `tertiary`) each own one OwnTone
process, so one named player each, and their cache databases use separate
persistent volumes. Every engine must share the clock's IPC namespace (`ipc: service:player-clock`): AirPlay 2
requires `/dev/shm/airptp_shm`, as well as network access to the clock. The engine
entrypoint refuses startup without it. Run only one such shared clock per host.

### Adding the Bedroom player

The `tertiary` engine exists for a third player, such as a Bedroom Sonos, that
plays its own queue alongside the players on `primary` and `secondary`. Roll it
out in this order:

1. Before deploying a release with `player-engine-c`, add
   `PLAYER_ENGINE_C_PASSWORD` (`openssl rand -hex 24`) to the 1Password item.
   Without it `.env.players` rendering fails and the deploy stops before it
   touches the running stack.
2. Confirm ports 13692/13693 are free on the host:
   `ss -ltnu | grep -E ':1369[23]'` should print nothing.
3. Deploy, then create the player on that engine with
   `POST /api/players {"id":"bedroom","name":"Bedroom","engine_id":"tertiary"}`
   (`GET /api/players/engines` should list `tertiary`).
4. Select the Sonos output (`output.select`) and set the availability policy,
   for example `groovenet player set bedroom --availability allow_unknown`.

OwnTone reaches Sonos only over AirPlay 2: One, Five, Era, Move, Roam, Arc,
Beam and Port work; first-generation Play:1 and Play:5 do not appear as outputs.

Outside Compose, build packages with `just build-packages`, then run
`groovenet-player-server` with `DATABASE_URL`, `PLAYER_API_KEY`,
`PLAYER_LIBRARY_FRIEND_ID`, `PLAYER_ENGINES_JSON` and `PLAYER_APP_URL` (the app
origin, default `http://app:3000`). Set the app's `PLAYER_WORKER_URL` to that
private worker.
The standalone worker binds `0.0.0.0:13700` (override `PLAYER_WORKER_PORT`), so
restrict access at the host/network boundary.

## Control API

All public paths start with `/api/players`. Supply
`Authorization: Bearer <PLAYER_API_KEY>` on every request.

| Method and path                     | Purpose                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| `GET /api/players`                  | List persistent players                                               |
| `GET /api/players/engines`          | List configured engine IDs                                            |
| `POST /api/players`                 | Create `{ "id": "lounge", "name": "Lounge", "engine_id": "primary" }` |
| `GET /api/players/lounge`           | Get full state and revision                                           |
| `GET /api/players/lounge/devices`   | Discovered outputs, assignments and observations                      |
| `POST /api/players/lounge/commands` | Apply a command                                                       |
| `GET /api/players/lounge/events`    | SSE snapshots and lightweight position updates                        |

Each engine can belong to only one named player. Names can be changed; player
IDs and engine assignments are fixed. Engine configuration is an operator
allowlist, never a client-provided URL. Player deletion is not implemented.

Commands use last-write-wins behavior by default. Optionally include
`expected_revision` from a snapshot to require optimistic concurrency: a stale
value returns `REVISION_CONFLICT`. Position ticks do not change the revision.
Each player has a persisted `availability_policy`, initially `ask`. Set it with
the bearer credential:

```sh
groovenet player set lounge --availability allow_unknown
groovenet player set lounge --availability always
groovenet player set lounge --availability ask
```

The equivalent command is
`{"type":"availability.set","availability_policy":"allow_unknown","expected_revision":3}`.
`ask` requires the existing per-command acknowledgements. `allow_unknown`
connects when HA activity is unknown without `allow_unknown: true`, but still
requires `takeover: true` for observed occupied activity. `always` also permits
observed occupied activity without a takeover flag. Both policies apply to fresh
connection and reconnection checks; neither bypasses another Groovenet player's
assignment. Use `output.transfer` explicitly to move that assignment. Browser
sessions cannot change this policy.
For example:

```json
{ "type": "queue.add", "tracks": [{ "track_id": "TRACK_ID", "friend_id": 1 }] }
```

Scripts that need optimistic concurrency can use the returned player revision
for their next command:

```json
{ "type": "output.select", "expected_revision": 1, "output_id": "OUTPUT_ID" }
```

```json
{ "type": "play", "allow_unknown": true }
```

Selecting an output remembers intent; it does not connect or reserve the
speaker. Playback requires indexed local audio, resolved afresh from Postgres.
Queue entries get stable UUIDs, including repeated copies of the same track.
Use those entry IDs for `queue.remove`, `queue.move` and an explicit `play`.
If an entry has disappeared, these commands return `ENTRY_NOT_FOUND`.
Other commands are `rename`, `queue.clear`, `pause`, `resume`, `stop`, `next`,
`previous`, `seek` (seconds) and `volume` (0–100). Stop clears the current entry
and position while preserving the queue. Natural EOF advances only that player's
queue; interruption/error preserves the current entry and requires a command.

### Joining a session

`session.join` appends tracks and starts the first appended entry when the player
has no current entry or is stopped or ended. The idle check, append and play run
in one serialized worker command; concurrent joins cannot interrupt each other.
Playing, loading and paused sessions keep their current track and position.

```json
{ "type": "session.join", "tracks": [{ "track_id": "TRACK_ID", "friend_id": 1 }] }
```

Joins accept `expected_revision`, `allow_unknown` and `takeover`. Track, output
and availability validation failures leave the queue unchanged. A browser keeps
its local queue until the command succeeds, including after an explicit speaker
acknowledgement. An engine failure after the selected entry is persisted retains
the appended queue and error state, as with other playback commands; commands are
never automatically replayed.

`GET /api/players/events` uses the same player authorization as named-player
streams. It emits one `players` event containing the complete `players` list,
then `snapshot` events containing each changed or newly created `player`. Both
include `worker_instance` and increasing `sequence` values. Reconnecting gets a
fresh complete list, even when no players exist. This stream omits position
ticks; the selected player's stream supplies transport progress. Disconnecting
either stream never stops playback.

### Atomic queue replacement

`queue.replace` resolves every track before changing the queue or playback. An
unresolved track rejects the whole command. Entries accept optional UUIDs;
provided IDs are preserved and new entries receive generated IDs. Duplicate IDs
and reusing a current queue ID for another track/friend are rejected. Titles and
artists are resolved on the server, never accepted from the caller.

```json
{
  "type": "queue.replace",
  "expected_revision": 3,
  "entries": [
    { "id": "11111111-1111-4111-8111-111111111111", "track_id": "TRACK_ID", "friend_id": 1 }
  ],
  "current_entry_id": "11111111-1111-4111-8111-111111111111",
  "position": 42,
  "play": false
}
```

Omitting `current_entry_id` retains the current entry if present; otherwise it
selects the first replacement entry only when `play: true`. Explicit `null`
clears the current entry. A non-null ID must belong to the replacement queue.
Omitting `position` preserves the retained entry's position, or starts a new
entry at zero. An explicit position seeks a retained live entry, or saves a
checkpoint for a later play. Removing/changing the current entry stops playback
unless `play: true`. Retaining it keeps its existing backend and playing/paused
state; `play: true` resumes it. An empty replacement clears the queue and cannot
be played. Playback is opt-in and uses the usual output availability/assignment
checks; rejected preflight checks leave the old queue intact. Engine failures
after playback effects begin are reported as playback errors, not a rollback of
already-performed audio operations.

The typed client's `commandServerPlayer` accepts this command. From the CLI:

```sh
groovenet player --remote lounge queue replace '{"entries":[{"track_id":"TRACK_ID","friend_id":1}],"play":true}' --json
```

Use `--allow-unknown` or `--takeover` only when deliberately authorizing the
corresponding speaker policy. A replacement with retained UUIDs can restore an
Undo snapshot, including its current entry and position. Revisions still guard
against overwriting changes made after that snapshot.

SSE begins with a complete `snapshot`. `position` events include player ID,
revision, current entry ID and observation time; apply them only to a matching
snapshot revision/entry. Each event also carries worker instance and sequence.
Reconnect for a fresh snapshot; there is no event replay. Slow clients are
disconnected, and client disconnection never stops audio. The SDK exposes the
list/create/get/command/devices/engines requests; SSE can be consumed directly.

## Speaker activity and transfers

Configure `PLAYER_HA_URL`, `PLAYER_HA_TOKEN` and `PLAYER_HA_ENTITIES_JSON`
with exact OwnTone output IDs or names as keys. ID mappings take precedence.
Names are case-sensitive. A name mapping is used only when that name is unique
among the engine's discovered outputs; duplicate names remain unmapped unless
each output has an ID mapping. ID mappings always take precedence. Name mapping
still appears in device diagnostics when HA credentials are missing, so the
mapping can be checked separately from HA connectivity.
For example:

```json
{
  "aswitch": "media_player.aswitch_streamer",
  "Lounge Room Audio": "media_player.lounge_streamer",
  "132116595608304": "media_player.bedroom_sonos"
}
```

Read-only inspection on beelink on 2026-10-25 confirmed both engines discover:

| OwnTone output ID | Name              | HA entity from the installed registry (#691) |
| ----------------- | ----------------- | -------------------------------------------- |
| `202481599519404` | aswitch           | `media_player.aswitch_streamer`              |
| `202481586338774` | Lounge Room Audio | `media_player.lounge_streamer`               |
| `132116595608304` | Bedroom           | `media_player.bedroom_sonos`                 |

The running worker had an empty HA URL/token and `{}` mappings. HA live states
could not be queried through that worker. These settings must be supplied to
`.env.players` and retained in the environment used to render it on deployment.
The optional `.env.players.tpl` does not supply HA credentials by default.

`groovenet player devices --remote lounge` (or the devices API) shows
`observed.entity_id`, availability, source, observation time and sender identity.
`entity=unmapped` exposes missing mappings; an entity with `source=unconfigured`
means the URL/token is missing. A configured but inaccessible entity reports
`source=home_assistant`, unknown activity and no observation timestamp.

The observer reads HA with a 2-second timeout. Device listings cache observations
for 5 seconds; connection/reconnection decisions always fetch fresh state.
`idle`, `off`, `standby` mean observed idle; active/paused states mean occupied;
unavailable, missing configuration and failed observations mean unknown.
Observations can race another app.

To recognise an engine, HA must expose receiver **session sender attributes**.
Configure exact attribute/value matches keyed by engine ID, for example:

```sh
PLAYER_HA_SENDERS_JSON='{"primary":{"client_name":"Groovenet-primary","client_ip":"192.168.2.151"},"secondary":{"client_name":"Groovenet-secondary","client_ip":"192.168.2.151"}}'
```

These attribute names/values are illustrative: inspect the actual HA entity
attributes before configuring them. All attributes for an engine must match;
exactly one engine must match. Matching only the beelink IP cannot distinguish
its two engines or another app on that host. Use a unique sender identifier,
never track metadata, a room source label or a shared host IP. Duplicate matches
remain unknown identity and occupied activity. Sender attributes must describe
the current session and be cleared/replaced on takeover. Idle/unavailable states
never identify a sender, even if attributes linger.

The installed `shairport_sync` 1.4.0 integration was inspected read-only: it
subscribes to playback and track metadata but exposes no client name/IP. It needs
an HA integration/receiver metadata update before this sender configuration can
work. Shairport's D-Bus client address is available on the Lounge receiver, but
its client name was empty in #691 and the address persists after disconnect.
Do not assume an engine library name appears as `client_name`. No receiver or HA
configuration was changed as part of the inspection.

An active matching sender reports `sender_identity=groovenet` and
`sender_engine_id`. Its own player may connect/resume without takeover; other
engines still need takeover. Nonmatching sender attributes report `foreign`;
missing/ambiguous attributes report `unknown`. Both retain occupancy protection.

Connecting to unknown activity requires explicit `allow_unknown: true`.
Occupied activity requires `takeover: true` unless its sender identifies this
player's dedicated engine. A paused engine may release its AirPlay transport;
reconnection checks apply the same sender rules.
Neither acknowledgement can steal another Groovenet player's assignment.
For that, send `output.transfer` to the destination player:

```json
{
  "type": "output.transfer",
  "from_player_id": "lounge",
  "from_revision": 12,
  "output_id": "OUTPUT_ID",
  "play": true,
  "allow_unknown": true
}
```

Transfer detaches the source first and keeps each player's own queue and
checkpoint. `play: false` only changes the destination's desired output.
`from_revision` is required even when `expected_revision` is omitted; it fences
the source player whose output is being transferred.
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

Server players log digital plays after the shared `playThreshold` listen time.
Only tracks belonging to `PLAYER_LIBRARY_FRIEND_ID` are eligible. Each queue
entry has its own durable delivery record; failed app API requests are retried
every 30 seconds and after a worker restart. An API conflict for an already
logged digital play completes the delivery. The worker must be able to reach
`POST /api/spins` at `PLAYER_APP_URL`.

An abrupt crash can leave an old engine playing; stop that engine explicitly
before issuing new playback if its ownership cannot be established. Do not use
the dedicated engines from other controller apps.

When a receiver or input fails, the worker stops, clears and releases only a
verified failed engine session. It rechecks the engine instance, queue version,
item and terminal failure sequence, and refuses to clean up a resumed/replaced
session or another selected output. The named player's queue/current entry and
checkpoint remain intact; it never automatically resumes or advances after a
failure. Once the receiver is ready, explicitly play again (with any required
availability acknowledgement). Queue and settings edits preserve the playback
error until a successful transport action leaves the error state.

If engine cleanup fails, an uncertain assignment remains reserved and commands
return `RELEASE_UNCERTAIN`. Stop/restart the affected engine, then restart the
worker to restore stopped checkpoints and clear the claim. Investigate DB/engine
connectivity before retrying. Do not run a second worker to bypass a lease error.

Some receivers ignore AirPlay volume. The saved volume is the requested sender
value, not a measured loudness guarantee. The implementation does not promise
synchronization, automatic recovery after receiver outages, or Sonos validation.

Validation and the successful two-room hardware results are recorded in
[evaluations/693](../../../evaluations/693/README.md).
