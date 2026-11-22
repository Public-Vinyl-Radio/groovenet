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

## Capabilities added back

Every service drops all capabilities. Each add-back was verified by removing it and
watching the service fail.

| Service           | `cap_add`                                   | Why                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db`              | CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID | Official entrypoint starts as root, chowns/chmods the data dir, drops to `postgres`. Without FOWNER/DAC_OVERRIDE it logs `chmod ... Operation not permitted`; FOWNER alone exits with `Permission denied`. |
| `redis`           | CHOWN, SETUID, SETGID                       | Entrypoint drops to `redis` (`su-exec`) after chowning stray files in `/data`. SETUID/SETGID were the only ones needed on a fresh volume; CHOWN stays for restored volumes.                                |
| `app`             | CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID | `entrypoint.sh` starts as root, re-owns the volumes and drops to `nextjs` with `gosu`.                                                                                                                     |
| `download-worker` | DAC_OVERRIDE                                | Runs as root, volumes are owned by uid 1001. Without it, writes to `/app/audio` fail with `Permission denied`.                                                                                             |
| everything else   | none                                        | `essentia`, `ga-service`, `fingerprint-*`, `migrate`, `scripts` ran every workload with no capabilities.                                                                                                   |

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
