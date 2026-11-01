---
title: Fingerprint index
description: Prepare reference audio so the listener can recognise records.
sidebar:
  order: 2
---

The matcher needs downloaded reference audio for the tracks you play. A Discogs import alone is not an index. Match and download the right recordings first.

With the [CLI configured](/docs/cli/), run:

```bash
groovenet fingerprint-library
groovenet fingerprint-library --release <release-id>
groovenet fingerprint-library --all
```

The default indexes tracks missing a fingerprint. `--all` checks every track with reference audio; unchanged audio is skipped. Use `--changed` to check already indexed tracks, or `--force` to regenerate fingerprints in the selected scope. `--no-wait` queues a run and returns immediately; without it the command waits and reports failures.

`FINGERPRINT_MATCHER=chromaprint` enables real matching. The `stub` matcher never identifies a track. `groovenet vinyl status` reports an empty index and reference audio still waiting to be indexed.
