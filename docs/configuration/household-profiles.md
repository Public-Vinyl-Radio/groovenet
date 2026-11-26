---
title: Household profiles and API tokens
description: Choose household identities and configure optional scoped API tokens for machine clients.
sidebar:
  order: 3
---

Groovenet's network remains the perimeter: household profiles identify people,
without passwords or a login wall. All profiles share the same libraries,
including the configured Discogs account shown in Settings → Libraries. They are separate from friends (Discogs
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
personal ratings and playlist ownership.

Settings → API tokens lets the owner create a named token for any profile with a
`read`, `write` or `ingest` scope, see its last use and revoke it. Tokens contain
32 random bytes, appear only in the creation response, and are hashed at rest.
Verification uses a constant-time digest comparison. Lists never include hashes
or plaintext credentials. Do not put a token in a URL or commit it to a file.

`GROOVENET_TOKEN` supplies the optional bearer header for `@groovenet/client`,
the CLI, MCP and the shared Python client used by workers. The CLI also accepts
`groovenet config set api_key <token>`; its config file is private and config
output redacts the value. The TypeScript client reuses its existing `apiKey` field, with the environment
alias taking precedence; Python accepts the optional `token` keyword.

There is one bearer scheme. Previously, the app checked `PLAYER_API_KEY` only
on `/api/players`; it had no general server-side `API_KEY` check. The existing
player key now resolves to the owner with write scope on that same surface,
and cannot authenticate arbitrary library routes. The player proxy also accepts
hashed household tokens, forwarding only its configured worker key downstream.
The CLI keeps `player_api_key` separate for player requests: it may hold the
legacy player key or a scoped household token. No TLS agent settings change.

## Personal ratings

Star ratings belong to the profile that gave them (#1283), in `track_ratings`,
one per profile per collection row. The rating stars everywhere, the minimum
rating filter, suggestions and any ranking profile that weighs rating use the
current profile's ratings. A track's page also shows the other profiles'
ratings read-only, by profile name: "You ★5 · <other profile> ★3". The API keeps
`star_rating` as the requesting profile's rating (0 when unrated) and adds
`other_ratings`. Switching profile reloads every list with the new profile's
ratings.

Machine clients rate as their token's profile, or as the owner without one,
including `groovenet tracks update --rating` and MCP's `update_track`. The
playlist optimiser receives the requesting profile's ratings.

Upgrading moves every existing rating to the owner, including ratings on
friends' collections, so the owner sees exactly what they saw before and other
profiles start with none. If the app has not created the owner yet, the
migration creates it as `Owner`, and the app renames it from
`DISCOGS_USERNAME` on its first request. `tracks.star_rating` is deprecated and
no longer written; it stays for one release so an older image still starts,
and rolling the migration back copies the owner's current ratings into it.

## Playlist owners

Every playlist belongs to one profile (#1284) and is visible to the whole
household by default, or **private** to its owner. Upgrading gives every
existing playlist to the owner, visible to everyone, so nothing changes until
someone makes one private. A new playlist belongs to the current profile; from
the CLI, MCP or the API it belongs to the token's profile, or to the owner
without one.

A private playlist is invisible to every other profile: it is missing from the
playlist list, the "Add to playlist" dialog, the command palette, Home, a
track's playlist count and memberships, and a request for it by id (its
tracks, its set, logging its spins, diffing a set recording against it)
answers 404, as for a playlist that doesn't exist.

Anyone who can see a household playlist may still rename it, change its
tracks or delete it, as before profiles. Only the owner may change who sees
it: the playlist page's menu has **Make private** / **Share with household**,
the CLI has `groovenet playlists visibility <id> household|private` and
`groovenet playlists create <name> --private`, MCP's `create_playlist` takes
`visibility`, and `PATCH /api/playlists` with `visibility` answers 403 for
anyone else. With several profiles, the playlist list filters by All, Mine or
another profile, and tags another profile's playlists with its name and your
private ones Private.

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
