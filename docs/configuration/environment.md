---
title: Environment
description: Configure the database, Discogs import and storage.
sidebar:
  order: 1
---

Set these values in `.env` before starting:

| Variable             | Purpose                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`  | A strong password for the bundled database                                                           |
| `DISCOGS_USER_TOKEN` | Personal access token from [Discogs developer settings](https://www.discogs.com/settings/developers) |
| `DISCOGS_USERNAME`   | Your Discogs username                                                                                |
| `DISCOGS_FOLDER_ID`  | `0` for your full collection, or a specific folder ID                                                |

Apple Music, YouTube, OpenAI, backup, and analytics settings are optional. See [`.env.example`](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/.env.example) for the complete list and descriptions.

The root `.env` is read by Docker Compose. Keep it out of Git. `DATABASE_URL` in the example is for host tools; Compose sets the app's database URL to the bundled `db` service using `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`.

Replace sample integration credentials with real values or leave optional integrations unconfigured. Restart the affected services after changing their environment.

For a different HTTP port, set `APP_PORT` in `.env`; the local override defaults to `3000`. Both `APP_AUDIO_MOUNT` and `WORKER_AUDIO_MOUNT` must point at the same backing store if you replace the named audio volume.

See [integrations](/docs/configuration/integrations/) for optional providers and backups, and [vinyl tracking](/docs/vinyl-tracking/) for ingest and matcher settings.
