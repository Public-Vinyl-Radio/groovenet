# Lossless ALAC downloads with gamdl (spike, #1147)

## Owner runbook — step 1

**End-to-end not yet verified.** Automated checks use generated audio, fake build
commands and a localhost HTTP Wrapper v2 stub. No Apple ID, APK, real wrapper,
production stack or real device was used. The owner performs the hands-on build,
first sign-in and real download check **on or after 2026-12-03**.

### Build and start

Supply an authorized Apple Music **3.6.0-beta, build 1109** `.apk` or `.apkm`, kept
outside this repository. The owner's `.apkm` contains both `x86_64` and
`arm64_v8a` splits; the build selects and verifies the matching libraries.

#### Apple Silicon Mac — local worktree

With Docker Desktop running, from this checkout:

```bash
just wrapper-build ~/path/to.apkm
just worktree-up --profile downloads,lossless
just wrapper-login
just wrapper-status
```

The build defaults to `uname -m`, mapping macOS `arm64` to upstream's `aarch64`
alias. It produces `wrapper-v2:1.0.0-local-arm64`. The worktree flow applies
`docker-compose.mac.yml`, selecting this image and `linux/arm64` for the wrapper
and download worker without extra environment settings. The wrapper runs an ARM64
worker; upstream's Docker build still uses an x86-64 NDK builder stage, which
Docker Desktop can emulate. No local Android NDK or Rust toolchain is needed.

#### Beelink — amd64 production path

Never start the sidecar with a hand-typed `docker compose` on beelink: without
`-p dj-playlist` Compose can name the project after the directory (`groovenet`)
and create a second stack beside production. Go through `just deploy`, which
pins the project name, and keep `lossless` in the deployed `.env`:

1. Deploy the release that contains the wrapper tooling as usual, still
   without `lossless`, so the stack directory checks out the new scripts:
   `just deploy vX.Y.Z`.
2. Copy the package to beelink **outside** `/srv/docker/groovenet`, then build
   the private amd64 image there. It is never pushed:

   ```bash
   ssh beelink
   cd /srv/docker/groovenet
   ./scripts/wrapper/build.sh ~/wrapper/apple-music.apkm --arch x86_64
   docker image inspect wrapper-v2:1.0.0-local-amd64 --format '{{.Id}}'
   ```

3. Enable the profile where deploys read it. `COMPOSE_PROFILES` unset means
   `all`, which excludes `lossless`, and every deploy re-renders beelink's
   `.env` from `.env.tpl`, so a one-off variable would be lost. Set
   `COMPOSE_PROFILES=all,lossless` in `.env.tpl`, then run `just deploy vX.Y.Z`
   again. Do this only after step 2: the service uses `pull_policy: never`, so
   a deploy with `lossless` and no local image fails.
4. Sign in from the stack directory, in an interactive terminal (`ssh -t`).
   The new beelink volume is empty, so the patched build generates the fresh
   device fingerprint on its own; `GAMDL_WRAPPER_SESSION_VOLUME` is not needed:

   ```bash
   ssh -t beelink 'cd /srv/docker/groovenet && ./scripts/wrapper/session.sh login'
   ssh beelink 'cd /srv/docker/groovenet && ./scripts/wrapper/session.sh status'   # Wrapper v2 1.0.0 x86_64: signed in
   ```

   A non-interactive `ssh beelink "..."` has no `just` on its PATH, so these
   steps call the scripts directly. `ssh -t` needs a real terminal; it does not
   work from Claude Code's `!` prompt.

   Enable the profile in the host-local `.env.host`, not in `.env`: `just deploy`
   overwrites the host's `.env` with one rendered on the deploying machine.
   Copy `.env.host.example` to `.env.host` in `/srv/docker/groovenet` on the host
   and set `COMPOSE_PROFILES=all,lossless`. Deploys never touch that file, and
   `deploy-prod.sh` stops before pulling anything if the wrapper image above is
   missing.

5. Set Settings → Apple Music → Download quality to **Lossless** for the
   library, download one track, and confirm its file is FLAC.

To roll back, drop `lossless` from `COMPOSE_PROFILES` and redeploy. Lossless
requests then use AAC again. Keep the session volume.

The base Compose file retains the amd64 image and `linux/amd64` defaults.
For an amd64 scratch worktree, use `just worktree-up --profile downloads,lossless`
instead of the production Compose command. Perform the end-to-end checks below
only in a scratch worktree. These are owner commands; agents must not run real
builds, sign-ins or production operations.

`wrapper-build` clones **tag 1.0.0 exactly** from
[glomatico/wrapper-v2](https://github.com/glomatico/wrapper-v2/tree/1.0.0) into a
scratch directory under `/tmp`, verifies the exact tag, and runs upstream
`tools/build-docker.sh <package> --arch <architecture>`. The optional
`--arch x86_64|aarch64` overrides host detection; upstream also calls ARM64
`arm64-v8a`. Unsupported targets fail before cloning or building. The helper handles the isolated
BuildKit package context; our script never copies the package into the checkout
or normal source context. Scratch source is removed on exit. The resulting
`wrapper-v2:1.0.0-local-amd64` or `wrapper-v2:1.0.0-local-arm64` image contains
proprietary Apple libraries: keep
it local, never push/export it into the repository, an issue or a PR.

#### ARM64 compatibility on newer Mac VM kernels

ARM64 builds apply the local source patch in
`scripts/wrapper/compat/explicit-symbol-scopes.patch` after checking the exact
upstream **1.0.0** tag. The standalone helper is
`scripts/wrapper/compat/symbol_lookup.hpp`. amd64 builds do not get this patch.
A patch that no longer applies aborts the build; do not bypass that check.

The bundled API 22 Android linker crashes when a global
`dlsym(RTLD_DEFAULT, ...)` lookup reaches a kernel vDSO with only a GNU hash table.
This was reproduced on the local ARM64 VM kernel 6.18.58. The workaround retains
explicit handles for the main executable and five already-loaded Apple libraries
and searches those handles and their dependency scopes. It avoids the global vDSO
lookup without changing the pinned Android binaries, Apple libraries, protocol,
capabilities or saved identity/session format. Handles live until worker exit.

Rebuild an existing ARM64 image with the same owner command, then let Compose
recreate the sidecar from its new image ID:

```bash
just wrapper-build ~/path/to.apkm
just worktree-up --profile downloads,lossless
just wrapper-login
just wrapper-status
```

Preserve the named session/identity volume. A successful status says
`Wrapper v2 1.0.0 arm64-v8a: signed in`. While verifying a real lossless download,
disable **Retry lossless failures as AAC** so fallback cannot hide a wrapper error,
and confirm ALAC input becomes a final FLAC file rather than an AAC result.

Validation boundary: fake git/build helpers check ARM64-only patch application,
source drift rejection and scratch cleanup. A standalone C++ test compiles only
the public lookup helper against a fake loader that rejects global lookups. An
isolated, network-disabled debugger probe using the existing image and synthetic
session state validated the explicit-handle lookup strategy through native
initialization. The patched source has **not** been built into a real wrapper by
an agent; owner rebuild, real sign-in and Apple downloads remain unverified.

#### Fresh-login device fingerprint (both architectures)

Every build also applies `scripts/wrapper/compat/fresh-device-fingerprint.patch`.
It is a backport of `src/device_info.rs` only from upstream
[PR #24](https://github.com/glomatico/wrapper-v2/pull/24) (head `6918066`, still
open), for [issue #23](https://github.com/glomatico/wrapper-v2/issues/23). The
issue's symptom matches ours: `authentication_failed` at `native_response`, with
response type 4, one credential callback and no 2FA prompt. The PR's unrelated
profile, metadata and builder changes are not taken. Newly generated identities
use `Music/5.0.2/Android/10/Pixel 8/7663314/en-US/en-US/` plus a 16-hex
(64-bit) Android ID instead of `Music/4.9/Android/10/Samsung S9/7663313/...`
plus 32 hex. Explicit `WRAPPER_DEVICE_INFO` overrides and every stored
`.wrapper-device-info`/`.worker-device` identity are preserved: nothing is
migrated or rotated.

Because stored identities are kept, rebuilding alone does not change a volume
that already holds an identity generated by the unpatched build. To try the new
fingerprint, opt this worktree into a second, empty session volume. Your
original `gamdl_wrapper_session` volume stays intact and remains the default.
The setting lives in the worktree env file, so it persists across
`just worktree-up`:

```bash
just wrapper-build ~/path/to.apkm
env_file="$(ls .worktree/*.env)"   # this worktree's single env file
grep -q '^GAMDL_WRAPPER_SESSION_VOLUME=' "$env_file" ||
  printf 'GAMDL_WRAPPER_SESSION_VOLUME=gamdl_wrapper_session_fresh\n' >>"$env_file"
just worktree-up --profile downloads,lossless
just wrapper-login
just wrapper-status
```

Only the declared `gamdl_wrapper_session` and `gamdl_wrapper_session_fresh` keys
are accepted. Any other value makes Compose refuse the project rather than
create an arbitrary volume. To return to the original session, delete that line
and rerun `just worktree-up --profile downloads,lossless`. Delete neither volume.
Leaving the variable unset gives byte-identical `docker compose config` output.
Do not retry sign-in repeatedly if it still fails; capture only the whitelisted
`session.auth_diagnostic` fields.

Validation boundary: an agent applied the backport to public tag 1.0.0 and
confirmed it reproduces the PR's reviewed file (blob `b9d09b7`).
`scripts/wrapper/check-device-patch.sh`, also run in CI, compiles that file
standalone and passes upstream's own tests, including that legacy identities are
never rewritten. Upstream reports amd64 login, 2FA, restore, playback and keys
working with this fingerprint. The report changed the client tuple and ID length
together, so their separate effects are unknown. ARM64 sign-in with it, and real
lossless downloads, are **unverified** until the owner runs the steps above.

`lossless` is opt-in and excluded from `all`. `just worktree-up --profile downloads
--profile lossless` also works after building. The sidecar has no published port,
uses the selected architecture (`linux/amd64` by default), init and a read-only root, and persists session **and device
identity** in the named `gamdl_wrapper_session` volume (or the opt-in
`gamdl_wrapper_session_fresh`, above). Do not delete either volume
when resolving an expired session. It uses precisely the
[1.0.0 upstream Compose capabilities](https://github.com/glomatico/wrapper-v2/blob/1.0.0/compose.yaml):
`SYS_ADMIN` for namespaces/mounts and `SYS_CHROOT` for the Android chroot, with
AppArmor unconfined. It drops all other capabilities. The older `SYS_PTRACE`
requirement is obsolete. `no-new-privileges` must be absent so the non-root
launcher's file capabilities work; the hardening checker validates this narrow
exception. These elevated privileges are a reason to keep the service opt-in.

The worker defaults to `http://gamdl-wrapper:80` only when `COMPOSE_PROFILES`
contains `lossless`; `GAMDL_WRAPPER_URL` overrides it. Direct Compose users must
set `COMPOSE_PROFILES=downloads,lossless` or an explicit URL: CLI `--profile` alone
does not pass that setting into container environments. Never expose the HTTP
API: `/session/credentials` exports account tokens to trusted clients.

### First sign-in, 2FA and expired sessions

`just wrapper-login` runs the login client inside the existing download worker
with an explicit Docker TTY (`docker exec -it`). It bypasses Compose/1Password
injection so output-masking pipes cannot remove the hidden-input terminal; the
worker already has its configured environment. Run it from an interactive
terminal, without piping or redirecting it. Status uses a non-TTY exec and works
unattended. Enter the
Apple ID and password at the hidden terminal prompts, then the six-digit 2FA
code if requested. Input stays in process memory: no shell arguments, environment
variables, files or request bodies are printed. Do not run it under command/body
tracing or record the terminal. Login calls `/session/login`, then
`/session/challenge` after HTTP 202. `just wrapper-status` checks `/info` and
`/session` and prints only compatibility/readiness and signed-in state, never
raw responses or tokens. The worker never invokes the login endpoints.

On restart the wrapper restores its saved session. The worker also requests
`/session/restore` if `/session` is logged out. When Apple expires it, status or a
lossless job explains that sign-in is needed: run `just wrapper-login`, complete
2FA again, then `just wrapper-status` and retry. Session lifetime remains
unmeasured. Do not paste credentials, session databases, APKs or token responses
into logs, git, issues or PRs, and do not delete the identity volume to force a
login.

### Quality, cap and fallback

Settings → Apple Music applies to the selected library. Default quality remains
AAC. Lossless is stored as FLAC; the removed `audio_format` setting never affected
gamdl downloads. `sample_rate_cap` defaults to **48 kHz** (choices 44.1, 48, 96,
192). gamdl 4.1.1 can choose the `alac-lossless` (up to 48 kHz) or `alac-hires`
tier, but cannot impose an arbitrary sample-rate ceiling. The worker requests
the appropriate tiers, then downsamples during FLAC conversion only if needed.
At or below the cap, conversion is bit-exact. Downsampling deliberately changes
the PCM while preserving the original bit depth and all tags/covers.

`lossless_fallback` defaults **yes**: a failed lossless attempt (including missing
or expired wrapper session) retries once as AAC with browser cookies, with a
job-log entry. A track without an ALAC variant also falls through gamdl's codec
priority to AAC. Disable the setting to fail on a lossless attempt error instead
of retrying; per-track codec availability fallback still applies. Without a
configured wrapper, lossless requests use AAC as before. AAC requires valid
browser cookies independently of the wrapper. Startup readiness warns but keeps
the worker available for AAC; each lossless session repeats the compatibility
(version 1.0.0, protocol 1, exact supported profile matching the worker's
architecture) and authentication checks.

### Remaining owner end-to-end check

After `just wrapper-build ~/path/to.apkm`, profile activation and
`just wrapper-login`, confirm `just wrapper-status` is signed in. In the
worktree, use a scratch audio volume instead of the shared music directory and:

1. Download one known lossless song, then an album through the worker. Record
   job success, elapsed time, file sizes and sanitized codec/cap outcomes.
2. Confirm final `local_audio_url=.flac`, `audio_codec=flac`,
   `audio_lossless=true`, depth and sample rate match ffprobe. Check tags and
   cover, Chromium playback and File info, analysis completion and fingerprint
   indexing/re-indexing. Compare decoded PCM at the same rate when checking
   bit-exact conversion; a deliberate cap downsample will differ.
3. Check a track with no ALAC, an unavailable/signed-out stub wrapper with AAC
   retry on and off, and a restart preserving the named session/identity volume.
4. Update this runbook with sanitized results and remove the unverified marker
   only after a real download has completed. Do not test against production.

### Account and operational risks

The spike recorded [gamdl #356](https://github.com/glomatico/gamdl/issues/356):
wrapper login reported an account disabled while Apple Music still worked. The
impact on the wider Apple ID is unknown; do not assume only wrapper access can
be lost. Prefer a dedicated Apple ID, for example an eligible **Family member
account** with its own Music access, rather than the household organizer or an
account holding important purchases/data. Use only an account and package you
are authorized to use. Wrapper 1.0.0 persists a generated per-install device
identity; the old spike's shared-device description is historical.

Both wrapper and gamdl are brittle dependencies on Apple's private behavior.
Keep gamdl 4.1.1 and Wrapper v2 1.0.0 paired; mismatches fail readiness. Elevated
container capabilities, private token-exporting HTTP and locally embedded Apple
libraries need a trusted Docker host and restricted image/session access.
Session expiry, real throughput, real ALAC availability and account behavior
remain unverified. Nothing in these stub/generated-audio checks establishes
that the Apple download path works end to end.

## FLAC storage (step 1)

The gamdl Python API result is converted from ALAC to FLAC before publishing
`local_audio_url`. AAC stays unchanged. The converter uses `ffmpeg -c:a flac`
with resampling only above the configured cap, preserves ordinary tags as Vorbis comments and each embedded
picture byte-for-byte, and stores every non-cover MP4 tag in the typed JSON
Vorbis comment `GROOVENET_MP4_TAGS` (binary freeform values are base64). This
archive preserves fields that have no standard Vorbis equivalent.

The worker verifies the saved FLAC's sample rate, bit depth, channels, tag archive
and covers, then atomically publishes it and removes the temporary ALAC. Keeping
both encodings doubles storage without helping browser playback. On conversion
failure the ALAC is retained; the AAC retry setting determines the job outcome. The app probes the final FLAC on
its existing track-update path, so codec, lossless, depth and rate describe the
served file. `.flac` already has `audio/flac` and range support in `/api/audio`.
Changing the URL queues fingerprint indexing; the different SHA-256 also causes
`needs_index` to rebuild an existing reference.

Checks use generated audio, never account data: `uv run --group dev pytest
 tests/test_lossless.py` in download-worker checks 24/96 PCM MD5, every original
tag, covers and failure cleanup. `just lossless-test` uses the current worktree's
`downloads` and `fingerprint` services and scratch `/tmp` files to check the actual
converter, Essentia, Chromaprint and the SHA-256 re-index decision. It never writes
the shared music volume. `RUN_E2E_TESTS=1 E2E_BASE_URL=http://localhost:<worktree-port>
npm run test:e2e --prefix my-collection-search -- audio-codec.spec.ts` checks
Chromium playback and FLAC 24-bit File info in both layouts.

**Real Apple/wrapper end-to-end downloads are not yet verified.**

## AAC kept beside the FLAC (#1310)

A track can have two files: `<track_id>.flac` (the lossless master) and
`<track_id>.m4a` (a small AAC copy). Both are linked to the track.

- **Primary vs alternate.** `tracks.local_audio_url` is the primary file and
  every consumer reads it: web player, OwnTone server players, Essentia
  analysis, fingerprint indexing, exports. FLAC is primary when it exists, so
  only one file per track is analysed or fingerprinted. Other formats are
  alternates in `track_audio_files` (codec, container, lossless, size per file,
  so backups can pick files by format, #1311). They are the
  fallback for a client that can't decode FLAC.
- **Downloads.** A lossless download keeps an AAC already beside it and links it
  (`alternate_audio_url` on `PATCH /api/tracks`); it does not fetch a second AAC.
  An AAC download for a track that already has a FLAC links the new `.m4a` as
  the alternate and leaves the FLAC primary, so a re-download never clobbers it.
  See `plan_audio_links` in `worker/jobs/download.py`.
- **API and UI.** `GET /api/tracks/{id}` and the `PATCH` response carry
  `audio_files` (primary first); the track's file info lists "Also stored".
  The orphan scan treats linked alternates as referenced.
- **Backfill.** `groovenet files alternates` (`POST /api/tracks/audio-files/backfill`)
  links every `<stem>.m4a` that sits beside a linked `<stem>.flac`. It runs in
  the app, which has the audio volume. Idempotent.
- **Deleting.** Nothing in the app deletes audio files. Deleting a track row
  removes its alternate links; the files are left for the orphan scan to list.

## Backing up lossless files (#1311)

FLACs are large and re-downloadable, so the remote backup **excludes them by
default** and keeps the AAC. They are backed up to an optional **local disk**
instead, a second restic repository with its own include policy, snapshots and
retention. Which files are lossless comes from the per-file format in
`track_audio_files` and the track's own record, so an ALAC `.m4a` counts as
lossless; the extension is used only for files with no recorded format.

- **Set up.** Mount a disk on the host, create `.groovenet-backup-disk` on it,
  then set `LOCAL_BACKUP_PATH` and `LOCAL_BACKUP_RESTIC_PASSWORD` in `.env.host`.
  Unset means no local target. Step by step: [Backups](../../docs/configuration/integrations.md#adding-a-local-backup-disk).
- **Safe by construction.** Every run checks the marker and that the path is a
  separate device, and writes nothing if either fails; the System page says why.
- **Restore.** `restic restore latest --include '**/*.flac'` against the local
  repository; see [Restoring FLACs](../../docs/configuration/integrations.md#restoring-flacs-from-the-local-repository).
- **If the host and the disk both fail,** the FLACs are gone but can be
  downloaded again; the AAC copies, database and covers are in the remote.

## Historical spike

Can download-worker fetch Apple Music tracks as lossless ALAC with gamdl
3.9.1, and what would it take on the homelab? Written 2026-11-09 against
`main` at `95d89abf`.

**Recommendation: go behind a setting.** Keep AAC as the default and make
lossless opt-in. Before building anything, one person has to run a manual
validation with a real Apple ID and get it to work (see "Not verified"). Store
the result as **FLAC, not ALAC.** Chrome and Firefox will not play ALAC at all.
Converting ALAC to FLAC is bit-exact, and FLAC plays in every browser we tested.

## What was and was not verified

| Question                                                | How it was answered                                   |
| ------------------------------------------------------- | ----------------------------------------------------- |
| 1. Wrapper project, protocol, runtime                   | Read gamdl 3.9.1 and wrapper-v2 0.0.2 source/docs     |
| 2. Real song and album end to end                       | **Not verified**: no Apple ID or Apple Music APK here |
| 3. Size                                                 | Collection hours from the seed DB, times bitrates     |
| 3. Speed                                                | **Not verified** (needs 2)                            |
| 4. ffprobe, app metadata, essentia, fingerprint, sha256 | Run in the worktree stack on synthetic ALAC files     |
| 5. Browser playback                                     | Playwright: real Chrome, Firefox, WebKit              |
| 6. Account and brittleness risk                         | gamdl and wrapper-v2 issue trackers and releases      |

The test audio was a 60 s synthetic signal: an A major chord plus a 120 BPM
kick. It was encoded with ffmpeg as ALAC 16/44.1, ALAC 24/96 and AAC 256k. That
is the same container and codec gamdl writes, so it answers "does X accept
ALAC .m4a". It does not answer "is a real Apple ALAC file different in some
way". The files were run inside each container's `/tmp`. The worktree's
`/app/audio` is a bind mount of the shared `~/groovenet-music` folder, not a
scratch volume, so nothing was written there.

## 1. The wrapper

- **Project.** gamdl 3.9.1 supports only
  [glomatico/wrapper-v2](https://github.com/glomatico/wrapper-v2) (gamdl 3.6
  dropped the original wrapper). It pins the API version exactly:
  `TARGET_WRAPPER_API_VERSION = "0.0.2"` in `gamdl/api/wrapper.py`. It checks
  `GET /me`, and any other version is refused with "Unsupported wrapper-v2 API
  version".
- **Protocol.** HTTP JSON on port 80 handles account and playback (`GET /me`,
  `POST /login`, `POST /login/2fa`, `GET /playback?adam_id=`). A raw TCP port,
  10020, handles FairPlay sample decryption using a versioned "WV2D" batch
  framing. gamdl's flags are `--use-wrapper`, `--wrapper-url`,
  `--wrapper-decrypt-host` and `--wrapper-decrypt-port`. gamdl defaults the
  decrypt host to `127.0.0.1`, which is wrong for a sidecar container.
- **What it is.** A Rust supervisor that runs Apple Music for Android's own
  native libraries (`libstoreservicescore` and others) in an Android chroot. The
  repo ships **no Apple code**. You have to supply an Apple Music Android
  `.apk`/`.apkm` yourself (tested with 3.6.0-beta build 1109; the `.so` SHA-256s
  are pinned in `LIBS_VERSION.json`) and build the image locally. No image is
  published.
- **amd64.** x86_64 is the default target, and the NDK build stage only runs on
  amd64. This fits the homelab.
- **Privileges.** The container needs `cap_add: SYS_ADMIN, SYS_CHROOT,
SYS_PTRACE` and `apparmor:unconfined`.
- **Login, 2FA and session lifetime.** The first login is `POST /login` with an
  Apple ID and password. It returns 202 when 2FA is required, followed by `POST
/login/2fa` with the code. Apple's session DB (`mpl_db/kvs.sqlitedb`) lives
  on a persistent volume, and on every start the daemon restores it
  (`WRAPPER_RESTORE_SESSION=1`), so restarts need no login. How long Apple keeps
  that session alive is not documented anywhere and was not measured.
  `WRAPPER_USERNAME`/`WRAPPER_PASSWORD` can sign in at startup, but 2FA still
  needs a person.
- **No manual steps after first login?** Mostly. Once the session volume
  exists, a `downloads`-profile sidecar restarts unattended. Two things still
  need a person: building the image (from the APK), and re-authenticating when
  Apple expires the session.
- **Behaviour in our worker.** `run_subprocess` uses `stdin=DEVNULL`. If the
  wrapper is logged out, gamdl's interactive credential prompt fails at once
  instead of hanging. If the wrapper is unreachable, gamdl exits with "Error
  fetching wrapper account info" (checked by hand, below) and the job fails. It
  does not fall back to AAC.

## 2. End to end: not verified

This needs a real Apple ID login with 2FA and an Apple Music APK, and neither is
available here. From reading the code, this is what should happen:

- `--song-codec-priority alac,aac-web` is tried **per track**, in order
  (`SongInterface.get_stream_info`). A track with no ALAC variant gets
  `aac-web`, the same 256 kbps AAC as today, and the file looks no different
  apart from its codec. If neither is available, gamdl raises
  `GamdlInterfaceFormatNotAvailableError`.
- Among ALAC variants, gamdl takes the one with the **highest
  `average_bandwidth`**. That means the highest bit depth and sample rate Apple
  offers, up to 24/192. **There is no option to cap it.**
- ALAC playlists come from the wrapper's `/playback`. Decryption goes through
  the wrapper's TCP port, and gamdl's Rust `_ammuxer` muxes the `.m4a`.

To verify by hand, once a wrapper is up and logged in:

```bash
gamdl --use-wrapper --wrapper-url http://<wrapper>:80 \
  --wrapper-decrypt-host <wrapper> --song-codec-priority alac,aac-web \
  --output-path /tmp/alac-test <song or album URL>
ffprobe -v error -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate,bits_per_raw_sample -of compact <file>
```

## 3. Size and speed

There are 4,258 tracks with an `apple_music_url` (279.7 h), and 4,090 have
local audio today (seed DB, 2026-11-09). If every Apple Music track were
re-downloaded:

| Format            | Typical bitrate | GB/hour   | Whole collection |
| ----------------- | --------------- | --------- | ---------------- |
| AAC 256 (today)   | 256 kbps        | 0.115     | ~32 GB           |
| ALAC/FLAC 16/44.1 | ~0.8–1.0 Mbps   | 0.36–0.43 | ~100–120 GB      |
| ALAC/FLAC 24/48   | ~1.4–1.7 Mbps   | 0.63–0.77 | ~175–215 GB      |
| ALAC/FLAC 24/96   | ~2.8–3.3 Mbps   | 1.26–1.5  | ~350–415 GB      |
| ALAC/FLAC 24/192  | ~5.5–6.5 Mbps   | 2.5–2.9   | ~700–820 GB      |

Lossless bitrates are the usual 55–70% of PCM. The synthetic test files compress
much better than real music, so they were not used for this. Because gamdl
always takes the highest variant, the real figure depends on how much of the
collection Apple offers in Hi-Res. Plan for **~150–250 GB**, against ~32 GB
today. FLAC comes out about the same size as ALAC, often a few percent smaller.

Speed was not measured. Bytes per track go up 3.5–25×, and every sample makes
a round trip through the wrapper's TCP decrypt. Downloads are per-track jobs
with a 600 s gamdl timeout. A 6-minute 24/192 track is ~280 MB, which should fit
comfortably, but it needs measuring alongside step 2.

## 4. Downstream

Everything accepts ALAC `.m4a` unchanged:

| Stage                                  | Result                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ffprobe (worker and app images)        | `codec_name=alac`, `bits_per_raw_sample` 16 / 24, `sample_rate` 44100 / 96000                  |
| App `audioFieldsFromProbe`             | `audio_codec=alac`, `container=m4a`, `lossless=true`, `bit_depth` 16 / 24, `sample_rate` right |
| Worker WAV step (`analyze_audio_file`) | Decodes; writes `pcm_s16le` and **keeps 96 kHz** (a 6-min track ≈ 70 MB temp WAV)              |
| essentia extractor (WAV, and raw ALAC) | Exit 0, 120.0 BPM, A major for 16/44.1 WAV, 24/96 WAV and 24/96 `.m4a`; same as the AAC        |
| fingerprint-service `decode_to_pcm`    | 60 s of 22050 Hz mono for both ALAC files; Chromaprint produced 463 values each                |
| Same for FLAC                          | Decodes, fingerprints, essentia 120.0 BPM; app treats `flac` as lossless                       |

Set derivation (`stream_pcm`) uses the same `_decode_command`, so it reads ALAC
the same way. The synthetic signal is too steady for Chromaprint to show
anything about match quality (variety 0.004). Matching a real ALAC query
against an AAC reference is **not verified**. Both decode to the same 22 kHz
mono, so no difference is expected.

**`audio_sha256` re-indexing works.** The three encodings of the same audio
hash to three different values. A re-download replaces `{track_id}.m4a` with a
new size and mtime, so the hourly "changed" backfill pass rehashes it, and
`needs_index` sees the hash differ and fingerprints it again. If a lossless
re-download changes `local_audio_url` (for example `.m4a` → `.flac`),
`trackFingerprintTrigger` queues it straight away.

## 5. Browser playback

The player is a plain `<audio src="/api/audio?filename=...">`. `/api/audio`
serves `.m4a` as `audio/mp4`. Tested with the same content type and range
support (Playwright, headless):

| Engine                          | `canPlayType` alac | ALAC 16/44.1 | ALAC 24/96 | AAC | FLAC 16 & 24/96 |
| ------------------------------- | ------------------ | ------------ | ---------- | --- | --------------- |
| Google Chrome 157 (real)        | `""`               | error 4      | error 4    | ok  | ok              |
| Playwright Firefox 157          | `""`               | error 4      | error 4    | ok  | ok              |
| Playwright WebKit 27.2 (Safari) | `probably`         | ok           | ok         | ok  | ok              |

Chrome reports `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` and Firefox
`NS_ERROR_DOM_MEDIA_METADATA_ERR`. The player's `onError` only writes to the
console, so **the track just never starts and the user sees no error**. Real
Safari was not driven. WebKit stands in for it, and Safari plays ALAC natively.

FLAC played everywhere, even when `/api/audio` mislabelled it: `.flac` falls
through to `audio/mpeg`. The decoded PCM MD5 of ALAC 24/96 and of its ffmpeg
FLAC conversion are identical, so the conversion loses nothing.

Options:

1. **Convert to FLAC after download (recommended).** Lossless, bit-exact, one
   file, plays in every browser, and needs no new serving path. Cost: one
   `ffmpeg -i x.m4a -c:a flac x.flac` per track, and Apple's MP4 tags have to be
   carried over as Vorbis comments (ffmpeg's `-map_metadata 0` and attached
   picture). Also give `.flac` its proper `audio/flac` type in `/api/audio`.
2. Keep an AAC copy for streaming. That adds ~32 GB and a second download or a
   transcode, and the browser never plays the lossless file.
3. Transcode on the fly in `/api/audio`. That costs CPU per play and makes range
   requests and seeking hard. Not worth it.
4. Safari only. This breaks the player for Chrome and Firefox users.

## 6. Risk

- **Account flagging: real, but low per account.** gamdl issue #356 (open, Oct 2026) is a wrapper login refused with "Your account is disabled." Apple Music
  kept working for that user, but the wrapper could no longer log in. The
  wrapper presents itself as a fixed Android device fingerprint (Galaxy S9) that
  every user shares by default. The likeliest outcome is losing wrapper access,
  not the whole Apple ID, but there is no data to rule that out. Use a dedicated
  Apple ID with its own subscription if that is acceptable.
- **Brittleness: high.** gamdl has had 9 releases since July (3.8 → 3.9.1). The
  wrapper changed underneath it twice: 3.6 switched to wrapper-v2 only, and
  3.8.2 replaced the decrypt path with a native Rust muxer and an
  **exact-version** API check. The wrapper-v2 README calls itself
  "research-grade" and "developed with heavy AI assistance". Its last release
  was 2026-07-09. It also depends on Apple's Android libraries from one specific
  APK build, which Apple can break server-side. Expect a wrapper/gamdl version
  mismatch to stop lossless downloads every few months. Pin both, and upgrade
  them together.
- **Opt-in: yes.** Lossless should be the "Lossless" setting, honoured only
  when `GAMDL_WRAPPER_URL` is set. The default stays AAC, so a broken wrapper
  never stops the AAC path everyone relies on. A later follow-up can retry a
  failed wrapper download without the wrapper, as AAC.

## Fixed in this PR

`download_with_gamdl` used to pass `--audio-quality <value>` for every setting
except `best`. gamdl 3.9.1 rejects it ("No such option '--audio-quality'"), so
choosing High, Standard or Lossless failed every Apple Music download.

Now `gamdl_quality_args` passes nothing for `best`/`high`/`standard`, which is
gamdl's default `aac-web`. `lossless` becomes `--use-wrapper --wrapper-url ...
--wrapper-decrypt-host ... --song-codec-priority alac,aac-web`, but only when
`GAMDL_WRAPPER_URL` is set. The decrypt host defaults to the URL's host, and
`GAMDL_WRAPPER_DECRYPT_HOST`/`_PORT` override it. Without a wrapper, lossless
logs a warning and downloads AAC. The three variables are passed through in
`docker-compose.yml` and documented in `.env.example`. The wrapper service
itself is not added here.

Checked against the real CLI:

```bash
gamdl --output-path /tmp/x --audio-quality lossless <url>
# Error: No such option '--audio-quality'.
gamdl --output-path /tmp/x --use-wrapper --wrapper-url http://127.0.0.1:18080 \
  --wrapper-decrypt-host 127.0.0.1 --song-codec-priority alac,aac-web <url>
# options accepted; fails at "Error fetching wrapper account info" (no wrapper running)
```

## Follow-ups (if go)

Start these only after step 2 has been done by hand with a real account.

1. **Wrapper sidecar.** A `gamdl-wrapper` service in the `downloads` profile,
   built locally from wrapper-v2 0.0.2 with a user-supplied APK (no published
   image; never commit the APK or the libraries). It needs the caps and AppArmor
   settings above, a named volume for its session data, and no host ports. Add
   `GAMDL_WRAPPER_URL=http://gamdl-wrapper:80` to `.env.example`, a `just`
   recipe for the first login and 2FA, and a worker startup check against `/me`.
2. **Audio quality mapping.** Done in this PR for `lossless`. What remains is a
   sample-rate cap, because gamdl always takes the highest variant: either an
   upstream gamdl option or a downsample at FLAC conversion time. Also remove
   `audio_format` from `gamdl_settings`, since gamdl never received it. And
   decide whether a failed wrapper download retries as AAC.
3. **Browser playback.** Convert ALAC to FLAC after download, keeping tags and
   cover. Serve `.flac` as `audio/flac`. Show a player error instead of failing
   silently when `<audio>` raises `MEDIA_ERR_SRC_NOT_SUPPORTED`.

## File permissions for server players

OwnTone engines mount the audio library read-only and run as `nobody`, so every
published file must be world-readable. gamdl and `NamedTemporaryFile` stage
files as 0600, and moves keep that mode. The worker therefore sets 0644 on each
file as it lands in `/app/audio` (and on the FLAC temp file before it replaces
the ALAC). Files are never made group- or world-writable and ownership is not
changed.

Files downloaded before this fix stay 0600 and show up in OwnTone as "Audio
file is missing, ambiguous, or not yet indexed". Repair them by hand, then
rescan:

```bash
docker exec groovenet_download_worker find /app/audio -type f -perm 600 -exec chmod 644 {} +
curl -X PUT http://localhost:<engine-port>/api/update
```

There is deliberately no automatic chmod at startup.
