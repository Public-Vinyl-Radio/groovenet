---
title: Import from Discogs
description: Bring your records and tracklists into GrooveNet.
sidebar:
  order: 2
---

Set your Discogs credentials in the [environment](/docs/configuration/environment/), then open the app at your configured address.

Open **Settings → Discogs** and use **Sync default library**. Follow its progress in the dialog. `DISCOGS_FOLDER_ID=0` imports the full collection; choose a folder ID to limit it.

When the import finishes, open **Albums** to check the records and **Tracks** to search their tracklists. Discogs data is the starting point: streaming links and analysed audio are separate. Use [enrichment](/docs/using/enrichment/) to fill those gaps.

Run the sync again when your Discogs collection changes. Check the dialog's errors before retrying a failed import.
