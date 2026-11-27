---
title: Integrations and backups
description: Optional streaming metadata, audio downloads, AI and backup settings.
sidebar:
  order: 2
---

## Apple Music and YouTube

Apple Music metadata uses `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID` and `APPLE_MUSIC_PRIVATE_KEY`. Paste the full `.p8` key, with escaped newlines as shown in [`.env.example`](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/.env.example).

YouTube enrichment requires `YOUTUBE_API_KEY`; there is no local fallback. These providers help you match tracks during [enrichment](/docs/using/enrichment/).

Audio downloads run in `download-worker`. Apple Music downloads use gamdl and its cookies; manage the downloader settings and cookies in **Settings**. A metadata match alone does not supply downloadable audio. The app and worker must share audio storage.

## OpenAI

Suggestions and semantic search work without a key using the bundled local
`bge-small-en-v1.5` model. A fresh install with an OpenAI key keeps OpenAI as its
default. Adding a key later requires a target → backfill → serving model switch;
see the [embedding model guide](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/my-collection-search/docs/IDENTITY_EMBEDDINGS.md#switching-a-kinds-model).

Set `OPENAI_API_KEY` for AI features. `OPENAI_GENRE_RECONCILIATION_MODEL` selects the tag reconciliation model; the accompanying input/output price settings record estimated costs. Embedding queue controls and model defaults are documented in `.env.example`. Inspect AI suggestions before saving changes to your collection.

## Backups

Use **System → Backups** to manage backups. For remote restic storage, set `RESTIC_REPOSITORY` and `RESTIC_PASSWORD`. Backblaze B2 also needs `B2_ACCOUNT_ID` and `B2_ACCOUNT_KEY`; the repository format is `b2:<bucket-name>:<path>`.

`BACKUP_HEALTH_MAX_AGE_HOURS` sets the health-alert threshold. Keep it longer than your backup interval. Keep the restic password somewhere outside the server: a backup you cannot decrypt cannot restore your collection.

### What each target includes

Backups go to up to two **targets**, each a restic repository with its own include choices on **System → Backups**: database dumps, album covers, AAC audio and lossless audio (FLAC). Both share the schedule and the **Keep** setting.

| Target     | Where                                    | Default                                                 |
| ---------- | ---------------------------------------- | ------------------------------------------------------- |
| Remote     | Any restic backend (`RESTIC_REPOSITORY`) | Database, covers and AAC. Lossless is **not** included. |
| Local disk | A disk attached to the host (optional)   | Lossless audio only                                     |

Lossless files are large and can be downloaded again, so they stay out of metered remote storage by default. An install with no remote can turn every box on for the local disk, and switch the remote off. Which files count as lossless comes from the format recorded for each file, so ALAC kept in an `.m4a` is treated as lossless. A file with no recorded format falls back to its extension (`.flac`, `.wav` and similar). Discogs exports, Essentia files and uploads are remote-only options.

Existing installs keep their remote settings, with one change: lossless audio is now excluded from the remote. Turn **Lossless audio** back on for the remote if you want it there.

### Adding a local backup disk

The local target is off until the host sets `LOCAL_BACKUP_PATH`. Nothing about it appears on the System page, and no extra mount is added, until then.

1. **Prepare the disk.** Format it and mount it on the host so it comes back after a reboot (an `/etc/fstab` entry, or your OS's equivalent). Make it writable by the user the app runs as (uid 1001 in the containers).
2. **Create the marker file on the mounted disk**, not on the empty mount point:

   ```bash
   touch /path/where/the/disk/is/mounted/.groovenet-backup-disk
   ```

3. **Set the host-local settings** in `.env.host`, next to `.env` on the deploy host (a deploy never overwrites it; see `.env.host.example`):

   ```bash
   LOCAL_BACKUP_PATH=/path/where/the/disk/is/mounted
   LOCAL_BACKUP_RESTIC_PASSWORD=a-long-random-password
   ```

   The local repository has its own password, separate from `RESTIC_PASSWORD`. Keep a copy outside the host.

4. **Deploy.** `deploy-prod.sh` adds `docker-compose.local-backup.yml` when `LOCAL_BACKUP_PATH` is set, which bind-mounts the disk into the app. If you run Compose by hand, pass `-f docker-compose.yml -f docker-compose.local-backup.yml`.
5. Open **System → Backups**. A **Local disk** row appears. Run a backup; the first run creates the repository in a `groovenet-restic` folder on the disk.

**Groovenet never writes to the root disk.** Before every local run it checks that the path exists, that the marker file is present, and that the path is on a different device from its parent. If any check fails, the run fails, nothing is written (not even a database dump), and the System page shows which check failed. An unmounted disk therefore fails with "marker missing" instead of filling the host's own disk. The marker is the check that matters in a container, because a bind-mounted host directory does not always look like a separate device from inside it. Create it only on the disk.

### Health

The System page shows each target's last run and whether it is healthy, each measured against `BACKUP_HEALTH_MAX_AGE_HOURS`. `GET /api/health/backup` is unhealthy (503) if the remote or the local disk is overdue or its last run failed; its `local` field says which. A target you switched off, or an install without a local disk, never makes it unhealthy.

### Restoring FLACs from the local repository

Run restic against the local repository with its password. On the host (restic installed), with the disk mounted:

```bash
export RESTIC_REPOSITORY=/path/where/the/disk/is/mounted/groovenet-restic
export RESTIC_PASSWORD='the LOCAL_BACKUP_RESTIC_PASSWORD value'
restic snapshots
restic restore latest --target /path/to/scratch --include '**/*.flac'
```

Then copy the restored files into the audio volume under their original names (`restic ls latest` shows the stored paths). Restore into a scratch folder first, so a mistake cannot overwrite live files. `restic restore <snapshot-id>` brings back an older version, which is the point of a repository over a mirror: a file deleted by mistake is still in earlier snapshots until retention prunes them.

### If the host and the disk both fail

Lossless FLACs exist only on the host and the local disk, so losing both loses them. They can be downloaded again. Everything else survives in the remote: the database, covers and AAC audio (and Discogs exports, Essentia files and uploads if you included them). Restore those, then re-download the lossless files. If you also put lossless audio on the remote, nothing is lost.

## Analytics and error reporting

`ANALYTICS_PROVIDER=none` sends no product analytics. Set it to `posthog` with `POSTHOG_KEY` and `POSTHOG_HOST` to opt in. Non-web services use the optional `SENTRY_DSN` and `SENTRY_RELEASE` settings for exception reporting.
