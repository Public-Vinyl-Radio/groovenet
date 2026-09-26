# @groovenet/cli

Terminal client for the collection. Binary is `groovenet`; published to npm and
globally installable. All HTTP goes through `@groovenet/client`.

## Configuration

`~/.groovenet/config.json`, managed by the CLI:

```bash
groovenet config set api_base https://groovenet.home.arpa/api
groovenet config show
```

Keys: `api_base`, `api_key`, `default_friend_id`, `username`, `insecure_tls`.

## Commands

```
config              set | show
tracks              search | show | update | missing-apple-music | deleted
                    restore | recommend | similar-identity | similar-vibe
albums              list | show | update | download
playlists           list | show | create | generate
friends             list | add
fingerprint-library (no subcommands — scope flags)
vinyl               status | detections | ingests | aggregate
sets                derive | show
```

**Every command takes `--json`.** Use it for anything programmatic — the default
output is a formatted table with ANSI colour that is painful to parse.

## Layout

```
src/
  bin/         entrypoint, commander wiring
  commands/    one file per group: tracks, albums, playlists, friends, play,
               config, fingerprintLibrary, vinyl, sets
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

## Build

```bash
npm run build --workspace=packages/groovenet-client   # first
npm run build --workspace=packages/groovenet-cli
node build/bin/groovenet.js --help
```

## Tests

```bash
npm test --workspace=packages/groovenet-cli      # 46 tests
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
- No eslint config here either; see issue #253.
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
