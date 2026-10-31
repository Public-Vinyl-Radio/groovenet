# macOS Now Playing companion — issue #680

## Status and setup

This is an opt-in Swift companion for an already running local Groovenet daemon.
Local daemon and named remote-player connections are supported. The
socket/lifecycle prototype is working, and the user reports the remote-player
integration works except for the intentionally unsupported volume controls.
Individual physical media-key and Control Center checks still need the detailed
manual acceptance results below. Do not
treat a passing build or socket test as evidence of system media-key eligibility.

The deployment target is macOS 13 or later, on the architecture used to build it
(Apple Silicon or Intel). Building requires Swift 5.9 or later and a macOS SDK
from Xcode or Xcode Command Line Tools. Only macOS 27.0.1 / arm64 has been tested
locally so far; the macOS 14 CI job exercises compilation and Swift tests, not
physical media controls. Earlier supported systems and Intel need validation.

After installing `@groovenet/player` (also a dependency of the CLI):

```sh
groovenet-now-playing --build
groovenet player start --detach
# Add downloaded tracks through the CLI/TUI, then:
groovenet-now-playing
```

From a checkout, substitute
`packages/groovenet-player/scripts/now-playing.sh` for `groovenet-now-playing`.
The helper itself does not need built Node workspaces. Use `--socket PATH` to
connect to an isolated daemon; the default is `~/.groovenet/player/player.sock`.
Run in the current user's local graphical login session.

For a remote player, use its explicit ID instead of starting a local daemon:

```sh
groovenet-now-playing --remote lounge
# Checkout equivalent:
packages/groovenet-player/scripts/now-playing.sh --remote lounge
```

Use the same ID as `groovenet player --remote lounge`. Selecting a target in the
TUI does not change the companion's target. `--remote` and `--socket` are mutually
exclusive. The remote mode reads `api_base`, `api_key`, `player_api_key`, and
`insecure_tls` from the existing CLI configuration; `PLAYER_API_KEY` overrides
`player_api_key`, exactly as for CLI remote commands. Run it in the same shell
environment used for remote playback if credentials are injected there. Never
put the player key in the command arguments. No local daemon is required.

From a checkout, build contracts → client → player before using remote mode;
published npm packages already include the Node build. The Swift app does not
need rebuilding for changes to the remote adapter.

`--build` compiles a release executable, creates
`macos/.build/Groovenet Now Playing.app`, and ad-hoc signs that bundle. It does
not start the helper. The package directory must be writable for this local
build. No developer certificate, notarization, native Node addon, or third-party
Swift package is required. Rebuild explicitly after upgrading the npm package
or changing architectures. A missing helper gives the build command; a missing
Swift toolchain gives installation instructions.

Nothing runs during npm installation and no integration starts automatically.
Ordinary CLI/headless installation, including `--omit=optional`, does not need
Swift, Xcode, MediaPlayer bindings, or a GUI session. The shell launcher is a
separate npm bin and is not imported by the daemon or TUI.

Ctrl-C or SIGTERM clears the helper's Now Playing state and closes its socket.
The daemon, queue, audio output, and playback remain owned by Groovenet.
After daemon disconnection the helper clears metadata and exits with an error;
restart it after restarting the daemon. It does not reconnect or start a daemon.
One companion per user is enforced by an advisory lock in the private player
directory, released automatically on process exit. Do not delete its lock file
while a companion is running.

## Design and evaluated approaches

The chosen implementation candidate is a Swift executable in a minimal accessory
app bundle (`LSUIElement`, no windows, Dock icon, or menu). The bundle gives a
stable identity, `radio.publicvinyl.groovenet.nowplaying`; `NSApplication.run()`
provides the main AppKit run loop. The launcher executes the bundled executable
in the foreground so signals and errors remain visible. The prototype confirmed
bundle launch, daemon connectivity, duplicate rejection, signal shutdown and
disconnect shutdown. It has **not** yet established whether a bundle is strictly
necessary, or whether its identity is sufficient for reliable media-key routing
when mpv in another process produces the audio. That is the remaining feasibility
gate, not an assumption to hide behind unit tests.

Alternatives evaluated during design:

- A bare Swift command-line executable would remove the bundle, but its Now
  Playing identity and unfocused remote-command delivery are unproven. The
  production launcher requires the bundle; compare both forms during the manual
  prototype test before finalizing this choice.
- A Node native binding would couple native framework lifecycle and ABI/build
  concerns to Node. Swift uses the public frameworks directly and keeps native
  tooling optional.
- A Node socket bridge plus Swift subprocess would reuse `PlayerControlClient`,
  but add a second framing protocol and process lifecycle. Direct Swift socket
  support duplicates only the small version-1 protocol subset being consumed.
- Electron or another full desktop runtime is disproportionate to a windowless
  companion. Private MediaRemote APIs, Accessibility/global key interception and
  artificial audio playback are outside scope.

Remote mode deliberately uses a small Node adapter so it can reuse the existing
`GroovenetClient`, `ServerPlayerSession`, configuration and TLS/authentication
handling instead of duplicating the authenticated remote protocol in Swift. It
observes the named player's HTTP/SSE API, exposes a private temporary local
socket to the same Swift helper, and forwards only transport commands with the
latest revision. It does not start a local daemon, transfer outputs, copy queues,
replay failed commands, or automatically acknowledge speaker takeover. Any
required speaker acknowledgement must be handled explicitly in the normal CLI.
Closing the adapter only closes observations; server playback continues.

The shared session fences stale position events by worker, sequence, revision
and current entry. Remote queue titles/artists are immediately available; album
metadata is hydrated through the collection API when that credential permits
it, with an empty album as a fallback. Position ticks do not refetch metadata.
Remote checkpoint states are shown as stopped. A lost remote stream closes the
helper connection, clears Now Playing and exits; rerun the command to attach
again. There is no automatic fallback to local playback.

Public APIs are
[`MPNowPlayingInfoCenter`](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter)
and
[`MPRemoteCommandCenter`](https://developer.apple.com/documentation/mediaplayer/mpremotecommandcenter).
The helper sets both metadata and the macOS
[`playbackState`](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter/playbackstate)
property explicitly. Apple documents that failing to update playback state may
prevent remote controls from working as expected. AppKit's
[`accessory` activation policy](https://developer.apple.com/documentation/appkit/nsapplication/activationpolicy-swift.enum/accessory)
corresponds to `LSUIElement`.

`NowPlayingCore` holds the reusable daemon session, playback models, native
metadata mapping and Unix transport. A future SwiftUI desktop client can reuse
these without adopting the windowless app's startup code. There is no queue or
audio engine in the helper.

The session sends `status` on connection and consumes automatic `state`
notifications on the same socket. No subscribe RPC exists. Events arriving
before the initial response take precedence over that potentially older
snapshot. Separate track/position events are ignored to avoid duplicate updates.
Requests and responses validate protocol version 1. UTF-8 framing handles split
and combined messages and bounds individual frames to 8 MiB; larger queues fail
with an actionable error rather than grow memory without limit.

Title, artist, album, elapsed time and known duration map to MediaPlayer keys.
Both APIs use **seconds**. Unknown duration is omitted, playing uses rate 1, and
paused/loading use rate 0. Stopped/ended/error/disconnected states clear metadata.
Play while paused sends `resume`; otherwise play sends `play`. Pause, toggle,
next and previous use the existing daemon RPCs. Unsupported controls, including
scrubbing/seeking, are disabled. Native callback success means the RPC was
accepted for delivery; asynchronous daemon failures are logged without
optimistically changing displayed playback state. A five-second RPC timeout or
broken connection terminates the companion; a command-level daemon error is
reported without terminating the session.

The OS decides which app receives media commands. This integration cannot promise
exclusive ownership when another media application becomes active. Headset
buttons also depend on the device's mapping; volume buttons remain system-owned.
Artwork, seeking, automatic login startup, reconnection and a graphical player
are deferred. Distributed prebuilt/notarized universal app bundles are a future
packaging option; this version builds locally and ships no native binaries.

## Automated verification

```sh
swift test --package-path packages/groovenet-player/macos --enable-code-coverage
npm run test:coverage --workspace @groovenet/player

# Build contracts -> client -> player first, then build the helper as above:
node packages/groovenet-player/scripts/now-playing-smoke.mjs
```

Swift tests cover metadata/native keys, time units, terminal states, transport
mapping, initial/event ordering, version and malformed-message rejection,
timeouts, RPC errors, fragmented Unicode, cancellation, real socket I/O,
disconnects, SIGPIPE safety, and duplicate-lock release. The macOS CI job exports
Swift coverage to Codecov separately from the existing Linux player coverage.
The job also runs the real-daemon lifecycle smoke with an instrumented app bundle
and includes the native entry point in its coverage report. Physical remote
commands and the visible system UI still require the manual checks.

The opt-in smoke script runs the **real Groovenet daemon** with an in-memory
backend on a temporary socket. It checks companion startup, duplicate rejection,
pause/resume/track state changes, SIGTERM with preserved playback/queue, and
daemon disconnect. It never opens an audio device, touches the user's existing
daemon, or establishes that macOS delivered a media command.

## Manual acceptance test and results

Use at least two downloaded tracks with known metadata and duration, and an
already running daemon using the normal mpv backend. First stop any competing
prototype companion. Record macOS version, architecture, helper form (bare or
bundled), keyboard/headset model and results.

1. Start the bundle companion during real playback. Open Control Center's Now
   Playing panel and check the Groovenet identity, title, artist, album, elapsed
   time advancing in seconds and known duration. Compare a bare executable
   launched from `swift build --show-bin-path`, bypassing only the bundle guard
   in a temporary prototype, to establish which packaging is required.
2. Focus Finder or another nonterminal app. Use the keyboard media key to pause
   and resume. Confirm audible playback and Now Playing state/elapsed time agree;
   resuming must preserve position. Also try Control Center's buttons.
3. Use next/previous media keys. Confirm both the audible track and metadata
   change. Repeat with headset controls if available; document unsupported
   headset button mappings rather than infer support from keyboard results.
4. Pause long enough to confirm elapsed time does not advance. Resume, then stop
   playback through the **RPC `stop`** (the CLI `player stop` shuts the daemon
   down). Check metadata clears, the queue remains, and a later play works.
5. Stop/restart the daemon. Check the helper clears metadata and exits with a
   restart message; restart the helper and verify the new status is displayed.
6. During playback, Ctrl-C the helper. Check metadata clears and daemon playback
   and the queue survive. Launch it again; a second simultaneous companion must
   fail without disrupting the first.
7. Try a missing socket, an unbuilt helper, and a genuinely headless/no-GUI login.
   Each should give an actionable error without starting/stopping playback.
   Confirm ordinary headless CLI installation still works without native tools.

Recorded local results (2026-10-30, macOS 27.0.1 build 26A434, arm64, Swift 6.4.2):

| Check                                                         | Result                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Swift build and unit tests                                    | Passed; 19 tests                                    |
| Combined Swift unit/native lifecycle coverage                 | 95.3% executable lines; native entry point included |
| Existing Node player suite                                    | Passed; 342 tests, one gated database test skipped  |
| Explicit bundle creation/ad-hoc signing                       | Passed                                              |
| Bundle connects to isolated daemon socket                     | Passed                                              |
| Duplicate helper rejection and prompt startup-error exit      | Passed                                              |
| Real-daemon/in-memory-backend lifecycle smoke                 | Passed                                              |
| SIGTERM preserves daemon playback/queue; disconnect exits     | Passed                                              |
| Real mpv audio and Control Center metadata                    | Pending; desktop capture was blank                  |
| Terminal-unfocused keyboard media controls                    | Pending                                             |
| Headset controls                                              | Pending; no device tested                           |
| Bare versus bundled command routing                           | Pending                                             |
| Genuine headless-login behavior, Intel, minimum macOS version | Pending                                             |

Issue #680 remains incomplete until the real playback/remote-command feasibility
gate and manual acceptance checks have recorded results. Do not infer these from
the automated lifecycle smoke test.
