# Control server players from the web

Open **Playback: Local browser** to unlock server access and choose a configured
named player. Local audio stays in this browser; server audio runs independently
on Debian. The viewed player is remembered on this device, without starting
playback. Switching away from local mode pauses browser audio and preserves its
queue. Switching server players, navigating, closing the panel/browser, locking
browser access or losing events leaves server audio alone.

Each player has its own queue and one engine/output. Multiple players can listen
simultaneously. Synchronized groups and browser player/engine administration are
not included. Operators configure players through the existing CLI/API; see
[server players](../../packages/groovenet-player/SERVER_PLAYERS.md).

Collection play/enqueue actions and keyboard playback shortcuts target the
selected mode. In server mode, **play adds the selection to the server queue and
explicitly plays its requested entry**, retaining existing entries. The API has
no atomic queue-replace operation; the browser does not emulate one by clearing
music before an add that might fail. Enqueue adds without starting audio. Queue
remove/move/play actions identify individual entry UUIDs, so duplicate tracks
and different friends' track references remain distinct. Local behavior stays
with the existing browser player.

The server panel shows current track, status, elapsed/duration, saved checkpoint,
requested sender volume, queue, desired output, actual assignment and independent
observed speaker activity. Sender volume is not measured receiver loudness;
Lounge currently ignores it. Remembering a desired output does not connect or
claim it. Unknown activity and occupied activity require deliberate acknowledgement
before connection. Acknowledgements are tied to the rejected command’s revision;
a change elsewhere requires reviewing and repeating the action. Another player's claim requires a separately reviewed transfer,
including its source revision. Transfers default to no destination playback.
The optional start-playback checkbox requires any observed unknown/occupied
acknowledgement before confirmation. Activity can still change between observation
and connection.

A transfer can return success HTTP status while detaching the source and failing
the destination. The panel exposes both phases and the failure; it never restores
the source or retries playback automatically. Playback errors remain visible
through queue/settings edits, including a compact alert while browsing. Reconnects
wait for a fresh full snapshot and reject old connections, workers, sequences,
revisions and entries. Revision conflicts refresh state and ask you to review and
repeat the action explicitly. Refresh outputs to obtain a new device observation.

## Browser authorization

Browser authorization is a separate, opt-in household policy. It does not assume
an app login or trusted LAN, and does not remove the existing bearer check.
All CLI/SDK bearer requests keep their existing behavior. A browser session can
read players/devices/events and issue playback/queue/output commands; creating
or renaming players still requires bearer authorization.

With server players configured, the easiest setup uses the existing 1Password CLI
workflow. Add three fields to `Homelab/groovenet` once:

- `PLAYER_WEB_ORIGIN`: the exact HTTPS address you use to open Groovenet, without
  a trailing slash or path.
- `PLAYER_WEB_PASSPHRASE`: generate a new password of at least 32 characters.
- `PLAYER_WEB_SESSION_SECRET`: generate another independent value of at least
  32 characters.

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
submission and is never saved in browser storage. The app issues an eight-hour
HMAC-signed, `Secure`, `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/players`.
The token contains only expiry, a random nonce and a signature. Mutations require
the configured Origin; cross-site/sibling-site browser sessions are denied.
Unlock attempts have a bounded process-wide budget of ten per minute (not an
IP allowlist; forwarded headers do not establish identity). Multi-process apps
have independent budgets; use a high-entropy passphrase. The worker key is added
only after authorization, server-side, and is never in browser bundles, responses,
storage or logs. Engine credentials remain private to the worker.

Lock clears this browser's cookie and subscription without changing audio. A
copied session remains valid until expiry: rotate the session-signing secret to
invalidate all sessions. Rotate the web passphrase and signing secret together
when revoking household access. Signing-secret rotation does not affect CLI keys.
Event streams are bounded by session expiry; if access expires, lock and unlock
browser access again. This is a small household player session bridge, not the
per-user OAuth project (#569).

## Validation

Unit/UI tests use synthetic player state and mock credentials. Browser tests use
same-origin fixtures or an isolated test worker, never production audio. Run the
app coverage, lint/type/OpenAPI checks and existing player Playwright tests using
the repository Docker/worktree workflow. No audible hardware test is required.
