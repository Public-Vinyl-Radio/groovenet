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

The app listens on `127.0.0.1` only, so nothing is exposed to the network. Open [http://localhost:3000](http://localhost:3000), or from a server use an SSH tunnel: `ssh -L 3000:127.0.0.1:3000 you@server`.

Run the same command again to upgrade to the latest release. It keeps `.env` and your data, and does nothing when you are already current.

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
| `--port N`                                                                | Port on `127.0.0.1` for the app. Default 3000.                                                                                      |
| `--discogs-username`, `--discogs-token`                                   | Discogs credentials (or the `DISCOGS_USERNAME` and `DISCOGS_USER_TOKEN` environment variables).                                     |
| `--openai-key`, `--youtube-key`                                           | Optional keys (or `OPENAI_API_KEY`, `YOUTUBE_API_KEY`).                                                                             |
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
