# @groovenet/cli

Terminal client for the collection. Binary is `groovenet`; published to npm and
globally installable. All HTTP goes through `@groovenet/client`.

## Configuration

`~/.groovenet/config.json`, managed by the CLI:

```bash
groovenet config set api_base https://groovenet.home.arpa/api
groovenet config show
```

Keys: `api_base`, `api_key`, `player_api_key`, `default_friend_id`, `username`, `insecure_tls`, `player_artwork`, `player_log_plays`, `player_backend`, `owntone_url`, `owntone_library`, `owntone_output`, `owntone_password`, `player_keymap` (an object, edited in the file; see Keymap).

Remote controls use `player --remote <id>` as an initial target; `o` switches at runtime; the separate `PLAYER_API_KEY` environment
variable overrides `player_api_key`. Local playback remains the default. See the
README for acknowledgement keys, transfers and reconnect semantics.

## Commands

```
config              set | show
tracks              search | show | update | missing-apple-music | deleted
                    restore | recommend | similar-identity | similar-vibe
albums              list | show | update | download | delete
playlists           list | show | check | create | set-tracks | generate | log-spins
friends             list | add
fingerprint-library (no subcommands — scope flags)
vinyl               status | detections | ingests | aggregate
sets                derive | review | show
records             clean | sleeve | log | copies (add | label | remove)
                    history | void | care [--summary]
genres              similar | reconcile | review | apply | proposals | coverage
player              start | stop | play | pause | next | prev | seek | volume
                    keys | status | queue (add | remove | list) | devices
                    (bare `player` opens the lazy-loaded Ink TUI)
status              (no subcommands — one-line segment for tmux / status bars)
```

**Every command takes `--json`.** Use it for anything programmatic — the default
output is a formatted table with ANSI colour that is painful to parse.

`groovenet embeddings export-eval --friend-id 6 --output eval-data/379-friend-6.json`
exports the read-only metadata/notes, album context and playlist membership needed
for #379. It makes no model calls and never overwrites an existing file. The
snapshot contains private notes; `eval-data/` is ignored and output is mode 0600.
This is a point-in-time *API pagination* export, not a database transaction;
retry if pagination detects a changing collection.

## Layout

```
src/
  bin/         entrypoint, commander wiring
  commands/    one file per group: tracks, albums, playlists, friends, play,
               config, fingerprintLibrary, vinyl, sets
  tui/         the player TUI's theme, primitives, layouts and frame
  output.ts    table and JSON rendering
```

## fingerprint-library

Builds the reference index the live vinyl matcher searches (#277). The CLI does
none of the work: it picks a scope, the app resolves it to candidate tracks and
queues one job per track, and `fingerprint-service` — which owns the engine and
has the audio volume mounted — fingerprints them. The CLI polls the run and
renders progress.

```bash
groovenet fingerprint-library                  # --missing, the default
groovenet fingerprint-library --changed        # re-check already-indexed files
groovenet fingerprint-library --all --force    # regenerate everything
groovenet fingerprint-library --release 12345
groovenet fingerprint-library --no-wait --json # queue it and print the run id
```

Exactly one scope flag. Two is an error rather than a silent pick.

**`--force` is orthogonal to scope.** Even `--all` skips files whose audio has
not changed, so re-running any scope immediately regenerates nothing; `--force`
is the only way to rewrite an unchanged row.

The four counters in the summary are `indexed` / `skipped` / `failed` /
`no audio`. The last is not a failure — `tracks.local_audio_url` is nullable, so
only part of the library is indexable at all, and the run reports how much.

Exit code is 1 if any track failed, so it composes in a script.

## genres

Reconciling free-text `local_tags` onto the genre taxonomy (#372). Like
`fingerprint-library`, the CLI only starts the run and polls it: the app splits
and normalises the values, proposes exact taxonomy matches, and sends the rest
to the model in batches, so the OpenAI key stays on the server.

```bash
groovenet genres reconcile                    # exact matches, then AI
groovenet genres reconcile --no-ai            # exact matches only, free
groovenet genres reconcile --limit 200        # cap the values sent to the model
groovenet genres proposals --status pending --method ai
groovenet genres coverage                     # how much of the backlog is done
groovenet genres reconcile --all-friends      # every library, not just yours
```

`reconcile` and `coverage` cover one friend's tracks: `--friend-id`, else
`default_friend_id` from config, else everyone; `--all-friends` forces everyone.
Proposals stay global (one per spelling, like aliases), but a scoped run only
proposes values from that friend's tracks, and their `track_count` reflects the
latest run's scope.

A run only proposes; nothing touches a track until a proposal is accepted and
applied. Re-running is cheap: reviewed proposals are kept, and a pending AI
proposal is not re-sent unless `--refresh`. Exit code is 1 if the run failed.

### Review (#373)

```bash
groovenet genres review --auto-accept-exact   # exact matches first, then the rest
groovenet genres review --method ai --min-tracks 5
groovenet genres apply                        # asks first; --yes in a script
```

Pending proposals are grouped by what they would do (every value mapping to
Cumbia is one question), biggest group first, with a few example tracks.
Single keys: `a` accept, `x` split into single values, `r` remap (fuzzy search
over the taxonomy), `n` new genre (then pick its parent), `d` descriptor, `k`
drop, `s` skip, `u` undo, `q` quit. Ctrl-C is `q`.

- **Decisions are written as you go**, through `POST
  /api/genres/proposals/decisions` (one transaction per group), so quitting
  loses nothing and the next review starts with what is still pending.
- **Undo restores exactly**: the decisions response carries each proposal's
  previous state, and `u` sends it back to `/proposals/restore`, a whole group
  at a time.
- **Nothing touches tracks until apply**, offered once at the end of a session
  and confirmed, or `genres apply` later.

`genresReview.ts` keeps the logic testable: `groupProposals`, `searchTaxonomy`
and `decisionsFor` are pure, and `runReview` takes its key reader and line
reader as arguments. `rawKeyReader` is the only part that touches the TTY.
Review refuses to run without a terminal.

## vinyl

Inspecting the automatic play tracking pipeline (#299). Before this, the only
way to see a detection was `psql` on the box.

```bash
groovenet vinyl status                 # is the pipeline working at all?
groovenet vinyl detections             # recent windows, matched and not
groovenet vinyl detections --no-match  # only the windows that matched nothing
groovenet vinyl ingests --status failed
```

`status` leads with the reference index and **exits 1** when the index is empty
or no engine is registered, so it composes as a health check. That ordering is
the whole point: an empty index is the failure that looks like success — chunks
arrive, decode, report `processed`, and every one of them matches nothing.

A no-match window is rendered plainly rather than in red. It is the expected
state between tracks, and colouring it as an error trains you to ignore errors.

`status` also warns when tracks have `local_audio_url` but no fingerprint
(#303) — the gap that used to need a manual `groovenet fingerprint-library`
run to notice. It doesn't fail the health check: the app queues these
automatically (on download, and on a periodic backfill pass), so a nonzero
count is a normal transient state, not a broken pipeline.

Same shape for detections waiting to become spins (#304): a nonzero count is
normal (the app aggregates on a confident detection and on a periodic pass),
but before #304 this number would have grown forever — the aggregation logic
from #279 existed and was tested, but nothing ever called it.

`groovenet vinyl aggregate --since <date>` is the manual escape hatch for that
same backlog. Both automatic triggers only look back
`PLAY_AGGREGATION_LOOKBACK_MINUTES` (default 60), so detections stored before
this shipped — or from any longer gap — never get picked up on their own.
`--since` accepts anything `Date` can parse (`2026-08-01`, a full ISO
timestamp, …); add `--source <id>` to scope it to one listener. Safe to
re-run: it hits the same `POST /api/spins/aggregate` route the schedulers use,
whose dedup (`findAutomaticSessionByDetectionId`) means re-aggregating a
window that already has spins creates nothing twice.

## status

`groovenet status` (#828) is the status-bar segment, not `player status`:
`player status` is the full report and fails loudly; `status` prints one line or
nothing and **always exits 0**. Unreachable daemon or server, missing key and
timeout all print nothing, and it never writes to stderr. `--json` prints the
fields, or `null` when idle or unreachable.

`status.ts` keeps it pure and testable: `fromLocalSnapshot` / `fromServerPlayer`
build a `NowPlaying` (null when idle), `renderSegment` applies `--format`,
`--max-width` and `--tmux`, `progressBar` draws `━`/`─`, and `runStatus` takes
the sources as an argument. `--remote` is a single `getServerPlayer` call, with
no session or stream.

- **The action calls `process.exit`.** A timed-out request would otherwise keep
  the process alive, and tmux reruns it every few seconds.
- **`readLocalSnapshot` waits for the daemon to hang up before returning.** The
  daemon streams position events to every client and has no `error` handler on
  client sockets. Exiting with events unread makes the kernel send a reset,
  which crashes the daemon.
- `--max-width` shortens title and artist first, the longer one first, and only
  cuts the rest of the line when the fixed parts alone do not fit. In tmux mode
  it counts visible cells, not `#[…]` styles.

## Keymap

The player TUI's keys (#822) come from one registry; nothing is hard-coded in
`playerTui.tsx`. All of it is pure and testable without a TTY:

- `playerKeymapRegistry.ts` — the action table: id, description, views
  (`queue`, `search`, `playlists`, `devices`, `play-on`, `confirmation`, and `input` for typing in the
  search box or playlist filter), default keys, optional per-view defaults, hint label,
  `remoteOnly`. **Add a new action or view here**, then handle its id in the
  `useInput` switch; hints, `player keys` and validation follow.
- `playerKeyspec.ts` — `parseKey` (text to spec), `matchKey` (spec against an
  Ink `input, key` event), `formatKey` (`→`, `S-Tab`, `^N`, `Space`).
- `playerKeymap.ts` — `buildKeymap(config.player_keymap)` merges and validates
  (never throws), `resolveAction` picks the action for a view, `hintItems` /
  `hintLine` render hints.
- `playerKeys.ts` — the `player keys` table and JSON.
- `playerTuiKeys.ts` — `playerTuiAction`: in the search box only `input`
  actions apply and other printable keys are text.

Rules worth knowing:

- **Conflicts are per view**, over all actions including remote-only ones, so a
  config behaves the same locally and remotely. A conflict reverts the
  *overridden* action(s) to defaults and repeats until stable; defaults never
  conflict (a registry test enforces it).
- **A bad entry loses only itself.** Any bad key in an entry reverts that whole
  action to its default keys.
- `→` is `nav.open` in search/playlists and seek in queue/devices; seek there
  uses `<` / `>` (`viewKeys`). `nav.open` opens a full tracklist; `search.scope` / `search.mode` control search.
  `playlists.filter` focuses the playlist name filter. `app.debug` remains reserved.
- Problems go to an in-TUI notice, never stderr, which would corrupt the screen.
- Ink gives capital letters `shift: true`, so characters match on `input` only;
  `ctrl+j` arrives as `enter`, not `return`, and cannot be bound.

## TUI layout

The player TUI's frame (#823) lives in `src/tui/`; `playerTui.tsx` holds the
state and keys and renders into it.

- `theme.ts`: the colour roles (`ink`, `strong`, `muted`, `dim`, `shadow`,
  `selection`, `selectionStrong`, `reverse`, `live`, `warn`, `error`) as ANSI
  attributes and named colours only, never hex. **Views name a role
  (`<Styled role="muted">`, or `{ text, role }` segments) and never set Ink
  colour props.** `NO_COLOR` drops colour and dim but keeps inverse and bold.
- `text.ts`: `displayWidth`, `sliceWidth`, `truncate`, `fit`, `fitRight`,
  `wrap` and `progressBar`, all counting terminal cells (wide CJK/emoji,
  combining marks) via `string-width`. `status.ts` uses the same helpers.
- `primitives.tsx`: `Styled`, `Line` (left fitted, right aligned, one row),
  `fitSegments`, `OutlinedBox` (`┏━┓` with the `▐`/`▀` shadow, `width + 1` ×
  `height + 1`), `ProgressBar`, `ReverseLabel`, `Rule`, `HintBar`, `ArtSlot`.
- `layout.ts`: `pickLayout(columns, rows)`, pure. Breakpoints, as named
  constants: **full** at ≥ 80×24, **side** pane at ≥ 32×30 (narrower than 80),
  **strip** at ≥ 60×5 (anything wider but too short for the others; it draws
  five rows), otherwise a "terminal too small" message. The art slots are fixed:
  18×8 in full, 14×6 in side, none in the strip.
- `useTerminalSize.ts`: `stdout.columns`/`rows`, updated on `resize`.
- `frame.tsx`: `PlayerFrame`, plus `TopBar`, `tabSegments`, `HelpOverlay`,
  `TooSmall`.

`artwork.ts` / `artworkSlot.tsx` fetch covers through `GroovenetClient.getArtwork`,
resize with sharp, and keep bounded session caches. `ArtworkProvider` detects
Ghostty/Kitty and checks tmux's per-pane `allow-passthrough`; native images use
quiet Kitty Unicode virtual placements, raw stdout for uploads/deletes and Ink
text for the cells. Each slot fences stale async completions and deletes only its
own image ID on cleanup. True-colour terminals without Kitty/passthrough use
half-block pixels. `NO_COLOR`/non-TTY keep `ArtSlot`. `GROOVENET_TUI_ART` overrides
`auto` with `kitty`, `blocks` or `off`; see README for multiplexer limitations.
Artwork colours encode pixels/protocol IDs and intentionally bypass theme roles.

A view plugs in through two render props, each told the exact cells it has:
`nowPlaying(area)` (the card's text column, right of the art; the whole first
row in the strip) and `children(area)` (the body, `width` × `rows`). The side
pane calls `nowPlaying` twice: beside the art (`art.height` rows), then with
`area.region === "below"` for the card's full width under it (#824). The frame
owns the top bar, tabs, status line (or `alert` while a message is up), hint
bar and the `?` overlay (`help`, which replaces the body). Text inside a slot
must be fitted to the area (`fit`, `Line`): the frame clips overflow rather
than letting Ink wrap. Hints and help come from the keymap (`hintItems` with
`omit` for what the tabs and top bar already show, `helpEntries`,
`primaryKey`), never literal key text.

The playlists view (#826) lives in `playerTuiPlaylists.tsx` and
`playerTuiPlaylistsState.ts`: grouping follows the web timeline (last performed,
else created, local calendar month). Existing client list / playlist refs / batch
track methods provide all metadata; batch results are reordered by playlist
position. Missing references stay visible as numbered unavailable rows; available
tracks and artwork still preview, while missing references block playback. Preview and full tracklist share
columns; side panes use two-line rows. The filter uses `playlists.filter` and the
shared input dispatch. Enter replaces the whole playlist even in the full table;
`a` enqueues it. Remote replacement is one policy-preserving `queue.replace`;
local replacement uses the daemon's stop/remove/addTrack/play commands.

The queue view (#824) is `playerTuiQueue.tsx`: `NowPlaying` (the card in all
three layouts), `QueueView` (full: `#`/title/artist/time/BPM/key, title and
artist splitting the spare width 40:46; side: two rows per entry) and
`stripHints`. The row builders (`fullRow`, `sideRows`) are pure and return
segments, so roles are testable without ANSI. Formatting comes from
`@groovenet/client` (`trackMetaLine`, `trackDurationLabel`, `camelotOf`,
`parseBpm`). `currentIndex(snapshot)` is the playing entry; earlier entries
render as played. The cursor opens on (and `u` returns to) the playing entry,
follows an entry it moves with `[`/`]`, and is clamped when the queue shrinks.
The status line reads `TARGET · connection · N in queue · i/N`; outside the full
queue `i/N` sits on the right, where a narrow pane cannot cut it.

**`↵` in the strip opens the full view by zooming the tmux pane**
(`playerTuiFullView.ts`, `resize-pane -Z`), not by forcing a layout: the strip
means the terminal is too short for anything else, and a 24-row frame drawn into
5 rows scrolls the screen. The resize that follows picks the full layout like
any other; tmux's own zoom key goes back. Outside tmux (or already zoomed) it
shows the size needed. `PlayerTui` takes `fullView` so tests can stub it.

Remote snapshots contain only track refs, title and artist. `playerTuiMetadata.ts`
uses the shared `TrackLookup` to batch/cache full collection records for rendering
Now Playing (including cover art) and queue duration/BPM/key. It leaves playback
state and queue identities untouched, ignores late updates after target changes,
and does not re-fetch on position events. Failed or missing metadata retains the
server's title/artist. Local snapshots already contain their full tracks.

`queue.move` (`{ id, to }`) works on the local daemon too, so `[`/`]` are no
longer remote-only.

Tests force the terminal with `forceTerminal(columns, rows, { colorLevel })`
and `resizeTerminal` from `src/tui/testing.tsx` (excluded from the build):
ink-testing-library's fake stdout is otherwise always 100 columns with no rows.
Snapshots are plain text (chalk level 0). Ink trims trailing spaces from each
row, so match a row's end with `/text$/m`, not padding.

The target picker/devices renderers are in `playerTuiOutputs.tsx`; `PlayerTargets`
in `playerTuiTargets.ts` owns candidate observers and the active target. Join uses
`ServerPlayerSession.command(session.join)` with the current revision and explicit
policy; its `onJoined` callback proves commitment, including after acknowledgement.
Local queue identity and original revision fence retries. Local pause precedes Join;
stop/removal follows commitment only. Failed cleanup blocks rejoining retained
entries. An empty/ended queue attaches without a playback command. Remote-to-remote
and Play here never copy a server queue or stop its audio.

`play-on` and `confirmation` are isolated keymap contexts. `target.confirm` (`y`)
and `target.cancel` (`Esc`) are registry actions, and input mode protects their
printable bindings. `RemotePlayerController.interactive` enables the shared
session's acknowledgement lifecycle for TUI commands; scripted commands retain
throwing behavior. Runtime local clients attach lazily, and only the daemon
started by this TUI is stopped on exit. Listener effects fence old controllers;
startup `--playlist` runs once across target switches.

## Build

```bash
npm run build --workspace=packages/groovenet-client   # first
npm run build --workspace=packages/groovenet-player
npm run build --workspace=packages/groovenet-cli
node build/bin/groovenet.js --help
```

## Tests

```bash
npm test --workspace=packages/groovenet-cli
```

Vitest, mirroring `groovenet-client`. The command file keeps its logic in
exported functions rather than in the commander action, which is not callable
from a test: `resolveScope`, `formatProgress`, `formatSummary`, `waitForRun`,
and `runFingerprintLibrary` — the whole run, taking the client and an
`io: { log, write }` so output can be asserted without a terminal. The action is
then three lines and the file is at 100%.

Two things that will cost you an afternoon otherwise:

- `waitForRun` tests use fake timers. Advance them with
  `vi.advanceTimersByTimeAsync`, not `vi.advanceTimersByTime` — the loop awaits
  between polls, and the synchronous version will not let those promises settle.
- When mocking `GroovenetClient`, `mockImplementation` must take a **`function`,
  not an arrow** — `makeClient` calls it with `new`, and an arrow is not a
  constructor. The failure surfaces as a swallowed `TypeError` inside the
  command's catch, not as a mock error.

## Gotchas

- `--json` emits the raw API shape, which is wider than the table columns —
  fields absent from the table are still present in the JSON.
- ESLint uses the shared Node config in the repository root.
- **Never pass bare `parseInt` as a commander coercion.** Commander calls it as
  `(value, previous)`, so a numeric default becomes the *radix*:
  `.option("--limit <n>", …, parseInt, 20)` parsed `15` as **25**, and a default
  of 60 put the radix out of range and yielded `NaN`. Neither failed loudly.
  Use `intOption` / `boundedIntOption` from `src/options.ts`, which ignore the
  second argument and reject nonsense instead of letting `NaN` travel.
- `fingerprint-library --json` prints one object at the end, not a stream. With
  `--no-wait` that object is the queued run; otherwise it is the finished one.
  The exit code is the same either way — 1 if any track failed — so `--json`
  is still usable as a gate in a script.

## sets

A corrected tracklist from a recording of a set (#282). The CLI's part is the
file: it hashes the recording locally (`hashFile`, streamed), asks the server
whether it already holds that sha256, uploads only if not, then starts a
derivation and polls it. `fingerprint-set-worker` does the matching; the app
groups windows into plays and diffs against the plan.

```bash
groovenet sets derive set.mp3 --playlist 176   # or --live-set <id>
groovenet sets derive set.mp3 --force          # fresh run, not the earlier one
groovenet sets derive set.mp3 --no-wait --json # start it, print the run
groovenet sets show <id> --playlist 176        # re-read against any plan
```

Each play is marked against the plan — `✓` as planned, `↕` out of order, `⇄`
played instead of a planned track on the same record, `+` not planned — and
unidentified stretches are interleaved in time order with the unindexed
tracks on the records either side, which is usually the explanation.

**`--playlist` is a read-time choice.** A derivation depends only on the
recording, engine and window settings, so the same run can be shown against
any playlist; `derive` re-uses an equivalent earlier run unless `--force`.

**The upload streams, and must keep streaming.** `uploadSetRecording` passes
the file stream straight to axios with `maxRedirects: 0`. With redirects on,
axios writes through follow-redirects, which keeps a copy of the whole body to
replay — measured on a 253 MB recording at +234 MB of memory, against +78 MB
without.

Exit code is 1 if the derivation failed.

### Review: correcting the playlist

```bash
groovenet sets review <id> --playlist 176            # or --live-set <id>
groovenet sets review <id> --playlist 176 --dry-run  # show the result, write nothing
groovenet sets derive set.mp3 --playlist 176 --review
```

Goes through each difference in play order and asks `y` / `n` (or Enter) /
`q`: **⇄** replace the planned entry in its slot with what was played, **+**
insert an unplanned play after the slot played before it (or at the start),
**−** remove an entry never played — flagged when that track is not
fingerprinted, since then it may have been played unrecognised. A track that
came back in two stretches is one question, not two.

`setsReview.ts` keeps the logic apart from the asking: `changesFrom(view)`
lists the changes, `applyChanges(plan, view, accepted)` returns the corrected
list, `runReview` asks and writes. The plan is rebuilt from the diff itself —
every planned entry is in exactly one of its lists — so no second read is
needed to compute the result.

Two guards, both deliberate:

- **Nothing is written without a final confirm**, after the full corrected
  playlist is shown with changed lines starred.
- **The playlist is read again just before writing**, and the write refused
  if it differs from the plan the diff was computed against. A review must
  never undo an edit made in the meantime; run it again instead.

Writing uses `setPlaylistTracks` (`PATCH /api/playlists` with the ordered
list). Bare `{track_id, friend_id}` references are safe there: the app only
overwrites a track's metadata with values actually sent.

Review is interactive only — it refuses without a TTY, and with `--json` or
`--no-wait` on `derive`.

## playlists check

`groovenet playlists check <id> [--bpm-threshold 8] [--json]` reports total
duration, the BPM curve with jumps above the threshold, Camelot key clashes
between adjacent tracks, releases that appear more than once, and vinyl
side-order violations. The analysis is `checkPlaylist` in `@groovenet/client`
(shared with the MCP `check_playlist` tool); the CLI only renders it
(`formatPlaylistCheck`). `--json` is the full result. The exit code is 0 even
when problems are flagged.

## playlists set-tracks

`groovenet playlists set-tracks <id> --tracks-file refs.txt` replaces a
playlist's tracks (`setPlaylistTracks`, `PATCH /api/playlists`) and prints the
result like `playlists show`. One ref per line, in order: `track_id` or
`track_id,friend_id` (bare ids use `default_friend_id`); blank lines and `#`
lines are ignored; `-` reads stdin. Every line is validated before any request,
and all bad lines are reported together. Named `set-tracks` so it does not
collide with `playlists set`, which manages the set record.

## playlists log-spins

Logs one playlist entry per spin, using the latest live-set performance by
default. `--performance` chooses another performance, `--at` supplies a single
timestamp for a playlist without one, and `--derivation` uses the matched set
offsets while omitting planned entries that were not played. Re-running the
same playlist/performance or playlist/timestamp is idempotent.

## records

Care actions and physical copies use the `@groovenet/client` record methods.
`clean`, `sleeve` and `log` target a release's default copy unless `--copy` is
given. `copies label <release> <label>` also creates the implicit default copy
when needed; `--copy <id>` labels a specific copy after checking its release.
`copies add <release>` adds another physical copy, and `copies remove <id>`
soft-deletes one. `care` lists copies that need attention; `--summary` prints
counts. Every subcommand supports `--friend-id` and `--json`.
