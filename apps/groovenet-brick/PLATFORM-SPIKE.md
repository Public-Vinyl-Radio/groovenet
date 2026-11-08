# Brick firmware lifecycle spike — #1095

## Decision and scope

**Status: pending physical comparison. No supported v1 firmware/version yet.**
The owner has a TrimUI Brick running Knulli; its version and device access have
not yet been supplied. There has been no physical run under either firmware.
The desktop probe is preparation, not device evidence.

Provisional recommendation: evaluate the installed Knulli first, then NextUI on
a separate backed-up SD card. Choose exactly one firmware and pin its verified
release only after the table below is populated. NextUI is a packaging candidate
because it documents tool Paks, but its standalone power caveats prevent a
supported-firmware recommendation today. Firmware-specific implementation in
#1096/#1102 remains gated; desktop UI work can continue.

## Upstream findings (research, not measurements)

- [Knulli Brick documentation](https://knulli.org/devices/trimui/brick/) identifies
  the A133/PowerVR platform and EmulationStation interface. Its
  [build documentation](https://knulli.org/development/building-knulli-with-docker/)
  lists `a133-build`. Neither establishes this app's SDL display or input behavior.
- [NextUI build documentation](https://nextui.loveretro.games/development/build/)
  identifies `tg5040` for Brick and Docker toolchains for handheld builds.
  Its [Pak documentation](https://nextui.loveretro.games/paks/making-paks/)
  describes `Tools/tg5040/*.pak/launch.sh`, warns that standalone apps may miss
  menu/power integration, and documents governor/settings helpers. Infer that a
  native app needs an explicit power integration assessment; do not assume a
  standalone SDL process inherits built-in emulator behavior.
- [NextUI power documentation](https://nextui.loveretro.games/customizing/power-leds-clock/)
  distinguishes screen timeout from later suspend, documents NTP, and warns of
  standalone resume failures. These are reasons to test, not evidence the probe
  resumes correctly. [Knulli power documentation](https://knulli.org/configure/power-management/)
  is another input to the comparison; actual Brick behavior remains pending.

Build separate artifacts until ABI equivalence has been demonstrated: matching
architecture does not prove matching libc, loader, SDL video driver, libcurl TLS
backend or CA location. The probe requires SDL2, libcurl and libpng, plus their
transitive runtime dependencies. Exact target versions are pending. There is no
production firmware integration or direct-launch hook in this change.

## Current evidence

| Item                                        | Desktop preparation                        | Knulli Brick                       | NextUI Brick                       |
| ------------------------------------------- | ------------------------------------------ | ---------------------------------- | ---------------------------------- |
| Firmware release/image SHA-256              | N/A                                        | Pending                            | Pending                            |
| SDK commit/container digest/compiler triple | AppleClang 21.0.0.21000401, arm64 macOS    | Pending                            | Pending                            |
| Runtime libraries                           | SDL2 2.32.74, libcurl 8.7.1, libpng 1.6.59 | Pending, including loader/libc/TLS | Pending, including loader/libc/TLS |
| Build, install, launcher handoff            | Host build only; see probe README          | Pending                            | Pending                            |
| Orientation/artwork/button mappings         | Dummy driver automated checks only         | Pending                            | Pending                            |
| Persistent configuration/launcher return    | Counter/error/signal tests only            | Pending                            | Pending                            |
| HTTPS/local CA/SSE                          | Local TLS fixture only                     | Pending against dev Groovenet      | Pending against dev Groovenet      |
| Wi-Fi loss, screen-off, real suspend/resume | Not exercised                              | Pending                            | Pending                            |
| Launch/wake-to-fresh, CPU/RSS/battery       | No device measurements                     | Pending                            | Pending                            |
| Power ownership/settings/direct launch      | No integration                             | Pending                            | Pending                            |

## Repeatable device session

Use the same Brick, access point, development server, named player, CA, PNG and
probe commit for both firmware sessions. Back up cards before changing firmware;
keep the existing Knulli install recoverable. Never flash or change power policy
as part of the probe launch. Follow [build/run instructions](probe/README.md).
Keep private token files and raw diagnostic logs outside git. Publish sanitized
logs, photos and summary measurements with each run record.

1. Record firmware release, image checksum, kernel (`uname -a`), `/etc/os-release`
   where present, UTC `date -u`, clock/NTP settings and device model. Record probe
   commit/binary hash, SDK source commit/image digest, compiler `--version` and
   `-dumpmachine`, `readelf -l -d`, and on-device `ldd` output. Record launcher
   path, persistent storage paths, inherited SDL/library variables, missing
   dependencies and any build/install deviations. Do not include tokens.
2. Launch from the firmware menu ten times, including one cold boot. Film the
   launch input, display and a visible stopwatch at >=60 fps. Record median and
   worst tap-to-first-frame; probe `first_frame` excludes launcher and loader
   overhead. Check red/green/blue corners, correct cover orientation/aspect,
   readability, scaling and display restoration. Try missing/corrupt artwork.
3. Press/release each D-pad direction, A/B/X/Y, shoulders, Start/Select, Menu,
   F1/F2, volume and short Power separately. Record SDL key/joystick codes and
   any firmware interception, repeat or duplicate events. Observe long Power
   only when safe to shut down. Do not map Power to a playback command. Capture
   firmware volume/brightness before and after, quit normally, then verify the
   launcher works. Relaunch and reboot to verify the counter persists; test an
   unwritable counter path for a visible failure in the log.
4. On the dev server enable the same existing player API authentication used by
   the app. With the correct hostname/CA and accurate UTC, require a `snapshot`
   event. Confirm named-player state through another controller. Repeat with
   wrong CA, wrong hostname, missing/invalid token, and an intentionally wrong
   clock (then restore/synchronize it). All must fail closed. Record whether NTP
   works after cold boot before HTTPS; never work around TLS errors by disabling
   verification. Probe framing alone is not proof of correct application state.
5. Disconnect Wi-Fi for 60 seconds while a second controller changes the player.
   Reconnect and time until a new snapshot. Repeat with server restart. Logs
   should show bounded reconnects; observe the correct server state independently.
   Confirm server playback continues throughout and no old command is replayed.
6. Separately test screen timeout, short Power, actual suspend and wake after
   30 seconds and five minutes. Record how each mode was entered and firmware
   settings. A black screen alone is **not suspend**: compare heartbeat/log
   activity, SSH reachability and kernel suspend/resume diagnostics where
   available. Note uncertainty if the firmware cannot expose the distinction.
   Change tracks from another controller while asleep. Film ten wake attempts;
   record wake-input-to-visible-frame and wake-input-to-next-snapshot separately.
   Because this probe displays static artwork, verify fresh state on the server
   separately; the probe cannot certify final Now Playing UI freshness.
7. Measure CPU and RSS over at least five idle minutes using the firmware's
   available `top`/`ps` or `/proc` counters; document sampling period and CPU
   normalization. Record governor, brightness, LEDs, Wi-Fi, temperature, refresh
   rate (20 Hz), server event frequency and charging state. At equal starting
   charge, observe at least 30 minutes unplugged in visible-idle and screen-off
   modes; separately observe real suspend. Record before/after battery readings,
   elapsed time, firmware battery estimation limitations and baseline launcher
   drain. Do not infer full battery life from coarse percentage readings.
8. Establish which process owns Menu/Power/suspend, and whether standalone apps
   must call firmware helpers. Check restoration of brightness/volume and
   launcher power behavior after exit. For NextUI compare the documented governor
   helper with the default full-clock Pak launch in a separate recorded run.
   Investigate a documented user startup/autostart hook for each pinned version;
   record reversibility/recovery, dependency on launcher environment and whether
   a firmware fork is necessary. Do not install a boot hook during observation.

## Run record (copy once per firmware)

- Operator/date/device; firmware release, image hash, boot-card backup:
- Probe commit/hash; SDK commit/digest; complete build commands and toolchain:
- Loader/libc/SDL/video driver/curl/TLS/png runtime versions and `ldd`:
- Actual install directory, launch script, log path and persistence directory:
- Development endpoint hostname (no credentials), CA method, UTC/NTP condition:
- Result for each step 1–8, sanitized log/photo links, pass/fail/pending and reason:
- Launch and wake samples, median/worst, measurement method and limitations:
- CPU/RSS samples; idle/screen-off/suspend battery observations and conditions:
- Power owner, needed adapters, direct-launch hook and recovery procedure:
- Unresolved risks; recommended single v1 firmware and exact supported release:

Acceptance for a supported release requires working launcher return, persistent
storage, correct rendering/inputs, trusted HTTPS, bounded recovery after Wi-Fi
loss and actual suspend, and continued server playback. Reject unexplained wake
black screens or missing power ownership. If only one firmware is measured, label
it a candidate and leave the comparison pending. Publish the eventual decision
with evidence links here before removing the firmware implementation gate.
