---
title: Integrations and backups
description: Optional streaming metadata, audio downloads, AI and backup settings.
sidebar:
  order: 2
---

## Apple Music and YouTube

Apple Music metadata uses `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID` and `APPLE_MUSIC_PRIVATE_KEY`. Paste the full `.p8` key, with escaped newlines as shown in [`.env.example`](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/.env.example).

YouTube search uses `YOUTUBE_API_KEY`. These providers help you match tracks during [enrichment](/docs/using/enrichment/).

Audio downloads run in `download-worker`. Apple Music downloads use gamdl and its cookies; manage the downloader settings and cookies in **Settings**. A metadata match alone does not supply downloadable audio. The app and worker must share audio storage.

## OpenAI

Set `OPENAI_API_KEY` for AI features. `OPENAI_GENRE_RECONCILIATION_MODEL` selects the tag reconciliation model; the accompanying input/output price settings record estimated costs. Embedding queue controls and model defaults are documented in `.env.example`. Inspect AI suggestions before saving changes to your collection.

## Backups

Use **System → Backups** to manage backups. For remote restic storage, set `RESTIC_REPOSITORY` and `RESTIC_PASSWORD`. Backblaze B2 also needs `B2_ACCOUNT_ID` and `B2_ACCOUNT_KEY`; the repository format is `b2:<bucket-name>:<path>`.

`BACKUP_HEALTH_MAX_AGE_HOURS` sets the health-alert threshold. Keep it longer than your backup interval. Keep the restic password somewhere outside the server: a backup you cannot decrypt cannot restore your collection.

## Analytics and error reporting

`ANALYTICS_PROVIDER=none` sends no product analytics. Set it to `posthog` with `POSTHOG_KEY` and `POSTHOG_HOST` to opt in. Non-web services use the optional `SENTRY_DSN` and `SENTRY_RELEASE` settings for exception reporting.
