# Knulli application preview — #1107

Session: 2026-11-08 UTC / 2026-11-07 Pacific. Physical target is the same owner's
TrimUI Brick as #1095, running Knulli Scarab `2026/05/11 21:44` (Buildroot
2024.11, glibc 2.40, aarch64 Linux 4.9.191). Installed-card image checksum remains
unavailable. This record separates actual device checks from pending observations.

## Build and artifact

Run `just brick-package`. See [install/build instructions](../knulli/README.md).
The local copyable artifact is
`apps/groovenet-brick/build-knulli/groovenet-brick-knulli-preview.tar.gz` with a
SHA-256 sidecar. Build output is ignored rather than committed as a binary blob.
The archive includes its source/build manifest, binary/font hashes and font license.

Build baseline: Debian image
`sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`,
ARM64, frozen Debian + Debian-security snapshot `20261107T000000Z`; GCC
`12.2.0-14+deb12u1`, `aarch64-linux-gnu`, CMake `3.25.1-1`, SDL2
`2.26.5+dfsg-1`, SDL_ttf `2.20.1+dfsg-2`, curl `7.88.1-10+deb12u15`, json-c
`0.16-2`, DejaVu font `2.37-6`. Complete package versions are inside `BUILD.txt`.
This is an experimental Debian ABI baseline, **not an official firmware SDK**.

Initial installed binary SHA-256:
`c54490510997fbb6dd14d67f7fa8bdec328385b934d0402b64cac1b33d6b211c`.
Initial archive SHA-256:
`cf1864dffd3c056ad1cdad6186dfe51abc722eefd3ad1188b57505fdf530c164`.
Final artifact hashes will be recorded after final verification/build.

## Device checks performed over USB ADB

- Installed the archive into `/userdata/roms/ports/`, with `Groovenet.sh` mode 755. No firmware/system libraries, autostart hooks, power service, network
  configuration or other Ports entries were changed.
- Provisioned a separate mode-600 private config and public CA under
  `/userdata/system/configs/groovenet-brick/` (directory mode 700). Player key
  came from the repository's established private secret reference; it was never
  printed or packaged. The local transient credential copy was removed. Collection
  credential is independently optional and was omitted in this session.
- Server origin `https://groovenet.home.arpa`, with the previously tested public
  Caddy root explicitly supplied. TLS verification remains enabled. **Lounge** is
  the player's deliberately chosen test target; no agent playback writes sent.
- On-device `ldd` resolved every direct/transitive dependency, including
  SDL2_ttf, SDL2, curl, json-c, libstdc++, glibc and font/TLS dependencies. Loader
  `/lib/ld-linux-aarch64.so.1`. Runtime SDL2 `2.32.8`, SDL_ttf file `2.24.0`,
  json-c file `5.3.0`, curl `8.12.1`, OpenSSL `3.4.0` (firmware/prior probe).
- The application emits the prior probe's warning:
  `/usr/lib/libcurl.so.4: no version information available`. Resolution alone
  does not establish full ABI compatibility; this remains a release limitation.
- Read `/usr/share/emulationstation/es_input.cfg` and `sdl2-jstest --list`:
  actual Brick GUID `030000005e0400008e02000014010000`, 17 buttons, two axes,
  one hat. SDL defaults to an incorrect Xbox mapping (`a:b0`, with b0 actually
  Linux local-volume keycode 114). The app overrides it using Scarab's own A/B,
  X/Y, shoulders, Start/Select and D-pad definitions. No guessed L3/R3 mapping is
  used. This is **firmware mapping evidence**, not yet physical press confirmation.

## Physical smoke results

Owner available and asked to launch from Ports and verify display/navigation.
Pending owner observations: application launch/orientation, D-pad, A/B,
Start/Select, Y, L/R, X+L/R, local volume, observational Lounge selection, external
track changes, actual server transport/volume, short Power/sleep/wake freshness,
and clean quit/continued playback. No desktop test is substituted for these.
Follow the exact [physical smoke steps](../knulli/README.md#physical-smoke-test-owner-observations-required).

The #1095 probe previously demonstrated short real suspend and display restoration;
those observations do not certify this application. Long unplugged suspend,
Wi-Fi/AP recovery, repeated wake-to-fresh timing, battery qualification and a
pinned Knulli SDK remain in #1102. Do not restart ConnMan or change firmware policy
as part of the preview. No full reliability or stable release claim is made.

## Automated validation

- `just brick-test`: three CTest suites passed (native behavior/resource failures,
  real loopback TLS/SSE fixture, isolated Ports launcher).
- `just brick-coverage`: Clang native coverage run; final results recorded below.
- `BRICK_ARCHIVE=... python3 apps/groovenet-brick/tests/test_package.py`: launcher
  behavior plus actual archive allowlist, AArch64 ELF, executable modes,
  placeholder-only config, font license and binary/font hashes passed.
- `just lint-all`: repository-wide pre-commit hooks passed; repeated after final edits.
