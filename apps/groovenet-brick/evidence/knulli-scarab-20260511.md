# Knulli Scarab: first physical Brick session

Date: 2026-11-08 UTC (2026-11-07 Pacific). Operator: agent over USB ADB,
with display/launcher observations reported by the device owner. ADB was
Google Platform Tools 37.0.1-15733141, client 1.0.41. This is an
incomplete session, not a supported-release certification or a comparison with
NextUI. No image checksum was available for the installed card.

## Device and artifact

- `knulli-version`: `scarab 2026/05/11 21:44`.
- `/etc/os-release`: Batocera.linux 42; Buildroot `2024.11`; `OS_NAME=knulli`,
  `OS_DATE=20260511`, empty `OS_VERSION`.
- Kernel: `Linux KNULLI 4.9.191 #535 SMP PREEMPT Wed Oct 9 07:30:02 UTC 2024 aarch64`.
- glibc `2.40`; loader `/lib/ld-linux-aarch64.so.1`; libstdc++ `6.0.32`.
- SDL runtime `2.32.8`, `mali` video driver (reported by the running probe).
- libcurl `8.12.1`, OpenSSL `3.4.0`, zlib `1.3.1`, zstd `1.5.7`,
  nghttp2 `1.64.0`, librtmp `2.3` (runtime `curl_version()` output).
- libpng runtime file `libpng16.so.16.47.0`; compiled headers `1.6.39`.
  The probe's `png=` log is the header version, not the linked library version.
- Main source SHA-256:
  `f59c65857373550213bce9ab31553127a0ef707fc06672133c32dcd747b6e8a2`.
- Executable SHA-256:
  `12c4dd19a7a1419f492d968adb516c2c624d536afcb1935ea2ad3342b7595d43`;
  size 78,528 bytes. Source is unchanged from the initial PR probe implementation.

## Actual Linux build

This was an arm64 Linux build inside Docker on the Mac, **not a Knulli SDK build**.
The Debian runtime dependencies are older than those installed on this Brick.
The loader resolved all dependencies and the executable rendered on the device;
that is evidence for this artifact/release combination only.

Base image: `debian:bookworm-slim`, resolved to
`debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`.
Compiler: GCC/G++ 12.2.0 (`12.2.0-14+deb12u1`), triple `aarch64-linux-gnu`.
CMake `3.25.1-1`; pkg-config `1.8.1`. Development packages:
`libsdl2-dev=2.26.5+dfsg-1`, `libcurl4-openssl-dev=7.88.1-10+deb12u15`,
`libpng-dev=1.6.39-2+deb12u6`.

From the repository root:

```sh
mkdir -p /tmp/brick-device-build
docker run --rm --platform linux/arm64 \
  -v "$PWD/apps/groovenet-brick/probe:/src:ro" \
  -v /tmp/brick-device-build:/build \
  debian@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc \
  sh -c 'apt-get update -qq && apt-get install -y -qq --no-install-recommends build-essential cmake pkg-config libsdl2-dev libcurl4-openssl-dev libpng-dev ca-certificates && cmake -S /src -B /build -DBUILD_TESTING=OFF -DCMAKE_BUILD_TYPE=Release && cmake --build /build'
```

The original run used the tag that resolved to this digest. Apt packages remain
repository-resolved; record the versions above and compare them on reproduction.
This is not a fully frozen package snapshot or a reproducible production SDK.

`readelf` lists direct dependencies SDL2, curl, png16, libstdc++, libgcc_s, libc.
On-device `ldd` resolved those and libm, nghttp2, rtmp, ssl/crypto, zstd, z,
libatomic, gnutls, hogweed, nettle, gmp, unistring and tasn1. It emitted:

```text
/usr/lib/libcurl.so.4: no version information available (required by brick-probe)
```

This warning remains an ABI/toolchain risk. Do not hide it or distribute this
experimental artifact as a supported firmware package. Validate against a pinned
firmware SDK before releases.

## Installed entry and first launch

Dedicated directory: `/userdata/system/groovenet-brick-probe-1095`.
Ports entry: `/userdata/roms/ports/Groovenet Probe.sh`, mode 755, selected manually
from the Knulli launcher. No system libraries, firmware, startup hooks, governor
or power services were changed. The launcher changes into that directory, invokes
the binary with explicit paths, and appends output to `probe.log`.

Artwork fixture: repository `site/public/apple-touch-icon.png` (PNG), SHA-256
`84ab09d8accfe16f3f4ae80ee6f347eb8982e158630af8edebbc0ff7ae5f3aba`.
This tests decoding an actual asset, not arbitrary JPEG/WebP cover compatibility.

Selected first-launch log (terminal escape sequences removed):

```text
4ms launch_count=1
4ms SDL=2.32.8 video=mali
MALI_CreateWindow:... done.
182ms curl=libcurl/8.12.1 OpenSSL/3.4.0 zlib/1.3.1 zstd/1.5.7 nghttp2/1.64.0 librtmp/2.3 png=1.6.39
187ms connect
218ms first_frame
487ms connection ended curl_code=22
...
120037ms clean_exit
```

The owner reported: “Launched; image and corners look correct.” The 218 ms value
starts **after SDL initialization**. It is a single instrumented observation;
there is no tap-to-frame measurement, distribution, camera recording, cold-boot
sample or wake latency measurement. `clean_exit` proves orderly process cleanup;
manual confirmation of launcher restoration remains separate.

The first run used a non-secret placeholder key: HTTP authentication failed as
expected and was retried. It is not SSE success evidence.

## Trust, clock, authentication

The device resolved the configured development Groovenet hostname over Wi-Fi.
UTC was current within the Caddy root/server certificate validity period; NTP
configuration and cold-boot clock recovery have not been tested.

- Device curl with its default trust store: error 60, unable to get local issuer;
  `HTTP 000`, TLS verify result `20`.
- With the exported **public Caddy root certificate** supplied through `--cacert`:
  `HTTP 401`, TLS verify result `0`, total request time `0.080208 s`.
- Thus explicit application CA configuration is needed on this installation.
  Certificate verification was never disabled; no root was installed globally.
- The API requires `PLAYER_API_KEY` independently of browser access. The key was
  retrieved from the owner's specified secret reference without printing it.
  Authenticated discovery from the Mac found Lounge, Aswitch and Oficina.
- After explicit owner approval, the temporary device token file was updated
  with mode 600 and the next launch was set to observe Lounge's named SSE stream.
  No playback or configuration API requests were made.

On the second physical launch, the first frame was logged at 211 ms and an
authenticated named-player `snapshot` at 452 ms. The planned stream rotation
ended at 30,186 ms (`curl_code=28`); reconnect at 31,190 ms delivered another
snapshot at 31,246 ms. A third launch logged first frame at 212 ms and snapshot
at 477 ms. These are SSE framing observations, not a validation of application
JSON or a changing Now Playing UI. The display remains a static fixture.

The counter advanced to 2 and 3 across launches. After the owner asked how to
close the second run, SIGTERM produced `clean_exit`; the owner confirmed it
closed. Menu is observed as input, with no app-level quit mapping; a standalone
client must implement its own exit action. The generic probe intentionally
avoids guessing firmware button IDs.

Physical presses emitted joystick axis events (`1536`) and down/up events
(`1539`/`1540`) with button IDs 4 through 16. The exact button-to-ID mapping,
axis values and which controls are intercepted are not yet fully established;
do not derive production mappings from the order of this exploratory log.

### Wi-Fi outage and recovery

During the third run, `wlan0` was taken down for 20 seconds over USB ADB and
brought up with an exit trap. Device boot-time readings were 150861.45 before,
150861.56 after link-down and 150881.59 after link-up. **Link-up did not restore
association/IP automatically.** ConnMan showed disconnected, and scan/enable
alone did not recover the saved service. Restarting the existing
`/etc/init.d/S08connman` service with its unchanged saved configuration restored
Wi-Fi; the same IP and ConnMan `online` state were confirmed at boot-time
151009.19. No Wi-Fi credentials were read or changed.

The probe stayed running and retried throughout. Selected elapsed log:

```text
30201ms connection ended curl_code=28
31206ms connect
46209ms connection ended curl_code=28
...
190523ms connection ended curl_code=28
191530ms connect
197256ms sse event= snapshot
221548ms connection ended curl_code=28
222553ms connect
222608ms sse event= snapshot
```

An independent authenticated Python HTTPS request from the Brick also received
HTTP 200, `text/event-stream`, `event: snapshot` after recovery. No native
relaunch was necessary. This establishes eventual application reconnect **after
firmware network recovery**, not automatic recovery from arbitrary AP loss.
The low-level interface reset is harsher/different from simply losing access
point coverage, and recovery required operator intervention; that risk remains
open. There is no synchronized recovery latency or changing-track freshness
measurement. No playback commands were sent; uninterrupted playback was not
independently measured.

### Menu and power observation

The owner reported that Menu displayed no overlay, and that the probe's display
returned after short Power/off/wake. The third-run log contained no new SDL
input events during that Menu/Power observation. Do not reuse unverified button
IDs from another run as a quit or suspend mapping.

A sidecar sampled `CLOCK_MONOTONIC`, `CLOCK_BOOTTIME` and wall time once per
second, without modifying power settings. The synchronized repeat captured 91 samples over 98.485198 seconds. The largest
sampling gap was 9.403242 seconds; `BOOTTIME - MONOTONIC` increased by 1.196243
seconds. Kernel logs independently reported `Suspended for 1.196 seconds`, plus
suspend/resume device phases. Thus this was actual suspend, not merely a dark
screen. It is only a short USB-connected observation, not ten seconds of deep
sleep or a long unplugged suspend test.

Selected corroborating kernel lines:

```text
PM: suspend of devices complete after 1017.597 msecs
PM: noirq suspend of devices complete after 2034.057 msecs
PM: Device usb1 failed to resume async: error -107
Suspended for 1.196 seconds
PM: resume of devices complete after 584.565 msecs
PM: suspend exit 2026-11-08 01:08:29.590196150 UTC
```

ADB was usable afterward despite the USB resume warning. That warning and the
short suspend duration are limitations requiring longer unplugged testing.
The repeated Power presses emitted keycode `1073741926` (`SDLK_POWER`) at
319,243 ms and 328,899 ms. A new snapshot arrived at 346,701 ms: about 17.802
seconds after the logged wake key, via normal periodic rotation. There was no
camera-synchronized physical wake-input or visible-frame timing, and the
snapshot's application JSON was not evaluated. The production client must
request fresh state on wake instead of relying on periodic stream rotation.

The firmware provided suspend and display restoration without app power calls.
`/etc/init.d/S96idlewatcher-daemon` starts `/usr/bin/idlewatcher` for configurable
system idle policy; the exact short-Power event owner was not identified. Menu
still needs an explicit app quit action; physical volume behavior and the full
button map remain unqualified.

Wrong-hostname/incorrect-clock tests, long unplugged suspend, repeated
wake-to-fresh measurements and full button/volume mapping remain pending.

### Optional direct launch and cleanup

The installed `/etc/init.d/S00bootcustom` invokes `/boot/boot-custom.sh` when
present. This is a possible no-fork integration point, **not a tested direct-boot
recipe**. It runs early; a launcher must wait for userdata, display, power and
network services and avoid competing with EmulationStation. No startup hook was
created or changed in this experiment.

After the owner completed the short test, the probe received SIGTERM and logged
`405794ms clean_exit`. Its process exit was verified. The temporary Ports entry,
device token and temporary helper scripts were removed; local token/header files
were removed too. The public CA, executable, artwork, counter and diagnostic logs
remain in the dedicated userdata directory for follow-up, with no stored probe
credential. ConnMan was confirmed `online` after cleanup. Other Ports/apps were
unchanged. Credentials and private raw responses
must never be included in this evidence directory.

## Resource sample and limits

One snapshot during the first 120-second launch, around 65.6 seconds after SDL
initialization: RSS/high-water 20,564 kB, one thread; `/proc/<pid>/stat` user/system
CPU ticks were `140`/`246`, with `CLK_TCK=100`. Approximately 3.86 seconds of CPU
over that launch prefix is about 5.9% of one core, including initialization and
repeated 401 reconnects. This is **not steady-state authenticated idle CPU**.
Governor: `schedutil`. Rendering: up to 20 Hz. Device was USB-connected and
charging at reported 85%; no unplugged idle/battery result can be inferred.

A second 23.77-second sample during the authenticated run showed CPU ticks
increasing from 135+210 to 177+298 (130 ticks at 100 Hz), about 5.47% of one
core. RSS stayed at 20,480 kB, one thread. Button presses occurred during this
interval, so it is a short interactive sample, not five-minute idle evidence.

Three instrumented first-frame samples were 218, 211 and 212 ms (median 212 ms,
worst 218 ms). They exclude launcher/loader/SDL initialization and are not
end-to-end launch latency.

The owner selected Knulli Scarab 2026/05/11 as the v1 implementation target after
reviewing these results, and explicitly left NextUI pending. Remaining checks:
full button/volume map; reboot persistence; normal AP/range-loss recovery; longer
unplugged suspend and battery observation; camera-timed launch/wake freshness;
five-minute idle CPU/RSS; exact short-Power owner; pinned firmware SDK; optional
direct boot. NextUI has no physical evidence and no v1 support commitment.
