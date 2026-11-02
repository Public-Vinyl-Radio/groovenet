---
title: Downloads and local audio
description: How tracks get audio you can play, analyse and fingerprint, and how to follow the download queue.
sidebar:
  order: 10
---

A track has **local audio** when GrooveNet holds an audio file for it. Matching a track to Apple Music or YouTube only records a link; it doesn't give you a file. Local audio is what everything else is built on:

- **Playback** from the server plays local audio.
- [Audio analysis](/docs/using/analysis/) measures BPM and key from it.
- The [fingerprint index](/docs/vinyl-tracking/fingerprint-index/) is built from it, so records can be recognised when you play them. A track with no local audio can't be matched.

Tracks without audio are easy to find: the **Missing audio** count on [Home](/docs/using/home/) links to them, and **Tracks** has a missing-audio filter.

## Getting audio

There are three ways in.

- **Download from a streaming match.** Apple Music links are downloaded with [gamdl](https://github.com/glomatico/gamdl); anything else, such as a YouTube link, with [yt-dlp](https://github.com/yt-dlp/yt-dlp). Match the track first, on the [enrichment](/docs/using/enrichment/) wizard or the track's page.
- **Upload a file you own.** Choose **Upload audio** in a track's actions menu. The file is analysed straight away.
- **Fetch in bulk.** On an album, **Download missing audio** queues the tracks on it that have no audio yet. The enrichment wizard has an option to queue each track as you save it.

On a single track, **Fetch audio** appears in the actions menu when the track has a streaming link. It also appears when the track already has audio, so you can fetch it again. **Remove audio** removes the track's local audio.

Downloading Apple Music needs a cookie file from your own account, set up under **Settings → Downloads**. That page also has **Cookie Management** and **Test Connection** to check the setup. See [integrations](/docs/configuration/integrations/) for the server side.

## The queue

Downloads don't happen in the browser. Each request is a job on a queue, and the download worker picks them up, downloads the file, and saves it to the audio store shared with the app. When the file is in place, the worker queues a second job to analyse it, so a failed analysis shows up as its own failed job rather than hiding a good download.

Open **Jobs** to watch the queue. The page lists jobs with a count of the total, waiting, active, done and failed, and a state filter. Open a job's details for its logs, which is where to look when one fails. You can refresh the list or clear all jobs. The **Failed jobs** count on Home links straight to the failed ones.

## From the terminal

`groovenet albums download <release-id>` queues an album's downloads, and `groovenet tracks missing-apple-music` lists tracks still without an Apple Music match. The MCP server has `download_album`. See the [CLI](/docs/cli/) and [MCP](/docs/mcp/) references.
