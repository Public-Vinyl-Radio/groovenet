# Groovenet Brick preview

The native C++17/SDL2 application foundation for #1096. Desktop and future device
launchers share the application, data-adapter interface and SDL renderer. This
preview has deterministic mock data and a live REST/SSE adapter; audio stays on the server.

## Knulli device package

`just brick-package` produces the versioned experimental ARM64 Ports archive, independently
of npm and desktop builds. See [install/build/control instructions](knulli/README.md)
and [application device evidence](evidence/knulli-preview-1107.md) for hashes,
firmware/ABI limitations, physical observations and remaining acceptance checks.
The device profile uses the same renderer and REST/SSE adapter. It supplies a
licensed DejaVu font and maps remote volume to D-pad Up/Down on Now Playing.
Desktop mode retains its existing mappings below.

## Host setup and commands

Supported development host: macOS with Xcode command-line tools and Homebrew.
Linux CI uses Ubuntu 24.04 with SDL's dummy video driver.

```sh
brew install cmake pkg-config sdl2 sdl2_ttf curl json-c libpng jpeg-turbo
just brick-preview
just brick-preview --scale 0.75 --scenario metadata
just brick-test
just brick-coverage
```

Linux dependencies: `cmake clang llvm pkg-config libsdl2-dev libsdl2-ttf-dev
fonts-dejavu-core libcurl4-openssl-dev libjson-c-dev libpng-dev libjpeg-dev python3 openssl`. Requires SDL2 and SDL2_ttf >= 2.0.18, CMake >= 3.20 and a C++17
compiler. Native dependencies are independent: existing npm bootstrap, builds and
tests do not invoke CMake or require SDL. Build output stays in this directory's
ignored `build/` and `build-coverage/` directories.

The default font is system Arial on macOS and DejaVu Sans on Linux. Override with
`--font /absolute/path/font.ttf` for another host or script. Supply a font with
appropriate glyph coverage for the metadata languages you need; SDL_ttf renders
UTF-8, but a font cannot render glyphs it does not contain. The Knulli package separately includes redistributable DejaVu Sans and its license; no macOS font is distributed.

## Display and input

The logical canvas is **1024×768**, matching the Brick panel documented in the
[TRIMUI Brick TG3040 manual](https://ae-pic-a1.aliexpress-media.com/kf/S708858c6482e484a8670e62d58ae775dM.pdf).
`--scale 0.5` through `--scale 3` changes the initial window size; resizing
letterboxes the same logical canvas, including on Retina displays. The #1095
probe used a 640×480 test canvas, not the panel's native dimensions. The experimental device preview is tracked in #1107; full supported-release
qualification remains in #1102.

| Named action                                       | Keyboard                | SDL game controller               |
| -------------------------------------------------- | ----------------------- | --------------------------------- |
| Focus up/down (lists); remote volume (Now Playing) | Arrow up/down           | D-pad up/down                     |
| Select                                             | Enter                   | A                                 |
| Back                                               | Escape                  | B                                 |
| Browse menu                                        | Tab                     | Start                             |
| Play/pause                                         | Space                   | Y                                 |
| Previous/next                                      | Arrow left/right or Z/X | D-pad left/right or shoulders L/R |
| Remote player volume down/up                       | Minus/plus (or equals)  | Left/right stick click (L3/R3)    |
| Cycle mock scenario                                | F1 (Fn-F1 on some Macs) | Use CLI scenario at launch        |
| Quit preview                                       | Q or window close       | Back/Select button                |

These are SDL semantic controller positions, not guesses about Knulli raw button
IDs. SDL-recognized controllers work at startup and can be connected/disconnected
while running. Unrecognized controllers need an SDL mapping supplied by the host
(for example `SDL_GAMECONTROLLERCONFIG`); analog sticks are not required for
navigation. Keyboard repeat is ignored to avoid repeated playback commands.

**Server volume**, including Up/Down on Now Playing, affects only the selected server player's 0–100 level in
steps of five. OS multimedia volume keys and Power are never mapped to server
volume, pause or stop. **Local device volume** belongs to the firmware/OS adapter
and has no application command here. Nothing essential requires mouse input.

Tab opens Browse with Now Playing, Players, Playlists, Queue and Outputs. Focus
wraps within each list and is remembered per screen. Enter selects, Escape
returns to the previous screen, and Escape at the initial Now Playing screen
stays there. Selecting a player is observational and leaves playback unchanged.
Playlists opens saved playlists, then their ordered tracks. The first row opens
playlist actions; a track opens actions for that track only. Play now opens a
replacement confirmation with Cancel selected by default. Add to queue appends
without starting idle playback. Back preserves list focus. Queue shows the selected player’s shared queue, with the current entry marked.
Select an entry to play it, remove it, or move it up/down one position. Left/right
pages through five rows at a time; Up/Down wraps. The first row opens Clear queue
with Cancel selected by default. Outputs discovers speakers and shows desired, assigned and observed state separately.
Selecting a speaker opens a confirmation with Cancel selected. Selecting stops
the target and, for an explicit transfer, detaches the named source; it remembers
one desired output without starting playback. Play desired output is a separate
confirmed action. Button hints remain visible on every screen.

Losing window focus simulates a suspended UI; focus gain requests an adapter
refresh. Quit, suspend and wake never issue playback commands. The mock clock
pauses while the preview is suspended. A real server's clock/playback will keep
running; the live adapter must replace local state with a fresh snapshot on wake.

## Mock scenarios and live configuration

`--mode mock` is the default. F1 cycles through this fixed sequence, resetting
the fixture and all list focus, without using randomness or network requests:

| `--scenario`       | Fixture                                                         |
| ------------------ | --------------------------------------------------------------- |
| `playing`          | Lounge playing a three-track queue at 0:42, volume 55           |
| `paused`           | Same queue, stopped clock; Space resumes                        |
| `empty`            | Empty queue; playback commands have no effect                   |
| `loading`          | Loading message; transport/volume disabled                      |
| `disconnected`     | Disconnected with retained metadata; commands disabled          |
| `unavailable`      | Selected player unavailable; commands disabled                  |
| `metadata`         | Long title and accented UTF-8 artist/album metadata             |
| `missing-artwork`  | Explicit artwork fallback                                       |
| `refreshing`       | Last known state retained with commands disabled while updating |
| `missing-metadata` | Empty title/artist/album during live refresh; renders safely    |
| `artwork`          | Decoded RGBA upload path, including allocation-failure fallback |
| `speaker-busy`     | Acknowledgment panel blocks commands until Select/Back          |
| `unknown-timing`   | Unknown duration, no progress fraction or invented total        |

The playing clock advances from elapsed milliseconds; track end, Next and
Previous rotate the fixture queue and reset timing. Long text is clipped at a
fixed readable size with a continuation mark, without splitting UTF-8 bytes.
The artwork fixture is deterministic SDL geometry, requiring no downloaded files.

`just brick-preview --mode live` runs the asynchronous native client. Provision a
launcher environment with `BRICK_URL` (app origin, **without `/api`**),
`BRICK_PLAYER_KEY` (the server's `PLAYER_API_KEY`), and, where collection API
authentication is enabled, `BRICK_COLLECTION_KEY` (the collection API key).
Player credentials are never substituted for collection credentials. OwnTone
URLs/passwords remain entirely on the server. Keep the launcher environment file
outside the checkout, owner-readable only (`chmod 600`), and source/export it
before starting the app. Do not put tokens in CLI arguments, screenshots or logs.
The app does not write secrets to its SDL configuration directory.

Use HTTPS outside loopback development. The host libcurl trust store and hostname
verification are enabled by default. For a private CA, provision its PEM bundle
and set `BRICK_CA_FILE` to its absolute path; keep the hostname matching the
certificate and the device clock accurate. Explicit `BRICK_INSECURE_TLS=1`
disables verification for a development session only. Redirects are refused so
credentials cannot follow a redirect to another origin. Invalid configuration
appears in application state; diagnostics never echo credentials/server bodies.

On first launch, open Browse → Players and explicitly choose a named player.
Rows include the stable ID and mark the current selection. No player is selected
automatically, even when only one exists. Selection only observes state: it does
not start playback, join a local queue, change outputs or claim speakers.
The selected ID and server URL are atomically saved in `selected-player` under
the platform's SDL configuration directory. No credentials are saved. Restart
opens that player's Now Playing screen; a removed player or unavailable backend
never causes a fallback to another player. A save failure remains visible while
following the chosen player for the current session.

The worker lists players, fetches selected detail and subscribes to its SSE. The
first valid stream snapshot enables controls. Selecting a player and waking
cancel the old request, discard unsent work, and obtain fresh state. Reconnects
use 250 ms exponential backoff capped at 8 s; every connection starts without a
replay ID and requires a fresh snapshot. A changed worker identity refreshes the
session, and stale sequence/revision/current-entry position updates are ignored.
Now Playing interpolates valid playing timing between authoritative updates,
preserving fractional seconds, clamping to duration and freezing after five
seconds without a timing update. Paused, disconnected, refreshing and unknown
or zero-duration states do not interpolate. Metadata completion cannot reset the
progress clock. Quit cancels/joins both workers and never stops playback.

Requests have a 3 s connect and 8 s total deadline; SSE connections rotate after
30 s. Cancellation interrupts idle transfers through libcurl's progress callback
(typically within a second, with the connect deadline bounding DNS/connect).
Responses and individual SSE events are bounded at 2 MiB, player lists at 1,000,
and queues at 10,000. Input only queues one command; all HTTP, parsing and
metadata work runs on the worker. Snapshot publication uses a mutex, and the UI
copies the latest state during `advance()`.

Commands carry the last authoritative `expected_revision`; playback and volume
are never changed optimistically. A command is attempted **once**. This includes
skip, queue add/replace and explicit takeover submitted through `RestClient` and
`PlayerState::command`. On timeout, lost response or conflict, refresh state and
let the user deliberately retry. A lost response may mean the write committed.
The adapter does not automatically approve takeover/unknown speaker conditions.
Speaker-busy, availability-unknown and engine-busy responses to playback actions
open a named **Approve and retry** panel. After fresh state arrives, A/Enter sends
that exact rejected command once with the requested `allow_unknown` or `takeover`
exception; B/Esc cancels. Approval can interrupt existing speaker playback. It is
invalidated by a player/revision/worker/subscription change or wake/refresh.
Conflicts, ambiguous writes and non-playback failures offer **Dismiss** only.
Playback/volume input is blocked while either panel is open. In Outputs,
a failed explicit Play desired output action can offer a separate confirmation
for unknown status, an occupied speaker, or engine takeover, according to the API
response. Only confirming that action sends `allow_unknown` or `takeover`; the
server availability policy is unchanged. Approvals expire when discovery, player
revision, worker identity or subscription changes. Ambiguous writes are never
retried, and dismissing a warning never changes speakers.
Unauthorized, missing player, revision/speaker conflict, unavailable service and
no-audio errors appear as state, with controls disabled until fresh state arrives.

### Existing collection API audit

| Need                                      | Existing API / contract                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Playlist listing                          | `GET /api/playlists`                                                                                                |
| Playlist details and composite track refs | `GET /api/playlists/{id}/tracks`                                                                                    |
| Track metadata and playable availability  | `POST /api/tracks/batch`, body `{"tracks":[{"track_id":"…","friend_id":1}]}`; array response with `local_audio_url` |
| Individual track                          | `GET /api/tracks/{id}?friend_id=…`                                                                                  |
| Artwork metadata                          | Track `album_thumbnail`; audio metadata also exposes embedded cover information                                     |

`RestClient` exposes playlist reads and composite track enrichment. The live
adapter enriches the current entry, keeping a one-track metadata cache per
connection, keyed by **both** track ID and friend ID. Missing `local_audio_url`
means no playable local audio; a missing batch row is not a playable track.
Queue snapshots supply title/artist and refs, not album/artwork. Collection
authorization or metadata failure leaves player control available and shows a
metadata warning. A separate worker fetches metadata and artwork; changing the
player, current queue entry, track reference or session generation cancels old
work and rejects its results before publication. PNG/JPEG artwork is limited to
2 MiB encoded and 1024×1024 RGBA decoded. Unsupported, invalid, oversized or
unavailable images render the artwork placeholder. HTTP and decoding stay off
the render loop; the renderer uploads one texture when the image changes.
Only same-origin artwork requests may carry the collection credential; external
image hosts receive no credentials, HTTPS downgrade is refused, and redirects
remain disabled. Player credentials never accompany artwork requests.
No backend endpoint gap was found for this client slice.

## Manual preview and captures

1. Start `just brick-preview --scenario playing`. Check the cover, 0:42 progress,
   title and persistent hints. Space pauses/resumes; Z/X change the fixture track;
   +/- changes **remote** volume. Leave the window focused to watch track timing.
2. Tab, Down, Enter opens Players. Down, Enter follows Studio without starting or
   stopping playback. Escape returns with Browse focus still on Players.
3. Open Playlists → After hours → Playlist actions. Choose Play now, cancel,
   then deliberately confirm replacement. Back to tracks, select one and choose
   Add to queue. Back restores focus. Warm-up selections demonstrates missing
   local audio; Sunday records is empty. Open Queue, select an entry and move or remove it.
   Check Clear queue cancellation before confirming; clearing also stops playback.
4. Cycle F1 through every scenario. Check empty/loading/error states, missing
   artwork, metadata clipping and unknown timing. Resize the window and try
   `--scale 0.5` and `--scale 2`.
5. Plug/unplug a mapped controller; repeat selection/back and playback controls.
   Defocus/refocus the window to exercise suspend/wake. Quit with Q, controller
   Back, or window close; no player playback command is issued.
6. Launch `--mode live` and confirm the connecting/error state, then check player list, fresh Now Playing,
   play/pause, volume and reconnect against a development player.

Scripted capture uses the same application action path with a frozen clock. It
runs without a display and exits after the requested number of frames:

```sh
just brick-preview --frames 1 --screenshot /tmp/brick-playing.bmp
SDL_VIDEODRIVER=dummy apps/groovenet-brick/build/groovenet-brick \
  --scenario metadata --frames 1 --screenshot /tmp/brick-metadata.bmp
SDL_VIDEODRIVER=dummy apps/groovenet-brick/build/groovenet-brick \
  --actions menu,down,select,down,select --frames 1 --screenshot /tmp/brick-players.bmp
# macOS conversion for sharing:
sips -s format png /tmp/brick-playing.bmp --out /tmp/brick-playing.png
```

`--actions` accepts the named driver tokens `up`, `down`, `left`, `right`,
`select`, `back`, `menu`, `play`, `previous`, `next`, `volume-down`, `volume-up`,
`scenario`, `suspend`, `wake`, `quit`. Actions run once before the first render;
`--frames N` freezes elapsed time and exits at N frames. BMP captures always
contain the 1024×768 logical canvas, independent of window scaling or host DPI.
Invalid arguments, missing fonts and unwritable screenshot paths fail visibly
with nonzero exit status.

Reference captures from the Mac build:

![Now Playing](screenshots/playing.png)
![Player selection](screenshots/players.png)
![Long and non-ASCII metadata](screenshots/metadata.png)

## Architecture and native validation

- `src/app.*`: SDL-independent application navigation, focus/back history,
  deterministic mock state and transport, timing, `DataAdapter` interface and
  mock adapter. `src/live.*` owns the native REST/SSE worker and bounded parser. It owns no audio, files or firmware calls.
- `src/renderer.*`: shared SDL2/SDL_ttf rendering of application state. The desktop
  launches it now; a device launcher will reuse it.
- `src/platform.hpp`: `Platform` contract for named input, config paths and battery.
  Suspend/wake/quit are named lifecycle actions. A Knulli adapter must translate
  verified device input and firmware lifecycle into this interface. It must use
  the existing firmware power integration and request fresh state on wake.
- `src/desktop.cpp`: argument parsing, desktop input, controller hotplug, config
  path/battery adapters, SDL window/resource lifetime, host clock and captures.
  Battery is explicitly unknown on desktop. Device storage, battery/power and
  launcher hooks must stay out of the reusable state/renderer.
- `src/main.cpp`: desktop entry point and visible argument/runtime errors.

`just brick-test` executes behavioral tests with CTest using SDL's dummy video
and audio drivers. They cover navigation/focus restoration, observational player
selection, transport, blocked commands, clock rollover/fractions, volume bounds,
scenario reset, live configuration, lifecycle, option validation, keyboard and
controller mapping (including ignored Power/local volume/repeats), SDL virtual
controller hotplug, real rendering of every scenario/shell, UTF-8, font failure,
invalid video driver, screenshot dimensions and write failures. They assert
behavior rather than reproducing coordinates or snapshotting layout.

`just brick-coverage` uses a separate Clang-instrumented build, runs tests and
production-entry smoke/error paths, and writes `build-coverage/coverage.lcov`.
The report maps the tested SDL implementation and the production entry object
once each, avoiding duplicate branches from instrumented and production copies.
It uses `xcrun llvm-cov`/`llvm-profdata` on macOS and the matching LLVM tools on
Linux, measuring all application/renderer/desktop/entry sources. Review uncovered
regions/branches as well as lines when adding logic. The fault harness compiles
the actual desktop/renderer sources under SDL wrappers to check allocation-error
unwinding, font/texture/surface failures, preference-path errors and graceful
controller-open failure without production test hooks. CI uploads this report under `brick-preview`,
independent of the experimental lifecycle probe's `brick-probe` report.

This is the real application code built for a desktop, **not hardware emulation**.
Desktop tests do not validate Knulli ABI/toolchain, raw button mappings, battery readings,
suspend/power ownership, Wi-Fi recovery, device font distribution or launcher
packaging. See [the hardware spike](PLATFORM-SPIKE.md) for the Knulli Scarab v1
selection and outstanding hardware checks, and #1102 for device release work.

The native TLS fixture is part of both `brick-test` and `brick-coverage`. It
creates ephemeral credentials/certificates and exercises real libcurl requests,
private CA/hostname failures, explicit insecure mode, separate authorization,
fragmented SSE, reconnect after EOF, cancelled idle streams, ambiguous writes,
revision conflicts and collection enrichment. It binds only to loopback and
requires permission to open a local listening socket. Unit tests additionally
exercise malformed data and worker/sequence/revision ordering.

For a live worker smoke test, provision a disposable named player `brick-smoke`
on a development worker, set `BRICK_URL` to that worker's root (this test talks
directly to worker paths), export its `BRICK_PLAYER_KEY`, then run
`build/brick-tests smoke`. It reads list/detail/SSE and renames **only** that
disposable player to `Brick live smoke verified`, checking the revision advanced.
It does not start playback or route speakers. Normal application live mode uses
the app origin and its `/api/players` proxy instead.

Live smoke recorded 2026-11-07 on macOS: the native client read list/detail and
SSE from the production worker implementation backed by a disposable Postgres,
then renamed the disposable `brick-smoke` player and observed revision 0 → 1.
The worker and database were removed afterward. No OwnTone engine or speaker was
attached; playback/output and physical-device qualification remain separate.

### Selected-player validation (#1098)

`just brick-test` includes a real loopback TLS server plus two native workers.
It checks explicit selection, persisted identity and server scoping, missing
players without fallback, conflicting/ambiguous writes, metadata superseded by
a new track, image validation/bounds, credential isolation across artwork
origins, acknowledgment input and non-destructive disconnect. `just
brick-coverage` measures the same production sources, including image decoding
and SDL texture-allocation/upload failure paths.

After `just build-packages` and `just brick-build`, run the opt-in development
smoke from the repository root:

```sh
mise exec -- node apps/groovenet-brick/tests/development_smoke.mjs
```

It requires Docker and the `postgres:17-alpine` image. It creates and removes its
own database/container, applies the player migrations, and runs the production
player manager/store/HTTP/SSE with a silent in-memory audio backend. A second
REST controller pauses, renames and changes volume while the Brick observes;
the Brick resumes, skips and changes volume, refreshes on wake, restores its
remembered selection and exits while the server retains playback and its queue.
This passed on macOS on 2026-11-07. No physical speaker or device lifecycle is
validated by this smoke; those remain under #1102 and the selected firmware
adapter. See [validation evidence](evidence/now-playing-1098.md).

### Saved playlists (#1099)

Collection browsing has its own cancellable worker, independent of player SSE
and current-track artwork. Existing collection APIs return complete lists rather
than server pagination: responses are capped at 2 MiB, lists at 1,000 playlists
and details at 1,000 track refs. Larger collections fail visibly instead of
silently truncating or replacing a queue with a partial playlist. Track metadata
loads in explicit pages of 25 using one batch API request per page. Responses may
be unordered and deduplicated; saved order, composite identity and repeated tracks
are preserved. Failed detail or metadata requests offer **Retry loading playlist**
or **Retry loading tracks**, without discarding the saved refs or prior page.
Each request retains the existing deadlines; navigation and cancellation remain
available while loading. No API changes or new credentials are required.

Tracks are sorted by saved position and keep both track ID and friend ID. A
missing batch row or missing local audio is shown as unplayable, and blocks an
action containing that known track. Whole-playlist actions include every saved
reference, including metadata pages not yet visited; the server validates those
unchecked references atomically and may reject the playlist. No track is silently
skipped. Collection authorization/offline errors appear in the browse status and
do not disable the selected player's controls.

Play now sends one revision-guarded `queue.replace` with `play: true`; Add to queue
sends one `queue.add` without a playback flag. Replacement confirmation is bound
to the selected player, worker identity and revision. A changed state requires a
fresh deliberate action. Neither conflict nor lost response is automatically
retried; review the refreshed shared queue before retrying. Output/takeover
warnings offer the same explicit one-time approval as Now Playing; cancellation
sends no command and never changes the configured availability policy.

![Saved playlist tracks](screenshots/playlist-tracks.png)
![Replacement confirmation](screenshots/playlist-replace.png)

Validation includes native navigation/rendering, bounded loading, composite
identity/order, empty and missing audio, collection errors, concurrent revisions,
server rejection and ambiguous writes. The development smoke also stops the
player, verifies append stays idle, starts a saved playlist and appends a track
while an independent REST controller observes the shared queue. See
[evidence](evidence/playlists-1099.md). Physical playback/device qualification
remains under #1102.

### Shared queue (#1100)

![Shared queue](screenshots/queue.png)

Queue rows keep the server entry UUID separately from track identity, so repeated
copies of a track can be played, removed and moved independently. Focus follows
that UUID across snapshots and reorders, including while entry actions are open.
Removing the focused entry selects its successor or the last remaining entry;
changing players resets queue focus. Retained disconnected queues remain browsable.

Opening entry actions or clear confirmation captures the selected player, worker,
revision and subscription identity. A changed revision or reconnect invalidates
that action. Each mutation sends `expected_revision` and is attempted once, with
retained confirmed rows and a pending status until a fresh SSE snapshot arrives.
Conflict, lost response and timeout refresh state without retrying the write.
Playback uses the existing speaker availability/takeover acknowledgment; a separate
confirmed Play desired output action in Outputs can grant takeover or unknown
availability for that request.

Validation covers duplicate tracks, current/focused removal, reordering, long
queues, remote edits, clear cancellation, revision conflicts, reconnects, lost
responses and the real eight-second HTTP timeout. The development smoke exercises
a native controller and independent REST controller against the production player
manager and disposable Postgres, using a silent backend. See
[queue validation evidence](evidence/queue-1100.md). Physical speaker/device
qualification remains under #1102.

### Player outputs (#1101)

![Output observations and assignments](screenshots/outputs.png)
![Explicit transfer confirmation](screenshots/output-transfer.png)

Outputs uses `GET /api/players/{id}/devices` and the player list. A separate
cancellable read worker refreshes discovery every two seconds after the first
visit; it never interrupts SSE or writes a command. Idle/occupied/unknown are
observations, desired outputs are preferences, and assigned players are active
claims. Missing desired outputs and discovery errors remain visible. Focus
follows output identity across discovery reordering.

Each confirmation captures the selected player revision, worker/subscription,
discovered output identity and source revision. Transfers send `output.transfer`
with both revisions and `play: false`. The confirmation names both affected
players and explains that playback will not start. Partial results display source
detachment, target attachment and a classified error, then refresh actual
assignments. No rollback, retry or optimistic assignment is invented.

Selecting a desired output and playing it are separate actions. The initial play
request uses the existing server policy; each API approval response requires
another deliberate confirmation, defaulting to Cancel. Occupied-speaker and
engine-takeover prompts explicitly warn about interrupting existing playback.
Changing selection, reconnecting, waking or changing discovery invalidates stale
actions and approvals. This client selects one output, with no multi-room mode.

See [validation evidence](evidence/outputs-1101.md) for fixture, coverage and
production-manager smoke results and the remaining physical-receiver check.
