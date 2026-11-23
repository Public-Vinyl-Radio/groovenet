---
title: Import from Discogs
description: Bring your records and tracklists into GrooveNet.
sidebar:
  order: 2
---

Set your Discogs credentials in the [environment](/docs/configuration/environment/), then open the app at your configured address.

On a new install, Home, Albums and Tracks each offer **Import from Discogs**. If `DISCOGS_USER_TOKEN` or `DISCOGS_USERNAME` is missing, they say which, and the import button waits until you set it in `.env` and restart. The import keeps running if you leave the page; if it stops, **Resume import** carries on from the last saved batch of 25 releases. Once your records arrive, Home lists a few things to try next (analyse audio, Apple Music, YouTube links, AI notes, a first playlist), each with the profile or key it needs; dismiss it when you are done.

You can also run it later from **Settings → Libraries** with **Sync default library**. Follow its progress in the dialog. `DISCOGS_FOLDER_ID=0` imports the full collection; choose a folder ID to limit it.

When the import finishes, open **Albums** to check the records and **Tracks** to search their tracklists. Discogs data is the starting point: streaming links and analysed audio are separate. Use [enrichment](/docs/using/enrichment/) to fill those gaps.

Run the sync again when your Discogs collection changes. Check the dialog's errors before retrying a failed import.
