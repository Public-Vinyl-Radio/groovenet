# Control server players from the web

A **music server** (a named player) owns its queue and playback. Any browser
can connect to it and acts as a remote; the queue stays on the server when
every device disconnects, and anyone connected can edit or overwrite it (last
write wins). Each server has its own queue and one engine/output; several can
play at once. Synchronized groups and browser player/engine administration are
not included. Operators configure players through the existing CLI/API; see
[server players](../../packages/groovenet-player/SERVER_PLAYERS.md).

## Play on

**Play on** chooses where audio plays. Open it from Now playing's `PLAY ON`
row (phones), the desktop bar's output button, or **Playback** in the
navigation. It is the shared retro modal: this device (`This iPhone`,
`This Mac`, ...) and then `MUSIC SERVERS`, every player from `GET /api/players`,
fetched each time the picker opens. A server whose status is playing, paused or
loading is `LIVE` ("Session live"); anything else is `IDLE`. Choosing a row only
previews it; the footer button confirms.

- **Join a server** from this device: the local queue *from the current track
  onward* (never what already played) is appended to the end of the server's
  queue with one `queue.add`. If the server was idle (stopped, ended or with no
  current entry), the first appended entry then plays. Local audio pauses, and
  once the append succeeds the local queue is cleared so there is only one
  queue in view; a failed append leaves it intact. An empty local queue just
  switches. Moving from one server to another carries nothing over.
- **Play here** switches back to this device. The server is never sent a
  command: it keeps playing its queue.
- **AirPlay…** under `FROM THIS DEVICE` opens the system picker, and only
  appears where the browser has one (WebKit's `webkitShowPlaybackTargetPicker`).
  AirPlay carries this device's audio, so it switches back here first.

The chosen server is remembered on this device without starting playback.
Closing the picker or any player UI, navigating, reloading, locking browser
access or losing the event stream never pauses, stops or clears a server.

## One player for both

In server mode the mini player, Now playing, the queue and the desktop bar are
the same ones as local mode, reading the server's snapshot. The mini player
tags `ON <SERVER>` (or `AIRPLAY` for local AirPlay); the `PLAY ON` row and the
desktop output button name the server; the volume is `SERVER VOL`, sent as one
`volume` command once the slider settles (sender volume, which some receivers,
including Lounge, ignore). Seeking also commits on release. The queue shows a
`SERVER SESSION` strip with the server's name, "shared queue" and **Play here**.
Queue rows load their tracks from the collection, keeping the server's title
and artist until they do; play, remove and move address individual entry UUIDs,
so duplicate tracks and different friends' copies stay distinct. Position runs
on locally between the server's position events. There are no device counts,
connected-device lists or "added by" labels.

Collection play/enqueue actions and keyboard shortcuts target the selected
mode. In server mode **Play now atomically replaces the server queue** with
`queue.replace` and starts the selected entry; enqueue appends without starting
audio.

**Clear** is one tap and a **Queue cleared · Undo** toast, as locally. Undo
restores the original entry UUIDs, current entry and saved position through
`queue.replace`, restarting audio only if it was playing. It is refused once
another edit has been observed since Clear, and it supplies the cleared
revision so the server rejects it if another controller edited first.

## Speaker availability and problems

Until Home Assistant speaker detection is configured (#797), `play`/`resume`
can come back `AVAILABILITY_UNKNOWN` or `SPEAKER_OCCUPIED`. The player shows a
compact inline confirm, "Speaker status unknown · Play anyway" (or "Speaker in
use · Take over"), floating above the player, in Now playing and in the
picker. Confirming resends the same command with `allow_unknown` or `takeover`;
it is never acknowledged automatically, and it is refused if the player changed
meanwhile. Once detection is configured the prompt stops appearing.

The same strip carries what needs attention: locked or expired browser access
(with **Unlock**, which opens the picker), the server's own playback error, and
failed requests such as a lost connection (reconnects wait for a fresh full
snapshot and reject old connections, workers, sequences, revisions and
entries).

**Speaker details**, from the connected server's preview in the picker, keeps
output routing out of the everyday player: desired output against actual
assignment, each speaker's observed activity, remembering a desired output
(which neither connects nor plays), and a reviewed transfer from the player
that holds an output. Transfers default to no destination playback; starting
it needs the unknown/occupied confirm first. A transfer can return HTTP 200
having detached the source and failed the destination; both phases and the
failure are shown, and nothing is retried or restored automatically.

## Browser authorization

Browser authorization is a separate, opt-in household policy. It does not assume
an app login or trusted LAN, and does not remove the existing bearer check.
All CLI/SDK bearer requests keep their existing behavior. A browser session can
read players/devices/events and issue playback/queue/output commands; creating
or renaming players still requires bearer authorization.

With server players configured, the easiest setup uses the existing 1Password CLI
workflow. Add these fields to `Homelab/groovenet` once:

- `PLAYER_WEB_ORIGIN`: the exact HTTPS address you use to open Groovenet, without
  a trailing slash or path.
- `PLAYER_WEB_PASSPHRASE`: generate a new password of at least 32 characters.
- `PLAYER_WEB_SESSION_SECRET`: generate another independent value of at least
  32 characters.
- `PLAYER_WEB_SESSION_DAYS`: a whole number from 1 to 3650; use `365` for the
  default one-year session.

The existing `PLAYER_API_KEY` field is read only to verify that the secrets are
distinct. It is never written into the web settings file. The committed
`.env.player-web.tpl` contains references, not resolved credentials, and honors
`GROOVENET_OP_VAULT` / `GROOVENET_OP_ITEM` like `.env.players.tpl`.

From your usual deployment machine, run:

```sh
just player-web-setup
```

This resolves the fields through `op run`, validates them and uploads a private
`.env.player-web` to the configured production checkout (`PROD_HOST` /
`PROD_STACK_DIR`). It creates an empty `.env.player-web.op` marker to opt this
host into automatic refresh. It does not restart services. Your next normal deployment applies the
settings and subsequently refreshes them from 1Password. Hosts without that marker
keep their manually managed settings and do not need the new 1Password fields.
Remove the marker to stop automatic refresh. Only distribute the web passphrase
to household controllers.

For local rendering without uploading, use `just player-web-env`; an optional
output path can be passed as its first argument. No credential values are printed.

For manual setup, create an operator-managed root `.env.player-web`
with mode `0600`. It is ignored by git and excluded from Docker build contexts;
the players Compose overlay loads it only into the app. It is separate from
`.env.players`, which the existing credential renderer replaces on deployment.
Do not put these values in `NEXT_PUBLIC_*` variables.

```dotenv
PLAYER_WEB_ORIGIN=https://your-public-app-origin.example
PLAYER_WEB_PASSPHRASE=<independent random value of at least 24 characters>
PLAYER_WEB_SESSION_SECRET=<another independent random value of at least 32 characters>
PLAYER_WEB_SESSION_DAYS=365
```

Use an exact HTTPS origin, without a trailing slash/path. Generate independent
random values (for example `openssl rand -hex 32`) in your normal secret manager.
Neither value may equal `PLAYER_API_KEY`, and the two web values must differ.
Distribute only the web passphrase to trusted household controllers: it grants
access to every named player's state and queued friend references. Never enter
the worker key into the browser unlock form. Missing/invalid configuration keeps
browser access disabled, while local audio and the existing bearer API remain
available. This change does not deploy/restart any services for you.

Unlock uses a same-origin POST and compares asynchronously derived scrypt keys
with a fresh random salt (N=32768, r=8, p=3, the
[OWASP 32 MiB profile](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)).
The passphrase is cleared from the form on
submission and is never saved in browser storage. The app issues a fixed-lifetime
HMAC-signed, `Secure`, `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/players`.
`PLAYER_WEB_SESSION_DAYS` sets both the cookie `Max-Age` and signed token expiry
(default 365 days, maximum 3650). Access does not renew the expiry. The token
contains only issuance time, expiry, a random nonce and a signature. Existing
eight-hour tokens need one new unlock after this format change. Shortening the
setting immediately invalidates tokens issued for a longer term. Mutations
require the configured Origin; cross-site/sibling-site browser sessions are denied.
Unlock attempts have a bounded process-wide budget of ten per minute (not an
IP allowlist; forwarded headers do not establish identity). Multi-process apps
have independent budgets; use a high-entropy passphrase. The worker key is added
only after authorization, server-side, and is never in browser bundles, responses,
storage or logs. Engine credentials remain private to the worker.

Lock clears this browser's cookie and subscription without changing audio. A
copied token can remain valid until expiry: rotate `PLAYER_WEB_SESSION_SECRET` to
revoke copies of existing tokens in all browsers. Rotate the web passphrase and
signing secret together when revoking household access. Signing-secret rotation
does not affect CLI keys.
Event streams are bounded by token expiry; unlock browser access again after
expiry. This is a small household player session bridge, not the
per-user OAuth project (#569).

## Validation

Unit/UI tests use synthetic player state and mock credentials. Browser tests use
same-origin fixtures or an isolated test worker, never production audio. Run the
app coverage, lint/type/OpenAPI checks and existing player Playwright tests using
the repository Docker/worktree workflow. No audible hardware test is required.
