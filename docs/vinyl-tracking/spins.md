---
title: Detections and spins
description: Check the signal and review listening history.
sidebar:
  order: 3
---

Open **Vinyl** to inspect the ingest pipeline. Check that chunks arrive, the worker processes them and the reference index is populated. A processed chunk without a match is normal between tracks; a whole session without matches needs investigation.

```bash
groovenet vinyl status
groovenet vinyl detections
```

Check the reported level during silence and music before setting `FINGERPRINT_MIN_LEVEL_DBFS`. A floor between them avoids matching idle-chain hiss. Raising `FINGERPRINT_MAX_BER` allows weaker matches and can create false plays.

Open **Spins** to review listening history. Detections are grouped into plays rather than counting every overlapping window as another spin.

For a recorded set, `groovenet sets derive set.mp3 --playlist <id>` derives a tracklist against the same reference index and compares it with your plan. See the [CLI guide](/docs/cli/) for review and logging commands.
