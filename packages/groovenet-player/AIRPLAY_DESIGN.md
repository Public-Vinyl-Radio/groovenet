# Server-hosted AirPlay players

Status: design merged in #688; prototype validation underway. Initial backend
implementation is pending.

Issue: [#651](https://github.com/Public-Vinyl-Radio/groovenet/issues/651).

## Initial delivery scope update (2026-10-24)

The design PR (#688) has merged. During prototype review, the user deferred
synchronized multi-room playback because it is not currently a priority.
The initial backend targets one selected AirPlay speaker at a time. Speaker
groups and synchronization checks below describe follow-up scope and do not
block that delivery. They remain unverified, not passed.

Independent persistent named players and queues remain planned in #693;
concurrent-instance validation is distinct from synchronized multi-room audio.
The backend work in #692 can proceed from reviewed single-output findings in
#691 without waiting for the deferred synchronization checks. See
`evaluations/691/README.md` for measured prototype results and remaining checks.

## Intended experience

Groovenet runs on the existing Debian Docker Compose host. Mac and Linux
laptops, the TUI, and eventually web and iOS clients control server-hosted
players. Closing a client does not stop server playback.

Players have persistent names and independent queues. A player can send one
queue to multiple synchronized speakers. Two players can run independent
listening sessions on different speakers. Speakers remain usable by unrelated
AirPlay applications.

The initial hardware is two Raspberry Pis running Shairport Sync with AirPlay 2
and one Sonos One. Compatibility and synchronization require tests on these
actual receivers.

Local CLI playback through mpv remains the default. Selecting a server player
is explicit; losing a server connection must not start local playback.

## Proposed engine: OwnTone

Use one OwnTone instance per configured player. OwnTone exposes one playback
queue per instance, supports multiple selected outputs, and documents running
multiple instances. Start with fixed Compose services rather than creating
containers dynamically. Instance ports, databases, identities, and timing
configuration must be isolated according to upstream guidance.

OwnTone is the preferred candidate because multi-room playback and its control
API fit this use case. This choice is conditional on the hardware and audio
delivery checks below. pyatv remains an alternative to investigate if OwnTone
fails those checks; its audio protocol controls and device compatibility must
be verified rather than inferred from Apple TV remote-control support.

Research baseline: OwnTone 29.3 and pyatv v0.18.0 were the latest upstream
releases reported during the discussion on 2026-10-24. pyatv identifies its
license as MIT; OwnTone includes the GPL version 2 license. Treat OwnTone as a
separate service and record the exact image, version, and license information
when choosing the deployment artifact.

## Ownership and persistence

Groovenet owns the logical queue, current entry, and player configuration.
OwnTone owns audio transport, output synchronization, and observed playback
position. Initially mirror only the current track into OwnTone; disable its
shuffle/repeat and avoid independent queue advancement. Identify each load
with a generation so delayed events cannot advance a replacement track.

A server playback worker owns long-lived player instances. The web API forwards
authenticated commands to that worker; request handlers must not create their
own PlayerCore instances. Serialize commands per player and speaker transfers
across players. A browser disconnect does not affect worker lifetime.

Persist named player configuration, queues, current entry, desired speakers,
and a checkpointed position in Postgres. Actual connections are transient.
After restart, restore the session without automatically claiming speakers or
resuming audio. Report the last saved position as a checkpoint until fresh
engine state is available. Database changes need migrations.

## Speakers and other AirPlay senders

Remembering a desired speaker does not reserve it. Within Groovenet, a speaker
can be assigned to at most one active player. Moving it between players is an
explicit operation; detach it from the old player before connecting the new
one. Partial failures must be reported rather than showing an atomic transfer
that did not happen.

Proposed external-session policy:

- Observe speaker status before connecting. A known external session blocks
  normal connection; replacing it requires an explicit user action.
- Treat paused external sessions as potentially occupied.
- If status cannot be established, show unknown. Do not label the speaker free
  or automatically claim it during startup/recovery. An explicit connection
  request can proceed after the client communicates that availability is unknown.
- If a speaker is lost during playback, continue on the remaining outputs and
  show the loss. If no outputs remain, pause and preserve the queue and position.
- Do not continually reconnect and compete with another sender. Rejoining a
  lost speaker requires an explicit action, except one retry when it returns
  within seconds of a loss during playback, never over another sender (#1241,
  see `SERVER_PLAYERS.md`, "Lost speakers").
- Stop releases output connections. Pause preserves logical session state;
  whether it releases transport immediately must be validated against resume
  and external-sender behavior. Do not promise idle release until measured.

These are application policies, not guarantees of receiver behavior. Another
sender can race with a connection attempt. OwnTone may not expose enough
information to distinguish a network loss from an external takeover. Never
infer sender identity solely from matching track titles.

## Home Assistant status adapter

Make HA an optional, read-only status source. Map stable AirPlay device IDs to
HA entity IDs. Combine HA observations with Groovenet's active assignments and
OwnTone connection results; no source alone establishes exclusive ownership.

The infrastructure repository at `/Users/saegey/Projects/townhaus-caddy`
documents `parautenbach/hass-shairport-sync`, receiver MQTT topics
`aswitch/shairport` and `pi-cam/shairport`, and an automation referencing
`media_player.lounge_streamer`. Its MPRIS bridge publishes metadata; native
Shairport MQTT provides playback events.

The inspected upstream integration maps play start/resume to playing, play
end/flush to paused, and active end to idle. It initializes to idle and does
not expose sender identity. Therefore HA idle alone is not proof that a speaker
is available. Subscription continuity, initial-state confidence, and reconnect
behavior need explicit handling. No recent state change is not by itself proof
of stale data: an unchanged session may play for a long time.

Live HA inspection is pending: HA MCP tools were not exposed in the discussion
session. Confirm deployed integration versions, real entity IDs, Sonos
attributes, and whether additional sender/session metadata is available.

If configured, HA unavailability produces unknown status without erasing
queues or stopping otherwise healthy playback. Use authenticated server-side
HA access; never expose its credential to clients. The MCP connection used for
development inspection is not a runtime dependency.

## Backend and events

Implement an OwnTone adapter behind PlaybackBackend. Map load, pause/resume,
absolute seek, volume, device listing, and close to the engine API. Convert
milliseconds to seconds at this boundary. Use notifications to trigger fresh
state reads, with bounded polling/reconciliation as needed.

Extend the single-device interface with a multi-output operation and explicit
output state; preserve the existing mpv behavior. Report desired, connected,
and lost outputs separately. Add typed errors for missing/unreachable engine,
busy/unavailable speaker, authentication failure, unsupported operation, and
stream failure. Do not expose raw credentials in errors or logs.

An observed stop must not automatically emit ended: it may mean interruption,
explicit stop, replacement, or engine failure. Natural completion must be
distinguished before PlayerCore advances its queue. On reconnect, reconcile
current engine state before emitting events; do not blindly replay load/play.
Hardware validation must establish whether end detection is reliable enough.

## Authenticated audio delivery

The current resolver produces `/api/audio?filename=...` with an Authorization
header. Do not assume OwnTone forwards arbitrary headers or that the receivers
can fetch authenticated Groovenet URLs.

Evaluate two paths during the prototype:

1. A private, range-capable relay that fetches Groovenet audio with server-held
   credentials and gives OwnTone a short-lived, track-scoped URL. Preserve
   seeking and bound streaming buffers; redact tokens from logs. Define URL
   lifetime and renewal for long tracks and later seeks.
2. A read-only audio volume mounted into OwnTone, with validated mapping from
   stored audio filenames to engine-readable sources. Confirm the API accepts
   this path without a duplicate library import requirement.

Choose one in a design revision after proving it works. Do not put the global
Groovenet API key in an audio URL or bypass endpoint authentication.

## Client control surface

Expose authenticated, player-scoped commands and state through the existing web
API conventions. Include player ID from the first version. Support listing
players, reading queue/state, transport controls, queue changes, selecting
multiple outputs, and explicit speaker transfer. Stream state updates with a
fresh snapshot on reconnect and revisions to detect conflicting client edits.

The TUI gains an explicit remote-player selection while retaining its local
Unix-socket mode. Web/iOS clients use the same server API. Exact endpoint names,
authorization rules, and UI controls belong in the implementation plan; a
native iOS player and phone-local AirPlay sending are separate work.

## Deployment and validation gates

The first prototype uses one OwnTone instance; production concurrency requires
a second instance check. Verify mDNS discovery, host/network reachability,
firewall requirements, and AirPlay timing on Debian Docker. Consult upstream
multiple-instance guidance, including airptpd requirements, before choosing
Compose network mode and port assignments. Persist each engine's database
separately. Keep engine control endpoints private to the server environment.

Before implementation is considered complete, verify:

- All three receivers appear with stable identities and can play individually.
- Both Pis and Sonos play together in sync, including after seek and rejoin.
- Two engine instances play independent queues on disjoint outputs.
- Pause/resume, seek, master/per-output volume, natural completion, and queue
  advancement behave correctly without duplicate events.
- Another app is already playing before Groovenet connects, and another app
  takes over during Groovenet playback, on both receiver types.
- A receiver disappears, all outputs disappear, HA restarts/disconnects, OwnTone
  restarts, and the playback worker restarts without reclaim loops.
- Audio authentication, range requests, token expiry if used, and long tracks
  work without leaking credentials.

Use fake OwnTone APIs and fake HA observations for unit and contract tests,
including event races, timeouts, partial transfers, and duplicate completion.
Run component coverage and required checks for each changed component. Record
hardware versions, commands, results, and limitations in a reproducible smoke
test document; mocked tests do not satisfy hardware acceptance.

## Proposed delivery sequence

1. Review this design, inspect live HA state, and run a disposable OwnTone
   hardware/audio-delivery prototype without replacing existing playback.
2. Revise the design with the proven audio path, deployment settings, event
   semantics, and remaining receiver limitations.
3. Implement the backend and worker with one persistent player and a
   player-scoped API; verify a second configured player before claiming
   concurrent-session support.
4. Add remote TUI control and speaker selection. Track web/iOS UI work as
   explicit follow-ups while preserving the shared control API.

## References

- [OwnTone project](https://github.com/owntone/owntone-server)
- [OwnTone JSON API](https://github.com/owntone/owntone-server/blob/master/docs/json-api.md)
- [Multiple OwnTone instances](https://owntone.github.io/owntone-server/advanced/multiple-instances/)
- [OwnTone configuration](https://github.com/owntone/owntone-server/blob/master/owntone.conf.in)
- [pyatv supported features](https://pyatv.dev/documentation/supported_features/)
- [HA Shairport integration](https://github.com/parautenbach/hass-shairport-sync)

References to moving upstream branches describe research context, not a pinned
deployment contract. Verify behavior against the selected release artifacts.
