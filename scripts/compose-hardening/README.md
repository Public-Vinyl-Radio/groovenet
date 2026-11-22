# Container hardening (#1074)

What every Compose service gets, why, and how CI keeps it that way. Part of the
self-host epic (#926): hardening, with auth (#569), gates any public mode.

## Rules

`scripts/compose-hardening/check.py` renders `docker compose config` for each
overlay combination we ship (base, local, installer, prod, worktree, mac,
prod + players) and fails when a service:

| Rule                | Meaning                                          |
| ------------------- | ------------------------------------------------ |
| published port      | any service other than `app` publishes one       |
| Docker socket       | anything mounts `docker.sock` (root on the host) |
| privileged          | `privileged: true`                               |
| `no-new-privileges` | `security_opt` lacks `no-new-privileges:true`    |
| `cap_drop`          | `cap_drop` lacks `ALL`                           |
| `mem_limit`         | no memory limit                                  |

Run it with `just compose-hardening-check`. Services in the `players` profile
(`docker-compose.players.yml`, the opt-in OwnTone/AirPlay overlay) are exempt from
the port and hardening rules: AirPlay and mDNS need `network_mode: host`. They are
still checked for the Docker socket and `privileged`.

## Capabilities

Every service drops all capabilities. Once every image is non-root (below), the
only service that adds any back is `volume-perms`:

| Service         | `cap_add`                                   | Why                                                                                                               |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `volume-perms`  | CHOWN, DAC_OVERRIDE, FOWNER                 | Re-owns volumes that older root containers (or a host) left with other owners. Runs, then exits.                  |
| `app` (dev)     | CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID | The `next dev` target still starts as root to adopt the checkout's uid, then drops with `gosu`. Dev overlay only. |
| everything else | none                                        | Verified by running every workload with none.                                                                     |

While the images were still root, each add-back was checked by removing it: Postgres
needed CHOWN, DAC_OVERRIDE, FOWNER, SETUID and SETGID (without FOWNER or DAC_OVERRIDE
its entrypoint logs `chmod ... Operation not permitted`), Redis SETUID and SETGID
(plus CHOWN for restored volumes), the download worker DAC_OVERRIDE to write the
volumes the app owned. Running as the stock `postgres` and `redis` users skips those
entrypoints, so none of them are needed now.

## Users

One scheme: **uid/gid 1001** in every Groovenet image (`nextjs:nodejs` in the web image,
`groovenet:groovenet` in the Python and Essentia ones), and the stock `postgres` and
`redis` users through `user:` for the two official images. Why 1001:

- It is what `entrypoint.sh` has always chowned the app's volumes to, so existing
  volumes already match and need almost no migration.
- One uid across services means shared volumes (audio, cookies, essentia-data, covers,
  the ingest volume) work without group permissions or ACLs.

The `volume-perms` one-shot service (see `RELEASING.md`) fixes ownership of existing
volumes on every `up`.

## Read-only root filesystems

Every service sets `read_only: true`. What a service writes outside its volumes, found
with `docker diff` after a full workload (download, analysis, fingerprint index and
ingest, optimise, backup with restic, a page sweep):

| Service              | Writable paths                                                                         | Why                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `app`                | tmpfs `/tmp` (256m), `.next/cache` (128m)                                              | Next's image cache; `RESTIC_CACHE_DIR=/tmp/restic-cache`. The links to the volumes are made at image build (`link-volumes.sh`). |
| `db`                 | tmpfs `/tmp`, `/var/run/postgresql`                                                    | the Unix socket and its lock file                                                                                               |
| `redis`              | none                                                                                   | `/data` is a volume                                                                                                             |
| `essentia`           | tmpfs `/tmp` (`ESSENTIA_TMP_SIZE`, 1g)                                                 | each track is downloaded there before analysis, so this caps the file size; counts toward the memory limit                      |
| `ga-service`         | tmpfs `/tmp` (32m)                                                                     | nothing in practice                                                                                                             |
| `download-worker`    | volumes `worker_downloads` (`/app/downloads`) and `worker_tmp` (`/tmp`), tmpfs `$HOME` | downloads are staged on disk (gigabytes for lossless albums), `$HOME` holds yt-dlp and gamdl caches                             |
| `fingerprint-*`      | tmpfs `/tmp` (64m)                                                                     | ffmpeg's buffered stderr                                                                                                        |
| `migrate`, `scripts` | tmpfs `/tmp`, `$HOME`                                                                  | npm's logs and update check                                                                                                     |
| `volume-perms`       | none                                                                                   |                                                                                                                                 |

tmpfs memory counts toward the service's `mem_limit`. Left writable: only the `app` in
the dev overlay (`next dev` writes all over its bind-mounted checkout).

## Memory limits

`mem_limit` is what plain `docker compose` enforces. Each reads an env var
(`.env.example`) so a small VPS can lower them. Measured on this branch, arm64 Docker
Desktop, all services, `docker stats` peak while running a 7-minute essentia
analysis, a fingerprint index job, an ingest chunk, a 300-track playlist optimise and a
`pg_dump` backup at the same time (the library is about 4,100 tracks):

| Service                | Idle                     | Peak under load | Default limit |
| ---------------------- | ------------------------ | --------------- | ------------- |
| app (production image) | 250 MiB                  | 309 MiB         | 1536m         |
| app (`next dev`)       | 520 MiB                  | 927 MiB         | 4g (dev only) |
| db                     | 38 MiB (empty) / 148 MiB | 153 MiB         | 1g            |
| redis                  | 6 MiB                    | 6 MiB           | 256m          |
| essentia, 7-min WAV    | 43 MiB                   | 376 MiB         | 2g            |
| essentia, 30-min WAV   |                          | 975 MiB         | 2g            |
| ga-service             | 50 MiB                   | 58 MiB          | 512m          |
| download-worker        | 28 MiB                   | 61 MiB          | 1536m         |
| fingerprint-service    | 47 MiB                   | 189 MiB         | 768m          |
| fingerprint-set-worker | 45 MiB                   | 171 MiB         | 768m          |

Essentia's peak grows with track length, about 1 GB for 30 minutes of WAV, so it has the
largest limit. A limit that is too low shows up as an OOM-killed container
(`docker inspect -f '{{.State.OOMKilled}}'`), and `restart: unless-stopped` brings it back.
