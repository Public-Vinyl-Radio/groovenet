---
title: Install GrooveNet
description: Install a self-hosted collection with one command, or with Docker Compose by hand.
sidebar:
  order: 1
---

GrooveNet runs from published Docker images: no checkout and no build. You need Linux, or a Mac with [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [OrbStack](https://orbstack.dev) already running. On a fresh Ubuntu or Debian server the installer sets Docker up for you.

## One command

```bash
curl -fsSL https://groovenet.publicvinylradio.com/install.sh | sh
```

Read it first if you like: `curl -fsSL https://groovenet.publicvinylradio.com/install.sh | less`. It is a plain POSIX shell script, and you can download it and run it by hand.

It asks for your Discogs username and token (press Enter to skip and add them later), then:

- finds Docker with Compose v2, or installs Docker Engine on Ubuntu and Debian. On macOS it never installs Docker; it stops and points you at Docker Desktop or OrbStack.
- downloads the release's compose bundle and checks its SHA-256 checksum.
- writes `.env` (mode 600, with a random database password) in the install directory: `/srv/groovenet` on a Linux server (root or sudo), `~/groovenet` otherwise.
- starts the stack, runs database migrations, waits for `/api/health`, and offers to import your Discogs collection.

Suggestions work without an API key: the app image bundles the local
`bge-small-en-v1.5` embedding model, and generates embeddings in the background
after import. There is no first-run model download. OpenAI is an optional
quality upgrade. **YouTube enrichment needs a YouTube API key; there is no
local fallback.** The installer explains both keys and its final summary lists
skipped keys and the full `.env` path. Add keys there and restart the app.

Adding an OpenAI key later does not automatically switch existing vectors.
Use the [embedding model cutover flow](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/my-collection-search/docs/IDENTITY_EMBEDDINGS.md#switching-a-kinds-model)
to set the OpenAI target, backfill, check coverage, then change serving for each kind.

The app listens on `127.0.0.1` only, so nothing is exposed to the network. Open [http://localhost:3000](http://localhost:3000), or from a server use an SSH tunnel: `ssh -L 3000:127.0.0.1:3000 you@server`.

Run the same command again to upgrade to the latest release. It keeps `.env` and your data, and does nothing when you are already current.

### Private access on a VPS

Use `--tailscale-auth-key KEY` or the `TS_AUTHKEY` environment variable to install
Tailscale on Linux, join your tailnet, and serve the app with HTTPS. The installer
prints the actual `https://groovenet.<tailnet>.ts.net` address (a name collision may
add a suffix). Enable MagicDNS and HTTPS certificates in your tailnet admin console
before unattended installation; approve the node if your policy requires it.
See [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

Use `--tailscale-hostname NAME` to choose the hostname on first join (default
`groovenet`). `--tailscale-ssh` separately opts in to Tailscale SSH; normal SSH is
sufficient for installation. Reruns keep the existing node identity and hostname,
do not reuse a key for a running node, and leave an already configured Serve target
alone. After the first successful join, upgrades remember tailnet mode without a
key. Do not delete tailscaled's state to upgrade.

The bundle's `docker-compose.local.yml` publishes only `127.0.0.1:${APP_PORT:-3000}`;
Tailscale Serve proxies that loopback port. The installer checks UFW and warns about
allow/limit rules outside `tailscale0`, including rules that might cover app ports
through ranges or profiles. Review and remove public app-port allowances yourself.
It never enables or changes your firewall. Also check provider firewalls and test
from outside: Docker port publishing can bypass UFW. Existing public Tailscale
Funnel configuration is refused; disable it before using private Serve.

Without Tailscale, the summary always prints the SSH tunnel fallback:
`ssh -L 3000:localhost:3000 user@host`. `--public` is refused pending
[authentication #569](https://github.com/Public-Vinyl-Radio/groovenet/issues/569)
and [hardening #1074](https://github.com/Public-Vinyl-Radio/groovenet/issues/1074).
The fuller VPS walkthrough is tracked in
[#1075](https://github.com/Public-Vinyl-Radio/groovenet/issues/1075).

#### Unattended cloud-init

This minimal `runcmd` example is suitable for the Terraform workflow (#1073).
Provision `/run/secrets/tailscale-authkey` separately through your secret delivery
system, readable only by root. Do not put a real key in cloud-init user data, inline
commands, shell history or version control. Prefer a short-lived, one-use auth key.

```yaml
#cloud-config
runcmd:
  - [
      sh,
      -c,
      "curl -fsSL https://groovenet.publicvinylradio.com/install.sh -o /run/groovenet-install.sh",
    ]
  - [
      sh,
      -c,
      'set +x; TS_AUTHKEY="$(cat /run/secrets/tailscale-authkey)" sh /run/groovenet-install.sh --non-interactive --no-import --tailscale-hostname groovenet; result=$?; rm -f /run/secrets/tailscale-authkey; exit "$result"',
    ]
```

`--non-interactive` implies `--yes`, so package installs and setup need no terminal.
The key is never written to Groovenet's `.env`, summary or error output. Joining
uses a temporary mode-600 key file, removed after use and on exit, so the Tailscale
CLI receives a file path rather than the key in its arguments. Passing a literal
key as an installer flag can expose it in your shell history and process list;
use secret injection via `TS_AUTHKEY` instead.

### Options

Pass options after `sh -s --`, or download the script and run `sh install.sh --help`:

```bash
curl -fsSL https://groovenet.publicvinylradio.com/install.sh | sh -s -- --profile downloads --audio-dir /mnt/music
```

| Option                                                                    | What it does                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `--dir PATH`                                                              | Install directory. Default `/srv/groovenet` (Linux with root or sudo) or `~/groovenet`.                                             |
| `--version vX.Y.Z`                                                        | Install this release instead of the latest. An older release than the installed one is refused, because migrations only go forward. |
| `--profile NAME`                                                          | Also run an optional group of services: `downloads`, `analysis`, `optimize`, `fingerprint`, or `all`. Repeat or comma-separate.     |
| `--audio-dir PATH`                                                        | Keep audio in an existing directory, such as a mounted disk, instead of a Docker volume.                                            |
| `--tailscale-auth-key KEY`                                                | Install Tailscale and serve privately over HTTPS (or `TS_AUTHKEY`).                                                                 |
| `--tailscale-hostname NAME`                                               | Hostname on first join, default `groovenet`.                                                                                        |
| `--tailscale-ssh`                                                         | Opt in to Tailscale SSH.                                                                                                            |
| `--public`                                                                | Refused until #569 and #1074 land.                                                                                                  |
| `--port N`                                                                | Port on `127.0.0.1` for the app. Default 3000.                                                                                      |
| `--discogs-username`, `--discogs-token`                                   | Discogs credentials (or the `DISCOGS_USERNAME` and `DISCOGS_USER_TOKEN` environment variables).                                     |
| `--openai-key`, `--youtube-key`                                           | OpenAI quality upgrade / YouTube enrichment (or `OPENAI_API_KEY`, `YOUTUBE_API_KEY`).                                               |
| `--apple-music-team-id`, `--apple-music-key-id`, `--apple-music-key-file` | Optional Apple Music credentials (or `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY`).                       |
| `--import`, `--no-import`                                                 | Run or skip the first Discogs import. Default: ask when there is a terminal, skip otherwise.                                        |
| `--yes`                                                                   | Answer yes to confirmations, such as installing Docker.                                                                             |
| `--non-interactive`                                                       | Never prompt. For scripts and cloud-init. Implies `--yes`. Without it the script needs a terminal, and says so when there is none.  |
| `--project-name NAME`                                                     | Docker Compose project name. Default `groovenet`.                                                                                   |
| `--bundle PATH`, `--image-tag TAG`                                        | For testing: install from a local bundle, or from a release-candidate image tag.                                                    |

Credentials passed as flags are visible in `ps` while the installer runs, so prefer the environment for secrets: `DISCOGS_USER_TOKEN=... sh install.sh --non-interactive`. Credentials only fill settings that are empty; to change one later, edit `.env` in the install directory. The script never prints a secret.

The installer will not adopt anything it did not create. If a Compose project named `groovenet` already exists on the machine without this directory's `.groovenet-install` marker, or the directory is not empty, it stops and says why, rather than reusing someone else's data volumes.

## With Docker Compose by hand

The same install without the script, from a clone:

```bash
git clone https://github.com/Public-Vinyl-Radio/groovenet.git
cd groovenet

cp .env.example .env
# Edit .env: at minimum, set POSTGRES_PASSWORD and your Discogs values.

export COMPOSE_FILE=docker-compose.yml:docker-compose.images.yml:docker-compose.local.yml
docker compose up -d
```

To build from source instead of using published images, run `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d`.

Open [http://localhost:3000](http://localhost:3000), then [import your Discogs collection](/docs/getting-started/discogs/). The stack stores its database, audio, exports, backups, and cookies in Docker volumes.

Choose the [environment settings](/docs/configuration/environment/) before starting. See [running and updating](/docs/getting-started/running/) for daily commands and Compose modes.
