---
title: Playlists and the optimiser
description: Prepare a set and tune the running order.
sidebar:
  order: 3
---

Add tracks to a playlist from the track actions, then open **Playlists** and select it. Drag entries to set the order. Save the playlist when the sequence works.

The actions menu offers **Greedy order**, **Genetic order** and **Cohesive blocks**. These reorder selected material around musical transitions. Greedy order is a quick pass; genetic order searches for a sequence; cohesive blocks keeps related material together. The server-backed genetic and cohesive-blocks modes need BPM and audio-vibe embeddings. Enrich and analyse missing tracks first.

Review the BPM curve, keys, duration and repeated records after sorting. An optimiser cannot know which transition you want to ride or cut. Move entries by hand and save the result.

Use export/import actions when moving a set between tools. **Enqueue** sends it to playback. To check a set from a terminal, use `groovenet playlists check <id>`; see the [CLI guide](/docs/cli/).

![A playlist ready for a set](../../site/src/assets/screenshots/playlist-desktop-light.png)

![Playlist ordering tools](../../site/src/assets/screenshots/optimiser-desktop-light.png)

## Print a set sheet

Choose **Export PDF** from the playlist's actions menu to download a landscape set sheet: the playlist's name, track count, total playtime and when it was exported, then one row per track, with a **#**, **ID**, **Pos**, artist, title, album, BPM, key, duration and genre column.

![A set sheet exported as a PDF](../../site/src/assets/screenshots/set-sheet-pdf.png)

Two columns tie a row to the shelf:

- **ID** is the album's library identifier, the label you put on the record or sleeve (for example `LP-311`). It is empty for an album without one.
- **Pos** is the track's position on the record: side and track, such as `A1` or `B4`.

Set an album's library identifier in its edit form, or find the albums still without one with the **Library identifier** filter on **Albums**. Give them an identifier before you print, so every row has an ID.

At the venue, the sheet is the whole job:

1. **Pull.** Before the gig, take the records on the sheet off the shelf by ID.
2. **Find.** At the venue, find each record by ID, then put the needle on the track at **Pos**.
3. **Re-shelve.** Afterwards, return each record to its place by the same ID.

Rows are in the playlist's current order, so save any changes to the running order before you export.
