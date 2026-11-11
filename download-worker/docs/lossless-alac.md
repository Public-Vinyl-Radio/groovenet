# Lossless ALAC downloads with gamdl (spike, #1147)

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
