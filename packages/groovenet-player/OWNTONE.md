# OwnTone backend (single output)

`OwnToneBackend` controls a **dedicated** OwnTone engine. Groovenet owns the
queue; OwnTone holds one indexed track at a time. mpv remains the default.
Persistent named players, server APIs and independent listening sessions are
#693; remote TUI control is #694. Synchronized speaker groups are deferred.

## Engine requirements

Stock OwnTone 29.3 does not expose a completion reason through its JSON API.
The backend requires the additive `groovenet_terminal` v1 extension in
[`owntone/terminal-v1.patch`](owntone/terminal-v1.patch). It refuses an unpatched
engine with `ENGINE_INCOMPATIBLE` before changing outputs or playback.

This introduces a maintained engine patch, rather than depending only on the
upstream container. The Dockerfile pins upstream 29.3 commit
`d6fb3edf5831de38134ebd92fcf09a730ddd37aa` and verifies its source archive hash.
The upstream license is GPL-2.0. The image includes the corresponding source,
license and patch at `/usr/src/owntone`; retain these when distributing it.
Alpine packages are resolved at build time; this is not a bit-reproducible image.

```sh
# From the repository root:
docker build -t groovenet-owntone:692-test packages/groovenet-player/owntone
npm run build --workspace @groovenet/contracts
npm run build --workspace @groovenet/client
npm run build --workspace @groovenet/player
node packages/groovenet-player/owntone/smoke.mjs
```

The smoke test creates and removes a network-isolated container with generated
files and a dummy output. It publishes no ports and never uses real speakers.
The engine image does not start Avahi/D-Bus itself: a deployment must supply
those services. The smoke script shows an isolated startup sequence, **not** a
production Compose service. Production worker/Compose integration is #693.

For AirPlay discovery on Debian, use the LAN network/interface with Avahi and
D-Bus available. `bind_address = "127.0.0.1"` also restricts discovery to
loopback, so it is suitable only for the isolated test. Restrict engine access
with firewall/trusted networks and an admin password when it binds to the LAN;
do not expose an unauthenticated control API. The CLI's `ca_cert` setting
applies to the Groovenet client/mpv, not the OwnTone connection.

Configure `speaker_autoselect = no`. The patch disables automatic speaker
resurrection after a failed streaming connection; only an explicit play or
output-selection request can select a receiver again. This does not prevent
another application from taking over an AirPlay receiver. Busy/auth status is
best-effort engine information, not a cross-application speaker reservation.

## Shared audio delivery

Mount Groovenet's audio volume **read-only** into OwnTone and configure that
path in its `library.directories`. Set `owntone_library` to the absolute Linux
path **inside the engine**, for example `/srv/media`. The CLI does not read
that local path. It maps each track's `local_audio_url` to an engine-side file
URL, then looks up the exact indexed path using `/api/library/files`.
Directory contents are read afresh on each load; no stale track-ID cache or
whole-library scan is required by the adapter.

OwnTone must finish indexing before a file can play; a missing/unindexed or
ambiguous file is refused. The backend does not force a library rescan. It
accepts finite indexed files with a known positive duration, not Internet radio
or HTTP streams. Standard relative names, `/audio/` and `/app/audio/` prefixes,
and legacy app audio URLs are supported. Traversal, backslashes, NULs and
ambiguous path segments are refused. There is no basename fallback.

Groovenet credentials remain on Groovenet API requests. Indexed file delivery
needs no bearer token; sources containing HTTP headers or non-file URLs are
explicitly rejected, never forwarded with authentication silently removed.

## CLI setup

Run the daemon on the host that should control OwnTone. These settings apply
when a daemon starts; stop an existing daemon before changing backends.

```sh
groovenet config set owntone_url http://127.0.0.1:3689/api
groovenet config set owntone_library /srv/media
groovenet config set player_backend owntone
groovenet player start --detach
groovenet player devices list
groovenet player devices select <output-id>
groovenet player queue add "miles davis"
groovenet player play
```

Alternatively keep `player_backend` unset and pass `--backend owntone` to
`player` or `player start`. Set `owntone_output` to remember one stable engine
output ID for subsequent starts. `owntone_password` supplies HTTP Basic admin
authentication; keep the CLI config private. Human config output masks it;
`config show --json`, like the existing API-key behavior, includes credentials.
`--backend mpv` overrides the persisted choice. Artwork is an mpv-only setting.

The Unix socket and its v1 protocol are unchanged. A TUI connects to an existing
daemon regardless of the requested backend; restart it to change engines.
This is still a local daemon, not the remote server-player API from #693.

## Events, interruption and cleanup

The patch snapshots a random per-process instance ID, sequence, queue item ID
and terminal reason on the engine player thread. EOF is recorded only at the
playback boundary; input failures and failed/lost output callbacks mark the
source as failed, suppressing successful EOF. Stop and skip are not inferred
from elapsed time, play counts or an empty engine queue. The adapter emits
`ended` only for a new EOF of its owned item in the same engine instance, with
no foreign replacement queue. Duplicate/stale events cannot advance twice.

All adapter commands and polls are serialized. API outages trigger read-only
reconciliation: no load, resume or output selection is retried. A still-owned
active item can be controlled explicitly after recovery. The core retains its
error state until an explicit playback command. A completion observed across
a connection gap is treated as uncertain and **does not advance**. A restarted
engine, replaced queue or terminal interruption drops ownership and requires
an explicit new play. This favors preserving the queue over guessing EOF.

`close()` stops/clears/releases only a still-owned or completed session (or an
idle explicit output selection), and leaves a foreign session/output alone.
After ownership is lost or the API remains unreachable, cleanup cannot promise
to stop the engine; use the engine controls if necessary. The engine must not
be shared with another queue controller. Separate engines are needed for
independent player queues; concurrent instances remain unvalidated.

Typed errors include `ENGINE_UNAVAILABLE`, `ENGINE_AUTH`, `ENGINE_TIMEOUT`,
`ENGINE_API`, `ENGINE_INCOMPATIBLE`, `DEVICE_UNAVAILABLE`, `DEVICE_BUSY`,
`DEVICE_AUTH`, `NO_AUDIO`, `STREAM_FAILED` and `PLAYBACK_INTERRUPTED`.
Authentication of AirPlay receivers is managed in OwnTone, outside Groovenet.

## Volume and verification limits

`setVolume` sends 0–100 to the selected engine output. It cannot guarantee an
acoustic level. Lounge Room Audio uses Shairport's
`ignore_volume_control = "yes"`, so sender volume does **not** attenuate its
USB output. The snapshot volume is the last requested Groovenet value, not a
measured receiver level; OwnTone may report -1 when no output is selected.
Generate attenuated audio for hardware tests, rather than relying on volume 5.

The #691 prototype confirmed audible single-speaker AirPlay on Lounge Room
Audio, plus engine pause/seek/resume and USB PCM activity. That used the stock
29.3 image, not this patched build. The new adapter/patch has isolated dummy
output validation for natural EOF, external stop and queue replacement,
pause/resume/seek/volume API acceptance, and engine restart handling. Fake API
tests cover transport/auth/timeouts, ownership, stale events and reconciliation.
Patched-engine AirPlay takeover, receiver disconnect, effective volume and
audible seek accuracy still need hardware verification. No synchronized or
concurrent-engine playback is claimed.
