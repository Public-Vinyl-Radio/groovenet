# Release qualification — #1102

Status: **pending physical qualification; no stable Brick release published**.
This implementation supplies release automation, not operator observations.
The preview's existing observations remain in `knulli-preview-1107.md` and
`knulli-scarab-20260511.md`; Now Playing, playlists, queue and output evidence
records describe automated/live-development checks, not full device acceptance.

## Required operator session

Use TrimUI Brick with `knulli-version` = `scarab 2026/05/11 21:44`.
Record date/operator, image provenance if available, kernel/SDL versions,
root app version, source commit, binary and launcher SHA-256 from `SHA256SUMS`.
Install a verified CI artifact using the Knulli guide; provision keys/CA separately.
Select a deliberately chosen player and output before writes. Keep credentials,
raw authenticated traffic and private device logs out of this report.

Record observed result, elapsed time, number of repetitions and failure details
for each item; do not replace pending results with inferred success:

| Gate                | Procedure and evidence needed                                                                                                                                                                                      | Result  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| sdk_abi             | Resolve the #1095 curl symbol-version warning with a pinned firmware SDK or documented exact-runtime ABI review; capture loader/dependency checks for this executable                                              | Pending |
| launch              | Cold boot and repeat Ports launches; upright 1024×768, text/buttons, launch-to-frame time; compare firmware settings before/after exit                                                                             | Pending |
| remembered_player   | Select named player, quit/relaunch, verify same player; selection alone changes no playback/output                                                                                                                 | Pending |
| artwork             | Observe multiple track covers, missing cover and long/non-ASCII metadata; reject stale cover after track/player changes                                                                                            | Pending |
| saved_playlist      | Start a saved playlist after explicit replacement confirmation; check order/playing state with another controller (#1099 hardware acceptance)                                                                      | Pending |
| volume_isolation    | Up/Down controls selected server volume; hardware volume keys change only local volume; Y/L/R once each                                                                                                            | Pending |
| external_controller | Change track/playback/volume externally and time fresh display without duplicate writes                                                                                                                            | Pending |
| long_display        | At least two hours of display use with external changes; log start/end RSS, CPU ticks, freezes/crashes and freshness                                                                                               | Pending |
| wifi_reconnect      | Lose normal AP coverage, restore it, time firmware association and authoritative state; repeat without raw interface resets or ConnMan restarts                                                                    | Pending |
| screen_off          | Short Power with continuing server playback; wake, confirm display/state without replayed commands                                                                                                                 | Pending |
| real_suspend_resume | Repeat unplugged short and 30-minute sleeps; corroborate kernel suspend or BOOTTIME minus MONOTONIC, not darkness; time fresh state after wake                                                                     | Pending |
| exit_keeps_playing  | Select/quit and firmware termination return to Ports while second controller confirms continuing queue/playback; relaunch                                                                                          | Pending |
| unplugged_battery   | Record charge %, charge status, brightness, governor, Wi-Fi and workload; run at least four hours unplugged or to low-battery warning, sample hourly; include idle/display and suspend drain, CPU/RSS and failures | Pending |
| queue               | Play, remove, move and clear with revision conflict from another controller; confirm resulting shared queue, no ambiguous write replay                                                                             | Pending |
| outputs             | Discover/refresh, cancel then confirm speaker selection/transfer, busy owner acknowledgment, unavailable output and explicit play desired output; compare another controller                                       | Pending |

These durations are a qualification protocol, not measured battery-life claims.
Record any USB-connected measurements separately: charging invalidates an unplugged
battery test. Avoid firmware network/power changes to force a pass. Retain inherited
`schedutil`, brightness, idlewatcher and suspend policy; compare resources after
normal/error/termination exit. No custom governor or screen policy is installed.

## Publication record

`release-qualification.json` deliberately has false checks and empty operator/hash
fields. After completing the session, add the measured report here and fill the
record with actual observations, date, operator and **both** executable/launcher
hashes. The report path is relative to the JSON file. The release gate requires all
shipped flows to pass and rejects a different binary or launcher. A new executable
or launcher needs fresh review/qualification; never carry hashes forward blindly.

Supported matrix: Brick/Scarab 2026/05/11 is experimental until this record passes.
Other Knulli releases, NextUI and other devices are untested. No second firmware
compatibility is claimed. Long Wi-Fi/suspend recovery, battery life and SDK/ABI
limitations from #1095/#1107 remain unresolved until the corresponding observations
are recorded. #1098/#1099 are merged but their complete hardware acceptance is pending.

## Automated validation in this implementation

- `just brick-test`: four CTest suites passed (native behavior, TLS/SSE fixture,
  isolated launcher/archive checks and stable-publication gate).
- `just brick-coverage`: 99.51% native lines, 97.07% branches overall. All changed
  native executable lines and branches are covered; unchanged live-mode desktop
  entry wiring retains one uncovered branch.
- Pinned Coverage.py 7.13.1: `qualify.py` has 100% lines and branches, including
  missing/incomplete evidence, wrong firmware, binary/launcher mismatch and
  missing/empty report rejection.
- `just brick-package`: AMD64 cross-toolchain successfully produces AArch64 ELF;
  actual archive allowlist, executable modes, complete payload hashes, license,
  placeholder config and launcher tests pass.
- `just lint-all`: all repository pre-commit checks passed after formatting.

None of these checks certifies physical firmware behavior or battery reliability.
