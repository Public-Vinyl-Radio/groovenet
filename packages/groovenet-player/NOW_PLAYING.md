# macOS Now Playing

The optional `groovenet-now-playing` companion displays track metadata in macOS
Now Playing and forwards play/pause/next/previous controls to a local daemon or
named remote player. It runs separately from the CLI/TUI; closing either client
leaves remote playback running.

## Setup

The helper targets macOS 13+ and requires a local graphical login session.
No Xcode, Swift toolchain or Developer ID is needed:

```sh
npm i -g @groovenet/cli
groovenet config set now_playing_target lounge   # only for a remote player; skip for local
groovenet-now-playing                            # downloads the helper on first run
```

Or start it at every login instead of by hand:

```sh
groovenet now-playing enable
```

The first run downloads the prebuilt helper for the installed
`@groovenet/player` version (see "Release builds") into
`~/.groovenet/now-playing/<version>/`, outside `node_modules` so upgrading the
package does not wipe it. Later runs reuse it; a new package version downloads
its own copy and leaves older ones in place. `groovenet-now-playing --install`
does only the download, for scripts.

The download is verified against the release's `.sha256` before it is unpacked,
unpacked into a temporary directory and checked with `codesign --verify`, and
only then renamed into place, so an interrupted download never looks installed.
If the download fails (offline, or a checkout whose version has no release yet)
the command says so and suggests `--build`; it never falls back silently. Set
`GROOVENET_NOW_PLAYING_BASE_URL` to fetch from a mirror laid out like the GitHub
release downloads (`<base>/groovenet-player-v<version>/<asset>`).

The helper is ad-hoc signed, not notarised, and that is enough: Gatekeeper only
checks files carrying the quarantine attribute, which browsers set and a Node
`fetch` does not. A browser download of the zip would be quarantined and blocked.

Choose what the helper follows once, in the CLI config, then start it with no
arguments:

```sh
groovenet config set now_playing_target lounge   # a remote player ID
groovenet-now-playing
```

`now_playing_target` is a remote player ID or `local`; unset means `local`. The
resolution order is: flags, then `now_playing_target`, then `local`. `config set`
rejects values that are neither `local` nor a valid player ID, and a bad value
already in the config file makes the helper exit with an error rather than fall
back to `local`. A missing or unreadable config file means `local`.

Flags override the config for one run: `--remote PLAYER_ID` or `--socket PATH`
(they cannot be combined):

```sh
groovenet-now-playing --remote lounge
```

Remote mode reads `api_base`, `api_key`, `player_api_key`, and `insecure_tls` from
the CLI configuration. `PLAYER_API_KEY` overrides `player_api_key`. No local
daemon is needed. The target is explicit; switching targets in the TUI does not
retarget this companion. A remote player whose ID is literally `local` needs
`--remote local`.

For local playback (the default), start the daemon and populate its queue through
the CLI/TUI:

```sh
groovenet player start --detach
groovenet-now-playing
```

The default socket is `~/.groovenet/player/player.sock`. Use `--socket PATH` for
another local daemon.

From a checkout, substitute `packages/groovenet-player/scripts/now-playing.sh`
for `groovenet-now-playing`. Remote mode also requires built contracts → client
→ player workspaces; published packages include those Node builds.

### Login item

`groovenet now-playing enable` makes sure the helper is installed, writes
`~/Library/LaunchAgents/radio.publicvinyl.groovenet.nowplaying.plist` and loads
it with `launchctl bootstrap gui/$UID`. The agent runs `node nowPlayingBin.js`
by absolute path (launchd's `PATH` finds neither `node` nor the npm bin),
starts at login (`RunAtLoad`), restarts whenever the helper exits
(`KeepAlive`, so a disconnect is also the reconnect) and waits 30 s between
restarts (`ThrottleInterval`) so a dead daemon does not spin. Output goes to
`~/.groovenet/now-playing/launchd.out.log` and `launchd.err.log`.

No target is written into the plist: the helper reads `now_playing_target`
itself. After changing the config, run `groovenet now-playing enable` again to
restart it. `groovenet now-playing status` shows the helper, whether the plist
exists and is loaded, and the target it will follow; `disable` boots it out and
removes the plist.

The plist records the `node` that ran `enable`. If that path goes away (a
version manager switching or removing Node), run `enable` again.

If you use Homebrew's `brew services` for this helper, do not also enable the
login item: both would start a helper. `enable` refuses when the service
`homebrew.mxcl.groovenet-now-playing` is present.

### Building from source

`--build` is the contributor path. It creates and ad-hoc signs
`macos/.build/Groovenet Now Playing.app` in the package directory, which must be
writable, for the current architecture, using Swift 5.9+ and a macOS SDK from
Xcode or Command Line Tools. It runs `scripts/build-now-playing-app.sh`, the same
script CI uses for releases. A `--build` copy takes precedence over a download, so
a contributor always runs what they built; delete `macos/.build` to go back to
the downloaded one. Rebuild after changing architectures. Nothing starts
automatically at installation.

## Release builds

Each `@groovenet/player` release (tag `groovenet-player-vX.Y.Z`) carries a
prebuilt helper, built by `.github/workflows/now-playing-release.yml`:

- `groovenet-now-playing-<version>-macos-universal.zip` holds
  `Groovenet Now Playing.app` with arm64 and x86_64 slices, ad-hoc signed.
- `groovenet-now-playing-<version>-macos-universal.zip.sha256` is the
  `shasum -a 256` line for the zip, so `shasum -a 256 -c` verifies it.

The bundle's `CFBundleShortVersionString` and `CFBundleVersion` are the package
version. To build one yourself, run
`scripts/build-now-playing-app.sh <macos package dir> <output dir> [--universal]`.

## Lifecycle and limitations

Ctrl-C or SIGTERM clears Now Playing and closes the companion connection while
preserving playback and the queue. A daemon or remote-stream disconnect clears
metadata and exits with an error; restart the companion after restoring the
connection (the login item does this for you). Duplicate instances are rejected using an advisory lock in the
private player directory. The lock is released on exit; do not delete its file
while a companion is running.

Volume keys remain system-owned. Volume control, artwork, seeking and a graphical player are outside this
version's scope.
macOS chooses the active media application, and headset button mappings vary.
Remote album metadata requires collection API access; otherwise title and artist
remain available with an empty album. Speaker acknowledgements must be handled
explicitly through the normal CLI.

## Design decisions

The Swift helper uses Apple's public
[`MPNowPlayingInfoCenter`](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter)
and
[`MPRemoteCommandCenter`](https://developer.apple.com/documentation/mediaplayer/mpremotecommandcenter).
It publishes title, artist, album, elapsed time and known duration in seconds,
and updates macOS playback state explicitly. Paused/loading states have rate 0;
stopped/ended/error/disconnected states clear metadata.

A minimal accessory app bundle (`LSUIElement`) provides the stable identity
`radio.publicvinyl.groovenet.nowplaying`; `NSApplication.run()` provides the
main run loop. The launcher runs its executable in the foreground for visible
errors and normal signal handling. Bundled launch is verified; whether a bare
executable can provide equally reliable command routing has not been tested.

Swift keeps native framework access outside Node and the playback core. A Node
native binding would add ABI/build coupling, while a full desktop runtime would
be excessive for this companion. Private MediaRemote APIs and global keyboard
interception were excluded. `NowPlayingCore` separates playback models, socket
handling and metadata mapping from app startup for reuse by a future desktop UI.

Local mode connects directly to the existing version-1 daemon protocol, requests
`status`, and consumes automatic `state` events. Events received before the
initial response take precedence. UTF-8 frames are bounded to 8 MiB, requests
time out after five seconds, and pause/resume preserves the current position.
Native command success indicates acceptance for RPC delivery; displayed state
comes from the player, and asynchronous command failures are reported.

Remote mode uses a Node adapter to reuse `GroovenetClient`, `ServerPlayerSession`,
authentication and TLS configuration. It translates HTTP/SSE state into the same
protocol over a private temporary socket. The shared session rejects stale
observations; commands carry the current revision and are never replayed or
given implicit takeover permission. Album lookups are cached independently of
position updates, and saved checkpoints are displayed as stopped. Playback,
outputs and queue ownership stay with the selected player in both modes.

## Verification

```sh
swift test --package-path packages/groovenet-player/macos --enable-code-coverage
npm run test:coverage --workspace @groovenet/player
# Requires built workspaces and the Swift bundle:
node packages/groovenet-player/scripts/now-playing-smoke.mjs
```

The smoke script uses the real daemon with an in-memory backend and a temporary
socket. It checks startup, duplicate rejection, state changes, shutdown with
preserved playback/queue, and daemon disconnect without opening an audio device.
The macOS CI job includes native app lifecycle coverage alongside Swift unit
tests; Node coverage includes remote mapping, forwarding and error handling.

Recorded locally on 2026-10-30: macOS 27.0.1 (26A434), arm64, Swift 6.4.2.

| Check                                                      | Result                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| Swift tests and combined native lifecycle coverage         | 19 passed; 95.3% executable lines                      |
| Node player coverage suite                                 | 342 passed; one gated database test skipped            |
| Release bundle build/signing and local lifecycle smoke     | Passed                                                 |
| Remote adapter → native helper smoke with isolated fixture | Passed                                                 |
| Remote integration during user playback                    | User reports working; volume intentionally unsupported |
| Detailed per-control hardware results                      | Not yet recorded                                       |
| Intel, minimum macOS version, genuine headless login       | Not yet verified                                       |

For manual acceptance, record macOS version, architecture, keyboard/headset model,
and local or remote target, then check:

1. During real playback, verify identity, title/artist/album and elapsed
   time/duration in Control Center. Confirm elapsed time freezes while paused.
2. With a nonterminal app focused, test play/pause/resume and next/previous on
   the keyboard and, where available, a headset. Check audible playback,
   position preservation and metadata changes.
3. Stop playback through the player's `stop` RPC/API and confirm metadata clears
   while the queue remains. Local CLI `player stop` shuts down the daemon instead.
4. Close the helper during playback, test duplicate rejection, and restart the
   daemon or remote connection. Confirm cleanup, actionable errors and successful
   reattachment without unintended playback changes.
5. Test missing sockets, an unbuilt helper and a headless login. Verify ordinary
   headless playback remains usable without native dependencies.
