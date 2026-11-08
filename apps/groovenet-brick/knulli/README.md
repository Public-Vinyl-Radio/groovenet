# Groovenet Brick for Knulli

Target: TrimUI Brick, Knulli Scarab **2026/05/11**. Audio stays on the server.
The shared application implements remembered player selection, artwork, saved
playlists, queue editing and output routing. Full physical release qualification
is **pending**; see [release evidence](../evidence/release-1102.md).

## Build, version and publication

Run `just brick-package` from the repository root with Docker running.
The existing packaging path cross-compiles C++17 for AArch64 using GCC 12 on
Linux AMD64 (Docker emulation is needed on ARM hosts). No npm build invokes it.
The Debian base image digest and 2026-11-07 snapshot pin the toolchain and both
host/target dependency packages. `toolchain.cmake` restricts pkg-config to target
libraries. The build container runs without network access after image creation.

The root `package.json` supplies the version. Output in `build-knulli/`:
`groovenet-brick-VERSION-knulli-scarab-arm64.tar.gz` and `.tar.gz.sha256`.
`BUILD.txt` records the commit, tracked source diff hash, compiler, package versions,
ELF loader and dependencies. The sorted archive has fixed timestamps/ownership;
`SHA256SUMS` covers every payload file except itself. Repeating a build of the
same clean source and toolchain should yield identical archives; verify both
sidecars before claiming reproduction. Untracked files are not source inputs.

The archive allowlists the binary, launcher, DejaVu Sans plus its license,
project license, placeholder config and instructions. Credentials, private CA,
config, remembered selection and logs are never packaging inputs.

`Brick Knulli package` CI builds scoped PR changes and manual previews. Download
its workflow artifact for testing. Root `vX.Y.Z` releases created by release-please
build the tagged source and attach the versioned archive and checksum **only after**
`qualify.py` accepts the complete operator record and matching executable hash.
Other package releases do not publish Brick assets. Publication has a separate
job with write permission; PR builds have read permission. Ordinary JavaScript
builds remain independent of CMake/SDL. A failed publication gate leaves the CI
artifact available as an experimental preview, without attaching stable assets.
After qualification is committed, rerun the failed release workflow on its tag;
qualification must be present in that tagged source. Do not edit old release tags.
Use a new release if evidence was not included in the previous tag.

This remains an older Debian ABI baseline, **not a pinned Knulli firmware SDK**.
The package uses firmware SDL2/SDL_ttf, curl, json-c, PNG/JPEG and C++ runtime
libraries and `/lib/ld-linux-aarch64.so.1`; it never overwrites firmware libraries.
The observed curl symbol-version warning is unresolved. Stable publication stays
blocked until an exact-binary loader/ABI review and physical qualification are
recorded; cross-compilation alone does not establish compatibility.

## Install, configure, update and remove

1. Verify the archive sidecar with `shasum -a 256 -c FILE.sha256` on macOS or
   `sha256sum -c FILE.sha256` on Linux. Extract into `/userdata/roms/ports/`:
   `Groovenet.sh` and its sibling `groovenet-brick/` must stay together. Make the
   script executable (`chmod 755 /userdata/roms/ports/Groovenet.sh`). Refresh the
   Ports game list if necessary. No firmware flashing or startup hooks are used.
2. Separately create `/userdata/system/configs/groovenet-brick/` (mode 700).
   Copy `config.example` there as `config` (mode 600), then privately provision
   the real server origin (without `/api`), player API key and collection API key.
   These are separate credentials: the launcher never obtains or substitutes
   them. Do not put credentials in command arguments or share the config/logs.
3. For a private CA, copy its **public root certificate PEM**, never its private
   key, to `ca.pem` in that directory and set `BRICK_CA_FILE`. Omit that setting
   for public trust. Use a hostname matching the certificate and correct device
   time. TLS/hostname verification stays on; do not use insecure mode. Provision
   secrets through the owner's established private setup, independently of the
   archive. An invalid configuration produces a disconnected/error screen.
4. Launch **Groovenet** from Ports. The device profile uses a fullscreen 1024×768
   logical canvas and the firmware display driver/orientation. Use Start to open
   Browse, then Players; deliberately select the desired player before issuing
   any controls. With no remembered player, controls remain unavailable until explicit selection.
   Selection only observes the chosen player; relaunch opens the remembered player. Press B twice
   to return from Players through Browse to Now Playing; verify its name and state.
5. Update while the app is closed: replace the script and application directory
   from a new verified archive. Configuration survives outside Ports. Remove by
   deleting those two Ports entries. Optionally delete the config directory to
   remove keys, CA and logs. For rollback, replace those same entries with a previously verified version;
   configuration remains in place. Back up the private config directory separately
   before updating. If remembered selection is unusable, choose Players again;
   to reset it, move aside the `Groovenet/Brick` preference directory under that
   config root while the app is closed. Preserve the credential `config` file.
   No firmware files or power policy need restoring.

On the measured card, `/userdata` is a `fuseblk` mount exposing synthetic 777
modes: `chmod 600` does not enforce isolation there. The modes above express the
intended policy, not a protection verified on this card. Keep credentials on this
owner-controlled device, provision them privately, and do not share the config.
Use storage that enforces Unix permissions if account isolation is required.

Persistent config/log path: `/userdata/system/configs/groovenet-brick/`. The
launcher overwrites `preview.log` at each launch, with a restrictive umask (subject to the firmware filesystem behavior above). The
application keeps artwork in memory and persists the selected player through SDL preferences;
`XDG_CACHE_HOME` reserves `cache/` under that same directory for future use. Only player identity is remembered; server playback remains authoritative. Never include real config or diagnostic logs
in a shared archive. Application network diagnostics omit headers/body/secrets.

## Controls and firmware lifecycle

The device profile overrides SDL's erroneous Xbox mapping for the Brick GUID
`030000005e0400008e02000014010000`, using the installed Scarab EmulationStation
button assignments, with physical axis-based D-pad correction. It overrides
Ports’ inherited `SDL_GAMECONTROLLERCONFIG` before SDL initializes, since the
firmware exports a conflicting hat mapping with higher priority than SDL’s normal
mapping API. Physical verification status is in the evidence record.

| Physical control   | Action                                                                    | Firmware raw SDL assignment |
| ------------------ | ------------------------------------------------------------------------- | --------------------------- |
| D-pad              | Now Playing: up/down remote volume; lists: up/down focus; left/right skip | axes 0/1                    |
| A / B              | Select / back                                                             | buttons 5 / 4               |
| Start              | Browse menu                                                               | button 13                   |
| Y                  | Play/pause                                                                | button 7                    |
| L / R              | Previous / next                                                           | buttons 8 / 9               |
| Select             | Quit to Ports                                                             | button 12                   |
| Device volume keys | Firmware local device volume only                                         | deliberately unmapped       |
| Power              | Firmware sleep/wake only                                                  | never a playback write      |

There is no L3/R3 dependency. Server volume and local device volume are distinct.
Navigation, unavailable/disconnected states and playback share the desktop
implementation. Controls stay disabled without authoritative live state. Writes
are attempted once; ambiguous writes refresh state and require deliberate retry.
During a command/wake refresh, the last known metadata stays visible with an
UPDATING indicator and controls disabled until fresh server state arrives. Actual
network failures still show disconnected; no volume/playback change is predicted.

Short Power remains firmware-owned: no second power daemon or helper is installed.
Power notifications invalidate live state; a wall-clock gap over two seconds also
cancels unsent work and requests a fresh snapshot, covering suspend without focus
events. The firmware restores the display; the app continues rendering each loop.
Quit, disconnect and sleep never issue stop/pause. Already transmitted writes
cannot be undone, and are never automatically replayed. Wi-Fi association belongs
to ConnMan: the probe needed operator recovery after a raw interface reset. Normal
AP loss, longer unplugged sleep and repeated display recovery remain physical
qualification checks; this preview makes no battery/reliability claim.

## Physical smoke test (owner observations required)

Record firmware version, archive/binary hash, server hostname without credentials,
selected player name and whether a speaker was deliberately attached. Do not
publish keys or raw authenticated responses.

1. Launch from Ports; confirm upright full-screen image, legible text and hints.
   Open Players with Start, Down, A. Navigate and select the intended player;
   independently confirm that selection did not change server playback/routing.
2. On that player, change track from another controller. Confirm fresh matching
   metadata/state on the Brick. Observe loading, unavailable and disconnected
   states when the test service is unavailable, and recovery after it returns.
3. Deliberately press Y twice, L and R, then Up/Down on Now Playing for server
   volume ±5. Confirm each action once on the intended server player. Open a list
   and confirm Up/Down moves focus without changing volume.
   Check local volume changes only device volume. Check B returns, focus wraps,
   and no controls require L3/R3. Report any mismatched physical button by name.
4. Leave server playback running, short Power, wait 30 seconds, change tracks
   externally, wake. Confirm display restoration and a fresh track/state. Repeat
   after five minutes; record observed recovery time and Wi-Fi problems. Confirm
   no playback write occurred on sleep/wake. Do not infer suspend from darkness
   alone; record kernel suspend evidence separately when available.
5. Press Select, confirm return to Ports and continued server playback. Relaunch
   and verify configuration persists. Player selection must be remembered.

Run `just brick-test`, `just brick-coverage` and `just lint-all` for changes.
Package checks inspect archive membership, ELF architecture/dependencies, license,
placeholder-only configuration and launcher behavior. Desktop/mock checks cannot
certify physical inputs, framebuffer restoration, speaker playback or Wi-Fi.

## Troubleshooting and platform boundary

- No Ports entry: keep `Groovenet.sh` beside `groovenet-brick/`, set executable
  mode, refresh the game list. Launch from Ports rather than a second power daemon.
- Loader error or missing shared library: record firmware, binary hash and missing
  dependency; return to the prior archive. Do not copy arbitrary host libraries
  into firmware paths. The ABI gate remains pending until reviewed on target.
- TLS failure: check device time, certificate hostname, `BRICK_CA_FILE` and its
  public PEM. Keep verification enabled. Player and collection keys are separate.
- Disconnected after wake: wait for firmware Wi-Fi association; the application
  refreshes state without replaying writes. Normal AP loss must be qualified
  separately from the probe's failed raw interface-reset experiment.
- Missing battery: SDL reports unknown on some firmware. The UI shows unavailable
  instead of estimating a percentage. This is not battery-life evidence.
- Failed configuration: restore the private backup or provision `config.example`
  again. Inspect `preview.log` locally; never attach raw config or authenticated
  traffic to a public issue.

| Device / firmware                       | Status                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| TrimUI Brick / Knulli Scarab 2026/05/11 | Experimental, measured preview; full release qualification pending |
| Other Knulli versions or devices        | Untested                                                           |
| NextUI                                  | Unported, untested                                                 |

`Platform` owns input, configuration location and battery reporting. Knulli-specific
mapping and lifecycle handling stay behind `--platform knulli`; REST/SSE, rendering
and playback policy are shared. A second firmware needs its own measured adapter
and launcher, without adding firmware conditionals to the network client.

The launcher retains the inherited `schedutil` governor and firmware screen/idle/
suspend settings. It changes no sysfs nodes, services, brightness or global SDL
configuration, and has no background helper to leak. SIGINT/SIGTERM and Select
release SDL resources and return to Ports without a server playback write.
Keeping inherited policy avoids imposing a performance governor on an idle remote;
CPU/battery suitability still needs the unplugged measurement in the evidence plan.
