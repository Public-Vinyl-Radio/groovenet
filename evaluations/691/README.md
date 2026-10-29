# OwnTone validation (#691)

Part of [#651](https://github.com/Public-Vinyl-Radio/groovenet/issues/651).
Design review: [#688](https://github.com/Public-Vinyl-Radio/groovenet/pull/688).

Current scope: the user has deferred synchronized multi-room playback. Initial
backend delivery targets one selected speaker; multi-room checks below remain
follow-up work and must not be marked passed. Independent named queues remain
planned. The design PR has merged, and the single-output findings can inform
#692 while the remaining validation work stays open.

## Isolated API experiment

Run from a checkout on a machine with Docker, Bash, and Python 3:

```sh
bash evaluations/691/isolated-smoke.sh
```

The script uses the official OwnTone image pinned to the OCI index digest
`sha256:6a88589edc4dd9c438da62a18a25374d3e6e01457745f241a22baf88c43c9582`.
The selected linux/arm64 image reports **OwnTone 29.3**. The linux/amd64 image
also reports 29.3 on the Debian host. The image may need to
be downloaded before the network-isolated container starts.

Only the test configuration is mounted, read-only. The container has no
external network, published ports, audio devices, production files, or saved
credentials. It generates a two-second silent WAV and queues its loopback HTTP
URL without playing it. An EXIT trap removes the temporary container and its
writable layer; the downloaded image remains cached. No persistent volumes are
created. Run separate invocations to reproduce the experiment.

### Findings from initial manual execution (2026-10-24)

- The pinned image reports 29.3 on local OrbStack (Docker 29.8.2, linux/arm64).
- Starting only the engine fails with `mDNS init failed`. Starting its bundled
  D-Bus and Avahi first lets its HTTP API start even with external networking
  disabled. An actual deployment should use the official image entrypoint;
  this fixture bypasses it to keep initialization explicit and isolated.
- `/api/player` reports stopped with no current item. Its volume is **-1**
  with no outputs, so an adapter must handle an unknown engine volume rather
  than assume every response is within 0–100.
- `/api/outputs` returns an empty list, as expected in this fixture. This
  does not test discovery.
- Queueing unindexed `file:///tmp/fixture.wav` or `/file:/tmp/fixture.wav`
  through `POST /api/queue/items/add` returns HTTP 500. A read-only volume mount
  alone is therefore not a proven direct-file queue solution. The 29.3 source
  accepts `library:` identifiers or HTTP(S) in its filescanner queue handler.
- A loopback HTTP URL is accepted as one `data_kind: url` queue entry without
  starting playback. Initially it has unknown duration (`length_ms: 0`), so
  this does not prove seek, duration, format support during playback, or
  reliable natural-completion events.

The reproducible script passed on both local linux/arm64 and Debian
linux/amd64. A first transfer from macOS included AppleDouble metadata files;
the API assertions passed but the outer temporary-directory cleanup failed.
Those two metadata files were explicitly removed. Repeating the transfer with
`COPYFILE_DISABLE=1 tar --no-xattrs` passed with complete cleanup.

Do not interpret API queue acceptance as successful audio decoding or AirPlay
playback. The HTTP fixture is unauthenticated: authenticated/range-capable audio
delivery remains a separate validation gate.

## Debian discovery (2026-10-24)

SSH access works using `saegey@192.168.2.151`. The host is Debian 13.7 amd64,
Docker 29.9.1, Compose v5.6.0, with LAN interface `enp170s0`. Groovenet's audio
mount is the Docker volume `teststack_music_data` at `/app/audio` in the app.
Host Avahi and airptpd are inactive. No host packages were installed or
production services restarted.

Run discovery on the Debian host:

```sh
bash evaluations/691/discover.sh enp170s0
```

The disposable host-network container browses mDNS only on the supplied LAN
interface, with service publishing disabled, no audio mounts, no local output,
no autoplay, and a fresh database. It removes itself and its temporary
configuration afterward. Its API permits trusted localhost requests and uses a
random disposable admin password for other clients. The script verifies a LAN
request without credentials receives HTTP 401 before reading discovery results.
The downloaded image remains cached.

The first scan returned no outputs because `bind_address = "127.0.0.1"` also
restricts OwnTone's mDNS interface to loopback. Removing that restriction while
protecting non-loopback API requests discovered the target receivers:

| OwnTone output ID | Name              | Reported type | HA receiver entity              |
| ----------------- | ----------------- | ------------- | ------------------------------- |
| `202481599519404` | aswitch           | AirPlay 2     | `media_player.aswitch_streamer` |
| `202481586338774` | Lounge Room Audio | AirPlay 2     | `media_player.lounge_streamer`  |
| `132116595608304` | Bedroom           | AirPlay 2     | `media_player.bedroom_sonos`    |

These name-based mappings need hardware confirmation before being treated as
permanent identity bindings. All outputs remained unselected and the player
remained stopped. Other LAN receivers were also discovered but not selected.
After cleanup the container was absent, port 13689 was released, and existing
Groovenet containers remained healthy. Discovery does not prove streaming or
synchronization. The first authorized single-receiver test is recorded below.

### Home Assistant inspection

HA SSH access works; Core reports 2026.10.2. Its add-on supervisor token returns
HTTP 401 for `/core/api/states`, so current live entity states have not been
verified. HA MCP remains unavailable in the current tool set. The following
were verified read-only from the installed integration code and entity registry:

- `shairport_sync` 1.4.0 is installed for `aswitch/shairport` and
  `pi-cam/shairport`. The Bedroom entity uses the Sonos integration.
- Custom `living_room_audio` 1.0.2 and `lounge_audio` 1.0.0 combine Shairport
  receiver state with vinyl-activity and Groovenet metadata sensors.
- Their `source` property distinguishes **Shairport** from **Vinyl**, not one
  AirPlay sending app from another. They prefer playing/buffering Shairport;
  paused Shairport yields to active vinyl.
- A room playing vinyl may therefore need occupancy protection even when its
  AirPlay receiver is idle. The design should separate receiver availability
  from room listening activity; raw receiver state alone misses this case.

## Lounge receiver test (2026-10-24)

The user authorized a brief low-volume test on **Lounge Room Audio only**.
Read-only SSH to `saegey@pi-cam.local` confirmed the AirPlay 2 Shairport and
NQPTP units were active. Immediately before the test, native D-Bus `Active`
was false and MPRIS `PlaybackStatus` was Stopped.

The explicit opt-in command is:

```sh
# Check room occupancy and obtain a test window before running this mode.
bash evaluations/691/discover.sh enp170s0 --play-lounge
```

This mode generates a 12-second 440 Hz WAV, approximately -44 dBFS peak, in the
container's empty watched library. The receiver's managed configuration ignores
AirPlay volume commands, so the audio itself is attenuated. The script also
requests engine output volume 5, but that is not proof of receiver attenuation.
No real library tracks or API credentials are used. Only output ID
`202481586338774` is selected; the fresh engine has no other selected outputs.

Observed results:

- The generated file was indexed as `library:track:1`, with WAV stereo audio at
  44.1 kHz and `length_ms: 12000`. This proves an indexed-file path; direct
  unindexed-file loading remains unsupported by the tested endpoint.
- OwnTone remained in play state with position 1790 ms after four wall-clock
  seconds, consistent with startup buffering. This is one observation, not a
  latency benchmark.
- The Pi independently reported `Active: true` and MPRIS Playing during the
  test, establishing receiver-side activity rather than engine status alone.
- OwnTone reported pause at 1860 ms; an absolute seek to 8000 ms and resume
  were accepted. Seven seconds later it reported stop with no current item.
  Audible pause behavior and seek accuracy have not been confirmed.
- Cleanup stopped the fixture, deselected its outputs, and removed the
  container. Port 13689 was released. The Pi then reported `Active: false`
  and MPRIS Stopped.
- Receiver logs during the window included ALSA XRUN recovery and clock/latency
  changes. Their effect on audible quality is unverified; do not mark audio
  quality or synchronization as passed.

The user did not hear the first faint replay. Subsequent diagnosis confirmed
the live receiver configuration routes directly to `plughw:CARD=ZD3,DEV=0`,
uses 44.1 kHz S32_LE, and ignores AirPlay volume control. With the user confirming
the ZD3 and amp were powered and ready, an eight-second direct USB tone at
approximately -30 dBFS peak was heard. This bypassed OwnTone and AirPlay and
established that the hardware output path could produce audible sound.

The AirPlay comparison then used the same generated level, a 20-second file,
an eight-second initial observation, two seconds paused, a seek to 14 seconds,
and resume. All engine assertions passed. During streaming the Pi reported:

- DAC PCM state RUNNING, S32_LE, stereo, 44.1 kHz.
- AirPlay client address `192.168.2.151`, matching the Debian host.
- OwnTone play position 5810 ms after eight wall-clock seconds and pause at
  5870 ms, followed by stop after seek/resume and completion.

The user confirmed this AirPlay tone **sounded fine, quiet but audible**. This
validates audible single-receiver playback at the generated test level; it
does not establish audible seek accuracy or effective receiver volume control.
The current opt-in script reproduces this longer -30 dBFS comparison; the
12-second/-44 dBFS measurements above describe the earlier run.

This is not a completed Groovenet-authenticated audio, multi-room, concurrency,
or interruption test. Earlier receiver underrun/timing logs remain an observation
to investigate if they recur or correlate with audible glitches.

### Additional sender-observation opportunity

The Pi exposes `org.gnome.ShairportSync.Active` and
`org.gnome.ShairportSync.RemoteControl.Client` through the system bus at
`/org/gnome/ShairportSync`, service `org.gnome.ShairportSync`. The latter reported
`192.168.2.151` after this test; `ClientName` was empty. This may support sender
correlation more directly than the current HA wrappers. The client address
remains populated after Active becomes false, so it must be gated by active
session state. Behavior during takeover, IPv6 address selection, and multiple
OwnTone instances on the same host still needs validation: an address alone
cannot distinguish those engine instances.

## Next: audio and hardware validation

### Read-only real-file delivery check

The no-playback experiment `indexed-file-smoke.sh` was run on Debian against
one regular file, `1004089-A1.m4a`, from the existing `teststack_music_data`
volume. Hidden macOS metadata files were excluded when selecting the sample.
Only that file was bind-mounted read-only into a fresh, network-isolated
OwnTone container; the full 4,116-file directory was not indexed or copied.

```sh
bash evaluations/691/indexed-file-smoke.sh teststack_music_data 1004089-A1.m4a
```

OwnTone indexed the file, returned `library:track:1`, duration 218197 ms, M4A,
44.1 kHz stereo, and accepted it into the queue as `data_kind: file`. FFmpeg
decoded the first five seconds to a null sink. The player stayed stopped and
had no outputs. The fixture and temporary transfer files were removed.
The first harness attempt used an unsupported GET route; the successful
reproduction uses the documented track-search endpoint.

This proves indexed read-only delivery for one real library file and avoids
the `/api/audio` bearer-header problem entirely for that path. Prefer evaluating
this option for the initial server deployment before building a token relay.
It does not yet prove the full production library scan cost, all audio formats,
filename/path safety, index refresh after downloads/deletes, stable mapping
from Groovenet track references to engine track IDs, or real-track AirPlay
playback. Keep OwnTone's metadata index an implementation detail; Groovenet
remains the authority for library records and logical queues.

The harness requires a pre-existing volume, validates a simple relative audio
basename, mounts it read-only, and creates no persistent Docker volumes. It
uses no Groovenet credentials, network, speaker selection, or audible output.

1. Inspect the Debian release, Docker architecture/version, existing services,
   occupied ports, audio mount paths, and mDNS/timing daemons. Do not dump
   rendered environment/config files containing credentials into reports.
2. Inspect live HA states and integration versions for both Pis and Sonos.
   Record whether source/session identity is available, and distinguish an
   initial default idle state from an observed receiver event.
3. Prepare one disposable instance with a fresh database and read-only audio
   access. Review its configuration before launch: official image defaults
   trust any network, so replace that default and restrict control access.
   Use an empty test library initially rather than scanning production audio.
4. Verify discovery before choosing outputs. Record speaker state and check
   that an existing session will not be interrupted before playback tests.
5. Test a representative downloaded track through authenticated HTTP delivery
   (or prove indexed read-only library mapping), including range/seek and end
   detection. Do not embed the global API key in URLs or logs.
6. Test each receiver, all three synchronized, adding/removing outputs, pause,
   seek, volume, disconnects, and external-source interruptions in both
   directions. Record observed behavior, not only intended policy.
7. Add the second isolated engine. Follow upstream multiple-instance guidance
   on identities, databases, ports, and shared airptpd timing. Test independent
   queues on disjoint outputs and explicit speaker transfer.
8. Stop and remove only the prototype services. Confirm existing playback and
   Groovenet services are unchanged. Keep production deployment separate from
   this experiment.

Record hardware results here with engine/image versions, receiver software,
network mode, commands, expected/actual behavior, and cleanup evidence. Beyond
the single Lounge test above, hardware checks remain pending.

## Upstream references

- [Official container](https://github.com/owntone/owntone-container)
- [29.3 API](https://github.com/owntone/owntone-server/blob/29.3/docs/json-api.md)
- [29.3 file/stream queue handler](https://github.com/owntone/owntone-server/blob/29.3/src/library/filescanner.c)
- [29.3 configuration](https://github.com/owntone/owntone-server/blob/29.3/owntone.conf.in)
- [Multiple instances and airptpd](https://owntone.github.io/owntone-server/advanced/multiple-instances/)

OwnTone includes the GPL version 2 license; image build dependencies have their
own licenses. Deployment packaging/license inventory remains to be recorded.
