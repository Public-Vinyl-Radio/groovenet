---
title: Household profiles and API tokens
description: Choose household identities and configure optional scoped API tokens for machine clients.
sidebar:
  order: 3
---

Groovenet's network remains the perimeter: household profiles identify people,
without passwords or a login wall. They are separate from friends (Discogs
libraries) and ranking profiles. A single-profile install implies its owner and
never shows the picker. The owner is created idempotently on first identity
request from `DISCOGS_USERNAME`, or as `Owner` on a fresh install without one.
The owner’s library mapping follows the current `DISCOGS_USERNAME` value,
including when it is cleared; renaming a profile does not change that mapping.
Settings → Profiles lets the owner add and rename profiles, and optionally map
an exact `Tailscale-User-Login` value to one profile.

With multiple profiles, a fresh device sees “Who's listening?”. The user menu
opens the same picker to switch. The device cookie lasts a year, is httpOnly
and SameSite=Lax, and is Secure on HTTPS only, so plain HTTP LAN devices work.
Its random 32-byte secret is stored only as a SHA-256 hash in `profile_devices`.
Switching rotates it. An expired or unknown cookie cannot select a user.

Server code uses `getCurrentUser(request)` from `src/server/auth/currentUser.ts`:
a valid bearer token, a valid device cookie, an explicitly mapped Tailscale login,
then the sole profile, otherwise `null`. The stable UUID identifies the user for
future personal ratings and playlist ownership; neither feature changes here.

Settings → API tokens lets the owner create a named token for any profile with a
`read`, `write` or `ingest` scope, see its last use and revoke it. Tokens contain
32 random bytes, appear only in the creation response, and are hashed at rest.
Verification uses a constant-time digest comparison. Lists never include hashes
or plaintext credentials. Do not put a token in a URL or commit it to a file.

`GROOVENET_TOKEN` supplies the optional bearer header for `@groovenet/client`,
the CLI, MCP and the shared Python client used by workers. The CLI also accepts
`groovenet config set api_key <token>`; its config file is private and config
output redacts the value. Explicit TypeScript `token` takes precedence over the
environment, then legacy `apiKey`; Python accepts the optional `token` keyword.
Remote-player credentials still use their existing separate key.

## Opt-in enforcement

Leave `AUTH_REQUIRE_TOKENS` unset or false for existing routes and machine
clients to work as before, including an untokened Pi listener. Identity resolution
accepts tokens either way; scope enforcement is enabled only by setting
`AUTH_REQUIRE_TOKENS=true` on the app.

Next 16's Node proxy (`src/proxy.ts`) matches every `/api/:path*` request and calls
one `enforceApiAuth` function. No individual existing route needs an auth wrapper.
With enforcement enabled, a valid bearer takes precedence over a device cookie:

- `read`: GET, HEAD and OPTIONS.
- `write`: all methods; owner-only management still requires the owner profile.
- `ingest`: POST audio ingest, ingest/set claim and result callbacks, and
  GET/POST/PATCH reference fingerprints. It cannot administer indexing, read
  arbitrary library endpoints or mutate tracks.

Without a bearer, an unexpired device cookie permits browser requests. Profile
listing and selection remain available without credentials so new LAN browsers
can choose a profile. A supplied valid bearer is scope-checked on those endpoints
too. The browser persists the sole or automatically mapped profile without
showing a picker. Other untokened API requests return 401; scope violations
return 403. Revocation takes effect on the next request, without a cache delay.

Profiles are selectable household identities, not security accounts. Token
scopes constrain machine requests; the passwordless profile picker remains
available to devices on the private network.
