# @groovenet/player

UI-free playback core for the Groovenet collection player. It keeps queue and
playback state independent of a terminal interface and exposes a replaceable
`PlaybackBackend`; `MpvBackend` is the first backend and communicates with a
locally installed `mpv` process over its JSON IPC socket.

```ts
import { GroovenetClient, loadConfig } from "@groovenet/client";
import { MpvBackend, PlayerCore, TrackResolver } from "@groovenet/player";

const config = loadConfig();
const client = new GroovenetClient({
  baseUrl: config.api_base,
  apiKey: config.api_key,
  insecureTls: config.insecure_tls,
  clientName: "cli",
});
const resolver = new TrackResolver(client, { apiBase: config.api_base, apiKey: config.api_key });
const player = new PlayerCore(new MpvBackend({ insecureTls: config.insecure_tls }), resolver);
await player.enqueueSearch("Cumbia");
// Or enqueue a playlist in its saved order:
// await player.enqueuePlaylist(42);
await player.play();
```

The resolver turns `local_audio_url` into the server's range-capable
`/api/audio?filename=…` endpoint and passes the configured bearer key to mpv.
Tracks without downloaded audio are skipped with a typed `NO_AUDIO` error.
`insecureTls` is forwarded as mpv's `--tls-verify=no` setting for installations
using a self-signed server certificate.

By default mpv is started with `--vid=no`, so embedded cover art does not open
a window (the player has no artwork view, and the daemon may have no display).
Pass `artwork: true` to `MpvBackend` to keep mpv's cover-art window. The
Groovenet CLI exposes this as the `player_artwork` config key and the
`--artwork` flag; a running daemon must be restarted to pick up a change.

`PlayLogger` is an opt-in subscriber that turns a `PlayerCore`'s events into
play records without the core knowing about it. `playThreshold`, `advanceProgress`
and `isPlay` are the pure rules: a track of 30 seconds or more counts after
`min(50% of its duration, 240 s)` of accumulated play time, where only forward
progress while playing is counted. The CLI wires it to `POST /api/spins` with
`medium: "digital"` (`player_log_plays` / `--log-plays`).
Persistent server players apply the same threshold per queue entry and deliver
owner-library plays through the app's `/api/spins` endpoint. Pending deliveries
are stored in Postgres for retries across worker restarts.

`MpvBackend` does not install mpv. Install it separately and make it available
on `PATH`, or pass an executable path in the constructor. `close()` stops the
owned process. The `TestPlaybackBackend` from `@groovenet/player/testing` is a small in-memory
implementation for consumers that need to exercise the core without audio.

`defaultPlayerPaths()` returns the daemon's socket and pidfile paths (`~/.groovenet/player/`), shared by the CLI and the MCP server.

Build with `npm run build --workspace=@groovenet/player` after building
`@groovenet/client`.

Linux desktop media controls are available through the optional `groovenet-mpris`
companion process. It subscribes to an existing daemon over its socket and exposes
MPRIS for `playerctl` and desktop media keys. It is off unless explicitly started,
and exits disabled without a Linux session bus. See [MPRIS.md](MPRIS.md) for setup,
the platform design (including the macOS deferral), and smoke tests.

Persistent Debian server players with independent queues and a shared control
API are documented in [SERVER_PLAYERS.md](SERVER_PLAYERS.md).

An opt-in `OwnToneBackend` supports one selected AirPlay output through a
dedicated patched OwnTone engine. See [OWNTONE.md](OWNTONE.md) for the pinned
engine build, shared read-only audio mapping, CLI setup, completion semantics
and verification limits. mpv remains the default.
