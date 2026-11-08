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
record with actual observations, date, operator and executable/launcher/decoder
hashes. The report path is relative to the JSON file. The release gate requires all
shipped flows to pass and rejects a different binary or launcher. A new executable, decoder
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

## Follow-up device install and D-pad regression, 2026-11-08 UTC

The owner requested installation over the established USB ADB connection and
reported that the previously fixed D-pad stopped working while A/B still worked.
The connected device again reports Scarab `2026/05/11 21:44` and kernel 4.9.191.
The old installed executable hash matched the final #1107 preview
(`a7703826366e05b7857b78e90f53827b51e48fcaea9feb3733bb0e65d02a608e`), and its
command line included `--platform knulli`; it was not an accidental desktop launch.

With the remote closed to prevent playback writes, a 45-second `sdl2-jstest
--event 0` capture during owner presses showed hat 0 values **1, 4, 8, 2** for
Up/Down/Left/Right and centered 0 between presses. The controller GUID is unchanged:
`030000005e0400008e02000014010000`. This differs from the earlier axis capture;
why the firmware/runtime event representation changed is not established. The
application now handles raw cardinal hat events as well as the existing mapped
axis events, retaining the A/B and environment-mapping corrections. SDL virtual
controller tests exercise both forms and assert exactly one action per hat press.
Desktop mode, other hats, neutral and diagonals do not become playback actions.

The first staging dependency check found **libjpeg.so.62 missing**: this firmware
provides JPEG ABI 8 and 9. Installation was stopped before replacing the old app.
The revised package bundles the frozen ARM64 Debian JPEG ABI 62 decoder and its
license under the app's `lib/`, with a private launcher library search path. A
second on-device `ldd` resolved all dependencies. The existing curl symbol-version
warning remains; this is not a completed firmware SDK/ABI qualification.

The revised app was installed into Ports after closing the old remote. Every
installed payload passed `SHA256SUMS`. Private config and CA were preserved;
previous app files are backed up on-device under
`/userdata/system/groovenet-brick-backup-1102-20261108-180403` (no credentials in
that app-only backup). No firmware libraries/services or power policy were changed.
No agent playback commands were sent. The owner was asked to relaunch from Ports
and test Start/menu navigation. The owner replied **“Yes, navigation works”**.
The running process was then verified to load the private JPEG decoder and use
the documented persistent `XDG_DATA_HOME`. This confirms the navigation regression
fix on this device; it does not complete the remaining physical qualification.

Installed executable SHA-256:
`28aedd306ede1cc6e2db22de6dd57447128f268c2fae14a7434800c630b78699`.
Installed launcher SHA-256:
`1c0b0867ae4913cde7e9d010dc297f1ef048513af62edb2e78cf1945a3d3120c`.
Bundled JPEG SHA-256:
`4021b9b82df1affabe252aec393c00f2ec61b7ab570e760f4b4cf76db9b449ab`.
Installed archive SHA-256 (working-tree build after the D-pad patch):
`7f3d6de566c9d225d594140a417ed4fba31be60e478d6c8053df8de01acae374`.
Final documentation/commit builds may change the archive provenance and checksum;
these hashes identify the actual installed payload.

Follow-up `just brick-coverage`: four suites passed, 99.51% native lines and 96.92%
branches overall; new hat handling has complete line/branch coverage. Publication
gate remains 100% lines/branches and additionally checks the bundled decoder hash.
Actual archive tests cover the ARM64 decoder, its license and full manifest.
