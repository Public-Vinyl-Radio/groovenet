---
title: Listener setup
description: Send short audio windows from your deck to the matcher.
sidebar:
  order: 1
---

Connect your turntable's line-level output to a listener's audio input. Keep phono gain and capture levels sensible. The listener must be able to reach your GrooveNet server.

GrooveNet accepts audio over `POST /api/audio/ingest`. A listener sends `multipart/form-data` with an `audio` file and a stable `source_id`. Optional fields are `session_id`, numeric `sequence` and `captured_at`. Use roughly 15-second chunks; the server checks size and duration before accepting a job.

To check the connection with a captured chunk:

```bash
curl --fail-with-body http://localhost:3000/api/audio/ingest \
  -F audio=@window.wav -F source_id=decks
```

This is an ingest check, not a continuous capture program. Configure your listener to capture and post windows repeatedly. Keep the endpoint behind your deployment's access controls.

Run the Compose stack with Redis and `fingerprint-service`. The app and matcher share the ingest volume. Build the [reference index](/docs/vinyl-tracking/fingerprint-index/) before expecting matches, then check [detections and spins](/docs/vinyl-tracking/spins/).

Limits, cleanup and matcher controls are in the root [`.env.example`](https://github.com/Public-Vinyl-Radio/groovenet/blob/main/.env.example). Raw chunks are temporary; the database retains detection metadata.
