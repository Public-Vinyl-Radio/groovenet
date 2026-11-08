# Groovenet Brick desktop preview

The native C++17/SDL2 application foundation for #1096. Desktop and future device
launchers share the application, data-adapter interface and SDL renderer. This
preview has deterministic mock data and navigation shells; it does not play audio.

## Host setup and commands

Supported development host: macOS with Xcode command-line tools and Homebrew.
Linux CI uses Ubuntu 24.04 with SDL's dummy video driver.

```sh
brew install cmake pkg-config sdl2 sdl2_ttf
just brick-preview
just brick-preview --scale 0.75 --scenario metadata
just brick-test
just brick-coverage
```

Linux dependencies: `cmake clang llvm pkg-config libsdl2-dev libsdl2-ttf-dev
fonts-dejavu-core`. Requires SDL2 and SDL2_ttf >= 2.0.18, CMake >= 3.20 and a C++17
compiler. Native dependencies are independent: existing npm bootstrap, builds and
tests do not invoke CMake or require SDL. Build output stays in this directory's
ignored `build/` and `build-coverage/` directories.

The default font is system Arial on macOS and DejaVu Sans on Linux. Override with
`--font /absolute/path/font.ttf` for another host or script. Supply a font with
appropriate glyph coverage for the metadata languages you need; SDL_ttf renders
UTF-8, but a font cannot render glyphs it does not contain. No system font is
copied into the repository or distributed as an application asset.

## Display and input

The logical canvas is **1024×768**, matching the Brick panel documented in the
[TRIMUI Brick TG3040 manual](https://ae-pic-a1.aliexpress-media.com/kf/S708858c6482e484a8670e62d58ae775dM.pdf).
`--scale 0.5` through `--scale 3` changes the initial window size; resizing
letterboxes the same logical canvas, including on Retina displays. The #1095
probe used a 640×480 test canvas, not the panel's native dimensions. On-device
qualification of this application remains part of #1102.

| Named action                 | Keyboard                | SDL game controller               |
| ---------------------------- | ----------------------- | --------------------------------- |
| Focus up/down                | Arrow up/down           | D-pad up/down                     |
| Select                       | Enter                   | A                                 |
| Back                         | Escape                  | B                                 |
| Browse menu                  | Tab                     | Start                             |
| Play/pause                   | Space                   | Y                                 |
| Previous/next                | Arrow left/right or Z/X | D-pad left/right or shoulders L/R |
| Remote player volume down/up | Minus/plus (or equals)  | Left/right stick click (L3/R3)    |
| Cycle mock scenario          | F1 (Fn-F1 on some Macs) | Use CLI scenario at launch        |
| Quit preview                 | Q or window close       | Back/Select button                |

These are SDL semantic controller positions, not guesses about Knulli raw button
IDs. SDL-recognized controllers work at startup and can be connected/disconnected
while running. Unrecognized controllers need an SDL mapping supplied by the host
(for example `SDL_GAMECONTROLLERCONFIG`); analog sticks are not required for
navigation. Keyboard repeat is ignored to avoid repeated playback commands.

**Remote volume** affects only the selected mock server player's 0–100 level in
steps of five. OS multimedia volume keys and Power are never mapped to server
volume, pause or stop. **Local device volume** belongs to the firmware/OS adapter
and has no application command here. Nothing essential requires mouse input.

Tab opens Browse with Now Playing, Players, Playlists, Queue and Outputs. Focus
wraps within each list and is remembered per screen. Enter selects, Escape
returns to the previous screen, and Escape at the initial Now Playing screen
stays there. Selecting a player is observational and leaves playback unchanged.
Playlist, queue and output rows are navigation shells; selecting them displays a
notice rather than pretending to send a server mutation. Their commands follow
in #1099–1101. Button hints remain visible on every screen.

Losing window focus simulates a suspended UI; focus gain requests an adapter
refresh. Quit, suspend and wake never issue playback commands. The mock clock
pauses while the preview is suspended. A real server's clock/playback will keep
running; the live adapter must replace local state with a fresh snapshot on wake.

## Mock scenarios and live configuration

`--mode mock` is the default. F1 cycles through this fixed sequence, resetting
the fixture and all list focus, without using randomness or network requests:

| `--scenario`      | Fixture                                                  |
| ----------------- | -------------------------------------------------------- |
| `playing`         | Lounge playing a three-track queue at 0:42, volume 55    |
| `paused`          | Same queue, stopped clock; Space resumes                 |
| `empty`           | Empty queue; playback commands have no effect            |
| `loading`         | Loading message; transport/volume disabled               |
| `disconnected`    | Disconnected with retained metadata; commands disabled   |
| `unavailable`     | Selected player unavailable; commands disabled           |
| `metadata`        | Long title and accented UTF-8 artist/album metadata      |
| `missing-artwork` | Explicit artwork fallback                                |
| `unknown-timing`  | Unknown duration, no progress fraction or invented total |

The playing clock advances from elapsed milliseconds; track end, Next and
Previous rotate the fixture queue and reset timing. Long text is clipped at a
fixed readable size with a continuation mark, without splitting UTF-8 bytes.
The artwork fixture is deterministic SDL geometry, requiring no downloaded files.

`just brick-preview --mode live` selects the live adapter seam and displays
“Live client pending #1097 · no connection”. It does not fall back to mock data,
read credentials, access the network or claim to control a player. #1097 owns
REST/SSE, authentication, trust, reconnect and configuration persistence. The
platform interface provides a config directory; the desktop implementation uses
SDL's per-user `Groovenet/Brick` preference path. This foundation writes no
configuration. Tests may create that empty directory through SDL_GetPrefPath.

## Manual preview and captures

1. Start `just brick-preview --scenario playing`. Check the cover, 0:42 progress,
   title and persistent hints. Space pauses/resumes; Z/X change the fixture track;
   +/- changes **remote** volume. Leave the window focused to watch track timing.
2. Tab, Down, Enter opens Players. Down, Enter follows Studio without starting or
   stopping playback. Escape returns with Browse focus still on Players.
3. Visit Playlists, Queue and Outputs with the same controls. Confirm each shell
   shows a focused row and returns consistently. Selecting a row shows its scope
   notice; it never alters speaker routing or starts a playlist.
4. Cycle F1 through every scenario. Check empty/loading/error states, missing
   artwork, metadata clipping and unknown timing. Resize the window and try
   `--scale 0.5` and `--scale 2`.
5. Plug/unplug a mapped controller; repeat selection/back and playback controls.
   Defocus/refocus the window to exercise suspend/wake. Quit with Q, controller
   Back, or window close; no player playback command is issued.
6. Launch `--mode live` and confirm the pending-client state is visibly distinct.

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
  explicit pending-live adapter. It owns no audio, files or firmware calls.
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
scenario reset, pending live mode, lifecycle, option validation, keyboard and
controller mapping (including ignored Power/local volume/repeats), SDL virtual
controller hotplug, real rendering of every scenario/shell, UTF-8, font failure,
invalid video driver, screenshot dimensions and write failures. They assert
behavior rather than reproducing coordinates or snapshotting layout.

`just brick-coverage` uses a separate Clang-instrumented build, runs tests and
production-entry smoke/error paths, and writes `build-coverage/coverage.lcov`.
It uses `xcrun llvm-cov`/`llvm-profdata` on macOS and the matching LLVM tools on
Linux, measuring all application/renderer/desktop/entry sources. Review uncovered
regions/branches as well as lines when adding logic. The fault harness compiles
the actual desktop/renderer sources under SDL wrappers to check allocation-error
unwinding, font/texture/surface failures, preference-path errors and graceful
controller-open failure without production test hooks. CI uploads this report under `brick-preview`,
independent of the experimental lifecycle probe's `brick-probe` report.

This is the real application code built for a desktop, **not hardware emulation**.
It does not validate Knulli ABI/toolchain, raw button mappings, battery readings,
suspend/power ownership, Wi-Fi recovery, device font distribution or launcher
packaging. See [the hardware spike](PLATFORM-SPIKE.md) for the Knulli Scarab v1
selection and outstanding hardware checks, and #1102 for device release work.
