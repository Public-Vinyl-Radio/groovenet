# Player outputs — #1101

Validated on macOS on 2026-11-08 with the native desktop build and SDL dummy
video/audio drivers. This exercises the actual C++ application, REST/SSE worker
and SDL renderer; it does not emulate the Brick hardware.

## Automated validation

- `just brick-test`: native navigation, renderer, TLS fixture and packaging tests.
- `just brick-coverage`: the same tests plus production-entry smoke/error paths;
  LCOV is generated at `build-coverage/coverage.lcov`. Changed executable lines
  and branches were inspected against the diff. The native report exceeds
  99% line coverage and 96% branch coverage; changed executable lines are covered.
- `just lint-all`: repository-wide pre-commit hooks passed.
- `just build-packages`: production REST/SSE manager built successfully.
- `mise exec -- node apps/groovenet-brick/tests/development_smoke.mjs`: production
  manager, disposable PostgreSQL and native client passed, using a silent backend.
  Browsing preserves playback; confirmed selection stops/detaches the output;
  separate confirmed playback reattaches it. The independent controller sees
  the same queue and assignments. Exiting the client leaves playback running.

The deterministic fixtures cover idle/occupied/unknown observations independently
of desired preferences and active assignments; unassigned and other-player
outputs; empty discovery, missing desired output, malformed/oversized discovery;
identity-preserving focus across reorder/removal; Cancel and Back without writes;
unknown-status, occupied-speaker and engine-takeover prompts; both transfer
revisions; stale confirmations and revision conflicts; partial transfer with a
refreshed detached source; lost responses without retry; output loss; discovery
failure; reconnect/wake invalidation; cancellation and superseded discovery reads.
The TLS fixture checks exact command counts and permission flags. Selecting or
browsing a named player never sends an output command. No availability-policy
mutation or multi-output command is implemented.

The mock preview supports the same explicit selection and playback steps. The
three speaker rows include idle/assigned, occupied/other-player and unknown/
unassigned states; confirmations default to Cancel.

## Visual review

The screenshots were captured through the production input/action path at
1024×768 and inspected for clipping. Observations, assignments and desired-player
lists use separate lines. Transfer consequences wrap below the confirmation and
state that playback will not start. Partial failure messages wrap in the shared
acknowledgment panel.

- [Output discovery](../screenshots/outputs.png)
- [Transfer confirmation](../screenshots/output-transfer.png)

## Physical receiver verification

No live receiver URL or player credential was configured for this task. The
production-manager smoke uses a silent backend and cannot verify an actual
speaker, OwnTone transport, competing sender or device Wi-Fi recovery. A physical
receiver check remains outstanding: use a disposable named player and an idle
test receiver; verify observation-only browsing, explicit selection, declined
approvals, deliberate playback, output loss/reconnect and an explicitly approved
transfer. Do not interrupt unrelated playback. Firmware/device qualification
remains under #1102; multi-room synchronization remains under #937.
