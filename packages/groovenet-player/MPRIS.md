# Desktop controls — issue #650 design and smoke tests

## Linux design

`groovenet-mpris` is an opt-in foreground companion to an already running
`groovenet player start --detach` daemon. Install `@groovenet/player` with optional
dependencies enabled (the CLI also depends on this package). From a checkout,
build contracts → client → player, then run:

```sh
node packages/groovenet-player/build/mprisBin.js
```

The bridge uses `dbus-next` 0.10.2 directly, with native JavaScript BigInt for
MPRIS's signed 64-bit microsecond values. The dependency is optional and dynamically
loaded only on Linux with `DBUS_SESSION_BUS_ADDRESS`. No display is needed for
MPRIS; a user session bus is sufficient. The library's optional native Unix FD
addon is unnecessary for these interfaces; no audio, file descriptors or credentials
are sent over D-Bus. A missing dependency or unavailable bus reports a bridge error
and never changes daemon lifetime. Installing with `--omit=optional` leaves the
headless daemon usable. Nothing starts this bridge automatically.

The service owns `org.mpris.MediaPlayer2.groovenet` and exports the root and
Player interfaces at `/org/mpris/MediaPlayer2`. A second bridge refuses to take
over that name. It takes an initial `status` snapshot over the existing private
Unix socket, then subscribes to `state` events. Those already contain both
track-change and position information, so consuming their separate notifications
would duplicate updates. Metadata uses the queue-entry ID (hex encoded into a
valid object path), title, artist, album and known duration. It never publishes
authenticated stream URLs. Normal position updates do not emit PropertiesChanged.

Play, pause, toggle, next, previous and seeks forward to daemon RPCs. Absolute
seeks reject stale track IDs; relative seeks clamp to zero or skip beyond the
known duration. The additive `stop` RPC pauses the backend, clears current playback
state and retains the queue and daemon. It differs from `shutdown` and the CLI's
`player stop`, which still shuts down the daemon. A later play reloads the stopped
queue entry. Transport errors return through D-Bus rather than becoming unhandled
promise rejections. SIGINT/SIGTERM close the bridge connection and bus. Loss of the
daemon or bus closes the bridge; restart it after restarting the daemon.

References: [dbus-next](https://github.com/dbusjs/node-dbus-next),
[MPRIS Player specification](https://specifications.freedesktop.org/mpris/latest/Player_Interface.html).

## macOS decision and scope

The Linux bridge does not run on macOS. The optional Swift companion added for
issue #680 is documented in [NOW_PLAYING.md](NOW_PLAYING.md). Apple's
[MPNowPlayingInfoCenter](https://developer.apple.com/documentation/mediaplayer/mpnowplayinginfocenter)
and [MPRemoteCommandCenter](https://developer.apple.com/documentation/mediaplayer/mpremotecommandcenter)
are native MediaPlayer framework APIs. Node's standard library does not expose
them. The macOS companion uses a separately built Swift helper with its own
AppKit run loop and app bundle, outside the playback core. These were deferred
from #650 to keep that issue's integration lightweight. Running
this bridge on macOS prints that it is disabled and exits successfully.

Also out of scope: artwork fetching, graphical UI raising, URI loading, queue
editing over D-Bus, shuffle/repeat, volume control, playback rate changes,
automatic bridge startup/reconnection, and desktop hotkey binding installation.
Desktop environments usually route media keys to MPRIS; minimal window managers
can bind them to the `playerctl` commands below.

## Manual acceptance smoke test

In a Linux desktop session, with mpv, dbus and playerctl installed:

1. Start `groovenet player start --detach`, add two downloaded tracks with
   `groovenet player queue add '<query>'`, and run `groovenet-mpris` in another
   terminal (or the checkout command above).
2. `playerctl --player=groovenet play`; `playerctl --player=groovenet status`
   should print `Playing`.
3. `playerctl --player=groovenet metadata` should show `xesam:title`,
   `xesam:artist`, `xesam:album` and a valid `mpris:trackid`.
4. `playerctl --player=groovenet play-pause` should pause, then resume on a
   second call. Verify the desktop's play/pause media key does the same.
5. `playerctl --player=groovenet next` and `previous` should update metadata
   and audible playback. Verify the desktop's next/previous media keys.
6. `playerctl --player=groovenet position` reports seconds;
   `position 12.5` seeks absolutely and `position 2+` seeks relatively.
7. `playerctl --player=groovenet stop` reports Stopped; `play` restarts the
   retained entry. Ctrl-C the bridge; the daemon should keep playing.
8. Stop the daemon while the bridge is running: the bridge should exit and
   release its bus name. Start two bridges: the second should fail cleanly.
9. `env -u DBUS_SESSION_BUS_ADDRESS groovenet-mpris` should exit successfully
   with a disabled message. Repeat daemon startup without a desktop/session bus
   and with optional npm dependencies omitted: playback must still work.

An automated Linux wire smoke test uses an in-memory audio backend and the real
D-Bus daemon/playerctl, requiring no server or audio device:

```sh
dbus-run-session -- node packages/groovenet-player/scripts/mpris-smoke.mjs
```

This checks status, play/pause, metadata, next/previous, absolute/relative position,
stop, and that closing the bridge leaves playback usable. Unit tests cover mapping,
property notifications, stale/invalid seeks, failures and cleanup; use
`npm run test:coverage --workspace @groovenet/player`.
