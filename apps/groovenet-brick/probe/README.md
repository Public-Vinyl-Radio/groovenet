# Brick lifecycle probe (#1095)

This is a disposable C++17/SDL2 observer, not the remote application. It makes
only an authenticated GET to a named player's SSE endpoint; closing, sleeping
or losing Wi-Fi cannot send a playback command. Reusable pieces are the CMake
native target and bounded SSE framing; the application foundation remains #1096
and the production reconnect/state client remains #1097.

**Device validation is pending. No firmware version is supported yet.** See
[the evidence and decision record](../PLATFORM-SPIKE.md) before implementing
firmware adapters. Desktop tests do not demonstrate Brick compatibility.

## Build and test on a desktop

Dependencies: CMake >= 3.20, a C++17 compiler, pkg-config, SDL2 >= 2.0.18 (for
`SDL_GetTicks64`), libcurl with HTTPS, libpng with the simplified read API,
Python 3 and OpenSSL for tests. The probe decodes PNG only; JPEG/WebP and remote
artwork fetching belong to the application and remain pending compatibility
checks. Convert one representative cover to PNG for this experiment.

On Debian/Ubuntu install `cmake clang llvm pkg-config libsdl2-dev libcurl4-openssl-dev
libpng-dev python3 openssl`. macOS equivalents are `cmake pkg-config sdl2 libpng`
from Homebrew, Xcode command-line tools and the system libcurl.

```sh
cmake -S apps/groovenet-brick/probe -B /tmp/brick-probe -DCMAKE_CXX_COMPILER=clang++ -DPROBE_COVERAGE=ON
cmake --build /tmp/brick-probe
LLVM_PROFILE_FILE='/tmp/brick-probe/probe-%p.profraw' python3 apps/groovenet-brick/probe/test_probe.py /tmp/brick-probe/brick-probe
llvm-profdata merge -sparse /tmp/brick-probe/*.profraw -o /tmp/brick-probe/coverage.profdata
llvm-cov report /tmp/brick-probe/brick-probe -object=/tmp/brick-probe/probe-input-test -ignore-filename-regex=test_input.cpp -instr-profile=/tmp/brick-probe/coverage.profdata
llvm-cov export -format=lcov /tmp/brick-probe/brick-probe -object=/tmp/brick-probe/probe-input-test -ignore-filename-regex=test_input.cpp -instr-profile=/tmp/brick-probe/coverage.profdata > /tmp/brick-probe/coverage.lcov
```

On macOS use `xcrun llvm-profdata` and `xcrun llvm-cov` with AppleClang.
Tests use SDL's dummy video driver and a temporary self-signed local HTTPS
server. They check framing across writes, reconnect, persistence, authentication,
CA failure, invalid arguments, artwork errors and signal shutdown. They never
contact a Groovenet deployment. Coverage is also uploaded by the Brick probe CI.

## Interactive run

Create a token file containing a development `PLAYER_API_KEY` (one line), a PEM
CA bundle that validates the development server, and an artwork PNG. Keep those
files outside the checkout. Restrict the token file to the current user with
`chmod 600`. Use a named player that already exists; the probe never creates one.

```sh
/tmp/brick-probe/brick-probe https://groovenet.dev/api/players/lounge/events /absolute/path/player-token /absolute/path/ca.pem /absolute/path/cover.png /absolute/path/launch-counter 600
```

All paths are explicit so the same binary can be tested with firmware-specific
storage paths. The counter is the persistence experiment, not application
configuration. Each launch increments it before rendering. Remove it to reset.
Do not share credentials or commit local configuration. Logs omit the token,
URL and SSE data; they record event names and timing, so use a trusted endpoint.

Expected display: red top-left, green top-right, blue bottom-left, square cover
in the centre. No font dependency. Output is flushed with elapsed SDL milliseconds:
`first_frame`, `connect`, `sse event= snapshot`, input event types and numeric
key/joystick button values, and `clean_exit`. Escape/window close, SIGTERM/SIGINT,
or the duration (1–86400 seconds) exits. Unmapped physical menu buttons are logged;
use the duration or SSH SIGTERM if no quit mapping is available. Return to the
launcher is a manual check even after `clean_exit`.

TLS certificate and hostname checks remain enabled; there is no insecure mode,
redirect following, or persisted key. A missing/incorrect CA or clock causes
connection errors. HTTP 401/403 is a failure, not a valid stream. Network errors
are logged as libcurl result codes; a rendered screen and zero exit status only
mean the observer finished, not that networking succeeded. Require an observed
`snapshot` event and independently confirm its state before accepting a run.

The probe retries completed/failed connections after one second. The connection
limit is five seconds, low-speed timeout fifteen seconds, and each stream rotates
after thirty seconds to request a new snapshot even when no SDL wake notification
arrives. This is an experiment, not the final wake policy or a freshness SLA.
It logs SSE framing without validating JSON, worker identity or revisions. Compare
the server's actual state from another controller to establish freshness. Rendering
runs at up to 20 Hz with a 50 ms delay; record this when interpreting idle CPU/battery.

## Cross-build and launch (not yet device verified)

Use a **separate SDK/sysroot and build directory for each firmware release**.
Do not copy the macOS executable to the Brick or infer compatibility from CPU
architecture. Pin the SDK source commit and container digest before building.
Record the compiler triple, libc, dynamic loader and all dependency versions.
Do not use host pkg-config search paths while cross-compiling.

With the chosen SDK's CMake toolchain file and target-only pkg-config wrapper:

```sh
cmake -S apps/groovenet-brick/probe -B /tmp/brick-target -DCMAKE_TOOLCHAIN_FILE=/absolute/path/sdk-toolchain.cmake -DPKG_CONFIG_EXECUTABLE=/absolute/path/target-pkg-config -DPROBE_COVERAGE=OFF
cmake --build /tmp/brick-target
file /tmp/brick-target/brick-probe
readelf -h -l -d /tmp/brick-target/brick-probe
```

These are parameterized steps, not a verified SDK recipe. Stop if dependencies
are absent from the target sysroot. Supply them in the matching SDK, without
replacing firmware system libraries. `ldd ./brick-probe` on the device must resolve
all libraries before launch. Record SDK paths/commands and binary SHA-256 in the
run record; exact working SDK pins and library lists remain pending hardware work.

For NextUI, upstream documents a tool Pak at
`Tools/tg5040/Groovenet Probe.pak/launch.sh` on the SD card. Put the matching
binary, artwork and CA beside the script; store the token and counter in a
persistent user directory. A minimal launcher, after filling the paths, is:

```sh
#!/bin/sh
cd "$(dirname "$0")" || exit 1
./brick-probe https://groovenet.dev/api/players/lounge/events /absolute/userdata/player-token ./ca.pem ./cover.png /absolute/userdata/launch-counter 600 > /absolute/userdata/brick-probe.log 2>&1
```

Make the script and binary executable, launch from Tools, and verify return to
Tools on exit. Do not install into `.system/`, which updates replace. Capture the
inherited library/video environment rather than guessing overrides.

For Knulli, first transfer to a dedicated persistent directory under `/userdata`
and validate libraries over SSH. Launch through a Ports shell entry using that
same script with absolute paths, after confirming the installed release's Ports
launch convention. Record the actual Ports entry location and launcher environment
in the run record. An SSH-only renderer test does not prove launcher handoff;
SDL may need the display context supplied by the launcher. Exact Knulli Ports
packaging is pending a run on the user's installed release.

Neither launcher changes power settings or calls suspend APIs. Observe firmware
behavior first. Do not add raw power-device writes or a second power daemon until
ownership is established. Optional direct boot should be a reversible user startup
hook that calls the same launcher, with a recovery path back to firmware menus;
no firmware fork or replacement init is proposed. Hook support is still pending.
