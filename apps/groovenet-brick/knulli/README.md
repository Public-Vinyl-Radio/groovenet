# Experimental Knulli application preview — #1107

Target: TrimUI Brick, Knulli Scarab **2026/05/11**. This is the shared application
and native REST/SSE client, not the static lifecycle probe. Audio remains on the
server. Artwork, remembered player selection, playlists, queue editing and output
routing remain in #1098–1101. Physical acceptance and ABI results are recorded in
`../evidence/knulli-preview-1107.md`; pending steps are not desktop validation.

## Build and contents

From the repository root run `just brick-package` with Docker running and
`linux/arm64` execution available (native ARM64 or configured Docker emulation). It builds
Linux ARM64 using the exact Debian image digest from the measured #1095 probe,
a frozen Debian snapshot dated 2026-11-07, GCC 12/C++17 and Release CMake. No npm
build is involved. Output: `apps/groovenet-brick/build-knulli/` containing
`groovenet-brick-knulli-preview.tar.gz` and its SHA-256 sidecar. Copy/share these
local files; no automatic release publishing is performed. `BUILD.txt` records
the source commit/diff hash, compiler, all package versions, ELF loader and direct
dependencies. `SHA256SUMS` records the binary and font/license hashes.

The archive contains `Groovenet.sh`, `groovenet-brick/groovenet-brick`, the
redistributable DejaVu Sans font and license, project MIT license, placeholder config and these
instructions. It contains no credentials, CA, local config, cache or raw logs.

This is **not an official pinned firmware SDK**. It uses the experimentally
validated older Debian ABI baseline, loader `/lib/ld-linux-aarch64.so.1`, firmware
SDL2/SDL_ttf, json-c, curl, libstdc++ and transitive libraries. Nothing is installed
into `/lib` or `/usr`. The prior probe's curl symbol-version warning remains a
limitation; the actual application must also pass on-device loader checks. A
proper Knulli SDK and full release qualification remain #1102.

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
   any controls. The client initially observes the first returned player (Aswitch
   on the test server); selection only observes the chosen player. Press B twice
   to return from Players through Browse to Now Playing; verify its name and state.
5. Update while the app is closed: replace the script and application directory
   from a new verified archive. Configuration survives outside Ports. Remove by
   deleting those two Ports entries. Optionally delete the config directory to
   remove keys, CA and logs. No firmware files or power policy need restoring.

On the measured card, `/userdata` is a `fuseblk` mount exposing synthetic 777
modes: `chmod 600` does not enforce isolation there. The modes above express the
intended policy, not a protection verified on this card. Keep credentials on this
owner-controlled device, provision them privately, and do not share the config.
Use storage that enforces Unix permissions if account isolation is required.

Persistent config/log path: `/userdata/system/configs/groovenet-brick/`. The
launcher overwrites `preview.log` at each launch, with a restrictive umask (subject to the firmware filesystem behavior above). The
application has no disk metadata/artwork cache and does not remember the player;
`XDG_CACHE_HOME` reserves `cache/` under that same directory for future use. No
player state is written to config. Never include real config or diagnostic logs
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
   and verify configuration persists. Player selection is not yet remembered.

Run `just brick-test`, `just brick-coverage` and `just lint-all` for changes.
Package checks inspect archive membership, ELF architecture/dependencies, license,
placeholder-only configuration and launcher behavior. Desktop/mock checks cannot
certify physical inputs, framebuffer restoration, speaker playback or Wi-Fi.
