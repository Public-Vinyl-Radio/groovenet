# #693 persistent server players — validation

Validated on 2026-10-24. This records backend behavior; remote TUI controls are
follow-up #694. Synchronization was explicitly deferred.

## Automated checks

- Unit coverage for shared contracts, TypeScript client, player manager, HTTP,
  HA observer, Postgres store, worker lifecycle and Next API proxy/routes.
- `just server-players-test`: disposable migrated Postgres verifies independent
  queues, revision CAS, unique engine/output claims and worker lease exclusion.
- `just migrate-test`: migration up/down/up against disposable Postgres.
- `deployment-smoke.mjs`: actual engine entrypoint, separate clock and engine
  containers on a Docker internal network, no published ports or audio. Verifies
  refusal without shared clock memory, working shared IPC, engine API startup,
  `/run/dbus` traversal and unprivileged D-Bus access to Avahi.
- `isolated-smoke.mjs`: disposable Postgres, worker and two actual OwnTone
  engines with dummy/FIFO outputs. Verifies independent queues, SSE disconnect,
  EOF advancement in one player while the other stays paused past idle transport
  release, and stopped checkpoint restoration after worker restart.

Run the silent container checks from the repo root with Docker available:

```sh
just server-players-smoke
```

These scripts clean up their disposable containers/network. The isolated
fixture uses generated audio and silent outputs. Neither needs production data,
HA credentials or real receivers.

## Real Debian / two-room result

Used a temporary worker, disposable database, two dedicated OwnTone engines,
shared airptpd and read-only generated fixtures on the Debian Docker host.
Production services, music database and receiver configurations were unchanged.
Outputs were **Lounge Room Audio** and **aswitch**, both Shairport AirPlay 2
receivers. The user stopped the other app's stream and confirmed both ready.

| Check                                 | Result                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent playback on both outputs  | Both receiver MPRIS states were Playing simultaneously; user confirmed “yeah i hear it in both rooms”                                             |
| Controller/SSE disconnect             | Playback continued                                                                                                                                |
| Independent EOF advancement           | Lounge advanced while aswitch stayed paused on its own first entry at 10.49 seconds, without error after 12 seconds paused                        |
| Worker restart                        | Both two-entry queues retained stable entry IDs; restored stopped checkpoints with assignments cleared and no automatic playback/reclaim          |
| Explicit cross-engine output transfer | Source detached and paused; destination played its own queue on Lounge from its saved 5-second position; detached=true, attached=true, error=null |
| Explicit stop after transfer          | Released the transferred output                                                                                                                   |

Fixtures were generated PCM sine tones with attenuation around -30 dBFS peak.
The Lounge receiver ignores sender volume. One early restart assertion expected
Lounge's current entry to remain non-null after its short queue had naturally
finished; that timing assumption was corrected. Final restoration checks allowed
the completed queue and verified the other player's saved entry and position.

Two deployment defects discovered here are covered by the silent regression:
the engine needs access to the shared POSIX clock memory, and the engine's
unprivileged process needs to traverse `/run/dbus`. A separate pause defect was
fixed in the terminal patch: normal idle transport release while paused must
not signal playback interruption. Resume rechecks activity when disconnected.

All temporary hardware-test containers, generated media volume, test network
and credential files were removed. No further audible test is needed to
reproduce these recorded results.

## Limits

No claim of synchronized playback, Sonos validation, receiver outage recovery,
effective receiver volume or audible seek precision. Actual HA-token integration
was not exercised; observer behavior has unit coverage. Restarted worker state
is a saved checkpoint, not a live engine observation. An abrupt worker crash can
leave unowned engine audio playing; uncertain release requires explicit engine
stop followed by worker restart. See [operator recovery](../../packages/groovenet-player/SERVER_PLAYERS.md#restarts-and-recovery).
