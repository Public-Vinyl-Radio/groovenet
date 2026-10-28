# @groovenet/cli

Command-line interface for managing your [Groovenet](https://github.com/Public-Vinyl-Radio/groovenet) DJ collection — search tracks and albums, manage playlists and friends, and control server-side playback, all from the terminal.

## Install

```bash
npm install -g @groovenet/cli
```

Requires **Node.js ≥ 22.12**. The binary is `groovenet`.

## Configure

Point the CLI at your Groovenet API (stored in `~/.groovenet/config.json`):

```bash
groovenet config set api_base https://your-groovenet-host/api
groovenet config set api_key <token>   # if your instance requires auth
```

## Usage

```bash
groovenet tracks search "miles davis"     # search tracks
groovenet tracks search --genre latin     # Latin and every subgenre (cumbia, salsa, …)
groovenet genres similar cumbia --limit 5 # related genres, scores, and signals
groovenet albums search "kind of blue"    # browse albums
groovenet playlists list                  # list playlists
groovenet playlists log-spins 176         # log the latest performance as spins
groovenet friends list                    # manage the friends system
groovenet player start --detach           # start local headless audio playback
groovenet player                         # open the interactive player (TTY)
groovenet player --search "bpm:120"       # start the TUI with search results
groovenet player --playlist 176          # start the TUI with a playlist queued
groovenet player queue add "miles davis"  # search and queue downloaded tracks
groovenet player play                     # start or resume playback
groovenet play <track-id>                 # play a track via MPD on the server
groovenet fingerprint-library             # index reference audio for matching
groovenet sets derive set.mp3 --playlist 176  # tracklist + diff from a set recording
```

Every command accepts `--json` for machine-readable output:

```bash
groovenet tracks search "bpm:120" --json | jq '.[].track_id'
```

Run `groovenet --help` (or `groovenet <command> --help`) for the full command reference.

## Commands

| Command | Description |
| --- | --- |
| `config` | Manage CLI configuration (`api_base`, `api_key`) |
| `tracks` | Search and manage tracks |
| `albums` | Browse and manage albums |
| `playlists` | Manage playlists |
| `friends` | Manage the friends system |
| `genres` | Find similar genres and reconcile track tags onto the taxonomy |
| `fingerprint-library` | Build the reference fingerprint index used to recognise vinyl as it plays |
| `sets` | Derive a corrected tracklist from a recording of a set, and diff it against the plan |
| `player` | Start, control, and stop local headless playback through the player daemon |
| `status` | One-line now-playing segment for tmux and status bars |

### Local player

The local player uses mpv and plays downloaded audio through the configured
Groovenet API. Start it in the foreground with `groovenet player start`, or
detach it and stop it later with `groovenet player stop`:

```bash
groovenet player start --detach
groovenet player queue add "miles davis"
groovenet player play
groovenet player status --json
groovenet player queue list
groovenet player devices
groovenet player devices select <id>
groovenet player stop
```

`queue add --playlist-id <id>` adds a playlist instead of a search. The daemon
stores its pidfile and Unix socket under `~/.groovenet/player/`. `devices`
continues to list outputs; `devices list` is an explicit alias. See the
[@groovenet/player protocol document](../groovenet-player/PROTOCOL.md) for the
versioned local control protocol.

By default mpv's cover-art window is hidden: embedded artwork is passed over
(`--vid=no`), so playback works on a machine with no display. To get the window
back, run `groovenet config set player_artwork true` (`config show` prints it),
or pass `--artwork` to `groovenet player` / `groovenet player start` for one
run. The daemon reads config when it starts, so restart a running detached
daemon (`groovenet player stop`, then start it again) after changing
`player_artwork`.

Plays can be logged as spins. It is off by default; enable it with
`groovenet config set player_log_plays true` or pass `--log-plays` to
`groovenet player` / `groovenet player start` for one run. A track is logged
once you have listened to half of it or four minutes, whichever comes first
(tracks under 30 seconds never count). Pauses, seeks and skipped tracks do not
add listening time. Each play is a spin with `medium = digital` for
`default_friend_id`, so it shows in spin history but not in vinyl play counts.
Only tracks from that friend's library with a release are logged.

The TUI requires mpv on `PATH` and a terminal. mpv audio outputs are available
on macOS, Linux and Windows. macOS AirPlay speakers appear as CoreAudio devices;
Linux AirPlay routing depends on PipeWire RAOP support, with AirPlay 2 support
varying by receiver. Windows has no native AirPlay route. AirPlay playback adds
about two seconds of latency, so it is suitable for auditioning rather than
beatmatching. The help line in the TUI lists the keyboard shortcuts: arrows or
`j`/`k` select, Enter adds or plays, Space pauses, `n`/`p` skip, left/right seek,
`+`/`-` change volume, `/` searches (filters in playlists), `l` opens playlists, `u` opens the queue,
`d` selects an output; `o` chooses this machine or a named server player, `r` starts playback, `x` removes a queue entry,
`[` / `]` move it, and `q` quits. In the five-row bottom strip, Enter opens the
full view: inside tmux it zooms the pane (tmux's zoom key goes back); elsewhere
it says how large the terminal needs to be. In the playlists and search views `→` is reserved for opening the
selected item, so seek with `<` / `>` there.

### Search

`/` focuses FIND. Track and album searches respect the configured
`default_friend_id` in both local and remote playback. Set it with
`groovenet config set default_friend_id 6` (using your friend ID), then reopen the player.
Results update after a short typing pause; Enter or the up/down
arrows move focus to results. Press `/` to edit again. Printable keys stay in the
query while FIND has focus.

Tab switches Tracks / Albums. Shift-Tab cycles Keyword, Semantic and Hybrid for
tracks; albums use keyword search and preserve the track mode. Enter appends and
plays the selected track or album; `a` appends without interrupting playback.
Existing queue entries are preserved. Album previews show metadata and the start
of the tracklist in wide windows; `→` opens the full tracklist in any window.
Esc leaves typing, returns from a tracklist, or clears the query from results.

Search shows up to 30 results per scope, with the API's estimated total in the
scope label. Search uses a compact playback header to leave room for results.
Album covers use the artwork placeholder until terminal artwork support lands.

### Playlists

`l` opens playlists grouped by month, using the last live-set performance date
or the creation date. Live sets carry a SET badge. Counts and total duration
come from the API; unknown dates and durations are shown explicitly.
Playlists can mix libraries: each track is resolved using its saved `friend_id`,
regardless of `default_friend_id` or the search scope.
Wide windows show a preview with metadata, actions and BPM / Camelot columns.
`→` opens the full tracklist; up/down scroll it and Esc returns to the list
with the filter and selection preserved.

Enter replaces the queue with the selected playlist and starts playback, including
from the full tracklist. `a` appends the whole playlist without interrupting playback.
Server players use atomic `queue.replace`, honoring the existing availability and
takeover policy. Local playback resolves all tracks first, then stops, removes the
old entries, adds the playlist and plays; a failed local command stops this sequence
and displays its error, so a daemon failure can leave a partially replaced queue.

`/` focuses the playlist name filter (`playlists.filter` in the keymap). Printable
keys type text; Enter or up/down focus the results. Esc leaves typing, goes back
from a tracklist, or clears the filter. Use `u` then `/` to search the collection.
The bottom strip keeps its usual Enter-to-expand behavior; resize to see the list.

### Keymap

`groovenet player keys` prints every action, its keys, the views it applies to
and what it does (`--json` for scripts). It reads your config only; it starts no
daemon and no TUI. Override any action under `player_keymap` in
`~/.groovenet/config.json`:

```json
{
  "player_keymap": {
    "transport.next": ["n", "ctrl+right"],
    "queue.remove": ["delete"],
    "app.debug": []
  }
}
```

An override replaces the action's keys in every view it applies to; `[]`
unbinds it. Keys are a single character (case-sensitive: `U` is not `u`), a name
(`enter`, `esc`, `tab`, `space`, `backspace`, `delete`, `up`, `down`, `left`,
`right`, `pageup`, `pagedown`, `home`, `end`), or either with `ctrl+` / `shift+`,
such as `ctrl+n` or `shift+tab`. `ctrl+c` is reserved and always exits. Terminals
send `ctrl+i`, `ctrl+m`, `ctrl+h` and `ctrl+j` as Tab, Enter, Backspace and
newline, so avoid binding those.

The hint line, the `?` help and the output prompts show the active keys, so a
rebound key appears under its new name. Hints show an action's first key.

The keymap is checked when the player starts. An unknown action, a key that does
not parse, or two actions bound to the same key in one view is reported, and only
that entry falls back to its default keys. The player still starts; the problems
appear as a notice on its first screen (any key dismisses it) and in
`groovenet player keys`.

While you type in the search box only the search controls apply (Enter, Esc, Backspace, up/down,
Tab and Shift-Tab by default); printable keys are typed.

### Status bar segment

`groovenet status` prints one line about what is playing and exits. It is built
for a status bar that runs it every few seconds; for a full report use
`groovenet player status`.

```bash
groovenet status                    # ▶ Money Trees · Kendrick Lamar ━━──── 0:44 · LOCAL
groovenet status --remote lounge    # a server player; its name is the target
groovenet status --format '{icon} {title} [{position}/{duration}]'
groovenet status --max-width 40     # shortens title and artist, not the times
groovenet status --idle '■ idle'    # print this when nothing plays
```

Fields for `--format`: `{icon}` (▶ playing, ‖ paused, … loading, ! error),
`{title}`, `{artist}`, `{position}`, `{duration}`, `{bar}` (`--bar-width`,
default 6) and `{target}` (`LOCAL`, or the server player's name).

It reads the local daemon over its socket, or one server player snapshot with
`--remote <id>`. It never starts a daemon or the TUI. **It is quiet by design:**
no daemon, no server, a missing key or a timeout (`--timeout`, default 1000 ms)
all print nothing and exit 0, so a status bar never shows an error. When
nothing is playing it prints nothing too, unless `--idle` is given.

For tmux, `--tmux` adds `#[…]` styles using attributes and ANSI colour names, so
the segment follows your terminal theme, and escapes `#` in track names:

```tmux
# ~/.tmux.conf
set -g status-interval 5           # how often tmux reruns #(…), in seconds
set -g status-right-length 80
set -g status-right '#(groovenet status --tmux --max-width 60) '
# or a server player:
# set -g status-right '#(groovenet status --tmux --remote lounge --max-width 60) '
```

`status-interval` is the refresh rate; the position only moves when tmux reruns
the command. A server player's position is the server's last checkpoint, so it
can lag by a few seconds.

### genres similar

```bash
groovenet genres similar cumbia
groovenet genres similar cumbia --limit 5 --json
```

Lists related genre names and slugs, scores, and short signals such as
`sibling, NPMI 0.42, 7 shared albums`. A missing score or signal is shown as
`-` for the API's taxonomy-sibling fallback. `--json` prints the raw
`{ genre, related }` response. Similarity uses every collection; the server
defaults to at most 20 related genres, with fewer when unavailable.

### playlists log-spins

Creates one spin per playlist entry. It uses the playlist's latest live-set
performance by default and is safe to re-run for the same performance.

```bash
groovenet playlists log-spins 176
groovenet playlists log-spins 176 --performance 12
groovenet playlists log-spins 176 --at 2026-10-01T20:00:00Z
groovenet playlists log-spins 176 --derivation <derivation-id> # matched offsets; omit tracks not played
```

### sets

Turns a recording of a set into a timestamped tracklist, and — given the
playlist you planned — shows how the night differed from the plan. The file is
hashed locally and uploaded only if the server does not already have it.

```bash
groovenet sets derive ~/sets/2026-08-15.mp3 --playlist 176
groovenet sets derive set.mp3 --live-set 12       # also attach it to the live set
groovenet sets derive set.mp3 --force             # re-run even if done before
groovenet sets show <derivation-id> --playlist 176
groovenet sets review <derivation-id> --playlist 176  # accept or skip each difference, fix the playlist
```

Example output (abridged):

```
inner-signals.mp3 — 40 plays, 87.5% of 3:04:04 identified (chromaprint 1)

  ✓ 0:00:15  0:06:44  Herbie Mann — Soul Beat Momma [1234-A1]
  ⇄ 0:12:44  0:16:58  Cuco — Lovetripper [13916746-A6]  instead of A5 Feelings
  ? 0:16:58  0:19:28  unidentified (2m30s)
  ↕ 0:48:41  0:50:56  Elia y Elizabeth — Hay Que Vivir La Vida [6279169-B4]  out of order

Against playlist 176
  32 as planned · 6 played instead · 0 not planned · 2 planned but not played
```

### fingerprint-library

Fingerprints the library's reference audio so live vinyl playback can be
recognised against it. Safe to re-run: each track's audio is hashed and skipped
when nothing has changed.

```bash
groovenet fingerprint-library                  # only tracks not yet indexed
groovenet fingerprint-library --changed        # re-check already-indexed files
groovenet fingerprint-library --all --force    # regenerate everything
groovenet fingerprint-library --track 12345-1  # one track
groovenet fingerprint-library --release 12345  # one release
groovenet fingerprint-library --no-wait        # queue it and return
```

```
Indexing missing — chromaprint 1
  3653 queued, 241 without reference audio
  ✗ 12345-2: ffmpeg exited 1: Invalid data found when processing input
  ✓ 3412 indexed   ⤼ 0 skipped   ✗ 2 failed   – 241 no audio
```

Tracks with no local audio are counted, not failed — only the part of the
library you have downloaded can be fingerprinted. Exits 1 if any track failed.

## Related

- [`@groovenet/client`](https://www.npmjs.com/package/@groovenet/client) — the typed API client this CLI is built on.

## License

MIT

For server-side single-speaker AirPlay, the opt-in OwnTone adapter requires a
dedicated patched engine and a read-only shared audio library. Set
`player_backend owntone`, or use `player start --backend owntone`. Configure
`owntone_url`, `owntone_library`, optionally `owntone_output` and
`owntone_password`; restart an existing daemon to apply them. Full setup and
verification limits: [OwnTone backend](../groovenet-player/OWNTONE.md).

### Named server players

Local playback remains the default (`groovenet player`). To control server audio,
select a persistent player explicitly on each invocation:

```sh
groovenet config set api_base https://groovenet.home.arpa/api
# Set the separate household/admin PLAYER_API_KEY in the environment, or store it:
groovenet config set player_api_key '<household-key>'
groovenet player list --json
groovenet player --remote lounge
groovenet player --remote lounge status --json
groovenet player --remote lounge queue add --playlist-id 7
groovenet player --remote lounge devices list
groovenet player --remote lounge devices select OUTPUT_ID
groovenet player --remote lounge play --allow-unknown
groovenet player set lounge --availability allow_unknown
```

`PLAYER_API_KEY` overrides `player_api_key`; the collection `api_key` is separate
and remains unchanged. When using 1Password to launch the interactive TUI, preserve
the terminal with `--no-masking`:

```sh
PLAYER_API_KEY='op://Homelab/groovenet/PLAYER_API_KEY' op run --no-masking -- groovenet player --remote lounge
```

Default `op run` masking pipes stdout, so the TUI cannot detect a terminal. The
player UI does not print credentials. Config output redacts secrets, and saved config files are
private (0600). Engine URLs/passwords and Home Assistant credentials stay on the
server. A server operator creates players through the existing shared API; see
[server player setup/API](../groovenet-player/SERVER_PLAYERS.md).

`--remote` chooses the initial target. Press `o` for **Play on**: This machine,
then named servers with LIVE/IDLE state and a current-target marker. Arrow keys
select a target and preview its track, position, up-next count and join behavior;
Enter joins, Esc cancels. In the five-row strip, Enter expands the pane first.
`d` remains the selected target's devices view, with the selected output's activity,
assigned/desired owners and sender observations below the list.

Joining from local sends the current entry and everything after it, preserving
order, duplicates and each entry's library. A stopped queue sends all entries;
an ended queue sends none. One atomic join appends to a live server or starts an
idle session. An empty local queue only attaches controls. Local playback pauses
before Join; refusals and cancellation retain its queue. Only a committed join
finalizes that local queue. Switching servers copies no queue. Returning to
This machine sends no server command: the server keeps playing.

If speaker activity is unknown or occupied, the TUI shows an inline confirmation:
`y` explicitly plays anyway / takes over; Esc cancels. These are `target.confirm`
and `target.cancel` keymap actions. Changing the local queue or server revision
requires review and another action. A failed join retry retains its original
revision fence, so an ambiguous reply cannot merge the same queue twice. If local
cleanup fails after a committed join, remove the retained entries before joining
again. Discovery/authorization failures leave This machine usable.

The remote TUI shows identity/revision, its independent queue/current entry,
position/state, saved checkpoint status, desired output, actual Groovenet
assignment, and speaker observations refreshed every five seconds. Observations
are evidence of activity, never sender identity. Disconnection marks state stale;
errors such as busy, lost/interrupted playback and uncertain release are shown
without automatic reconnection of audio. Volume is requested sender volume;
some receivers ignore it.

Normal playback keys retain their meanings. In remote mode `s` stops playback,
and `[` / `]` move the selected queue entry. These and the acknowledgement keys
below are keymap actions too (see [Keymap](#keymap)). In the devices view Enter remembers
the selected output; it does not connect/reserve it. `U` plays the **desired**
output allowing unknown activity, and `T` plays it taking over occupied activity.
These are explicit one-command acknowledgements. To detach another Groovenet
player's speaker and play here, select it and press `t`; use `Y` to transfer
allowing unknown activity or `!` to transfer taking over occupied activity.
Queues remain independent. Each player uses one output; synchronized groups are
deferred.

Equivalent scripted operations use `--allow-unknown` or `--takeover`, plus:

```sh
groovenet player --remote study devices transfer OUTPUT_ID --allow-unknown --json
groovenet player --remote study play ENTRY_UUID --json
groovenet player --remote study queue move ENTRY_UUID 0 --json
groovenet player --remote study queue remove ENTRY_UUID --json
groovenet player --remote study queue clear --json
```

Flags on a bare TUI invocation acknowledge only their stated policy for remote actions, including after switching targets.
Neither flag overrides another Groovenet player's claim without explicit
transfer. A partial transfer fails the CLI command even with HTTP 200 and reports
whether detachment/attachment happened. It never silently reconnects the source.
Commands use revisions; on conflict state refreshes and the user decides whether
to issue a new command. Ambiguous failures are never blindly retried.

Reconnects wait for a fresh SSE snapshot and reject stale worker/sequence,
revision and current-entry events. `q`, Ctrl-C, closing the laptop or losing the
network leaves server audio running. An unreachable remote never starts local
audio. `player stop --remote ID` explicitly stops playback while preserving the
server player and queue; `player start` remains a local daemon operation.
