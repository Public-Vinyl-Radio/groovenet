# Restore GrooveNET To A Fresh Docker Host

This runbook restores a full GrooveNET instance from Restic backups to a new server.

## Prerequisites

- Fresh Docker host with `docker compose`.
- Repo checked out (for example at `/srv/docker/groovenet/my-collection-search`).
- `.env` configured with:
  - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
  - `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`
- External volumes created if using `docker-compose.prod.yml` with `external: true`.

## 1) Create required Docker volumes (if external)

If you see errors like `external volume "teststack_discogs_exports" not found`, create the expected volumes:

```bash
docker volume create teststack_db_data_v2
docker volume create teststack_music_data
docker volume create teststack_db_dumps
docker volume create teststack_discogs_exports
docker volume create teststack_redis_data
docker volume create teststack_cookie_data
docker volume create teststack_album_covers
docker volume create teststack_essentia_data
```

## 2) Start minimum services

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml up -d db redis app
```

Notes:

- `SENTRY_DSN` warnings can be ignored during restore.
- If `run --rm app restic snapshots` starts Next.js instead of running Restic, use `exec` against a running app container.

## 3) Verify access to Restic repo

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec app restic snapshots
```

## 4) Restore snapshot files into a temporary directory

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec app \
  sh -lc 'mkdir -p /tmp/restore && restic restore latest --target /tmp/restore'
```

You can also restore a specific snapshot:

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec app \
  sh -lc 'restic restore <SNAPSHOT_ID> --target /tmp/restore'
```

## 5) Copy restored assets into Docker volumes

Use helper script:

```bash
./scripts/restore-restic-assets.sh --restore-target /tmp/restore
```

The script auto-detects whether `app` uses bind mounts or named volumes for:

- `/app/audio`
- `/app/public/uploads/album-covers`
- `/app/dumps`

If mount inspection fails, it falls back to default volume names.

Dry run:

```bash
./scripts/restore-restic-assets.sh --restore-target /tmp/restore --dry-run
```

If your app container name is not `groovenet_webapp`:

```bash
./scripts/restore-restic-assets.sh --restore-target /tmp/restore --app-container <container_name>
```

If your volume names differ:

```bash
./scripts/restore-restic-assets.sh \
  --restore-target /tmp/restore \
  --music-volume <music_volume> \
  --covers-volume <covers_volume> \
  --dumps-volume <dumps_volume>
```

The script copies:

- `app/audio` -> music volume
- `app/public/uploads/album-covers` -> covers volume
- `app/dumps` -> dumps volume

It also supports fallback folder layouts (`audio`, `public/uploads/album-covers`, `dumps`).

## 6) Restore PostgreSQL from dump

List available dumps:

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec app ls -lah /app/dumps
```

### If dump is plain SQL (`.sql`)

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec -T app \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /app/dumps/<file>.sql'
```

### If dump is custom format (`.dump`)

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec app \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" /app/dumps/<file>.dump'
```

## 7) Start full stack

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## 8) Validate restore

- App opens at port 3000.
- Tracks/albums exist.
- Album covers resolve.
- Local audio playback works through browser streaming.
- Backup policy page loads (if used).

## Common issues

### `external volume ... not found`

Create missing volume(s) with `docker volume create ...` and retry.

### `restic snapshots` starts Next.js instead

Use:

```bash
docker compose ... up -d app
docker compose ... exec app restic snapshots
```

### `Connection Error ... address 'db' cannot be found`

Ensure commands run with both compose files and correct project name:

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml ...
```

### Restore into an existing non-empty DB

If needed, reset schema before restore, then re-run restore command:

```bash
docker compose -p dj-playlist -f docker-compose.yml -f docker-compose.prod.yml exec app \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
```
