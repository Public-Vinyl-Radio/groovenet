# Groovenet Python client

Small synchronous API client shared by download-worker and fingerprint-service.
Import `GroovenetClient` and `GroovenetApiError` from `groovenet_client`; typed
wire payloads live in `groovenet_client.types`. Requires Python 3.12+ and requests.

```python
from groovenet_client import GroovenetClient

with GroovenetClient("http://app:3000", timeout=30, client_name="worker") as client:
    client.update_track({"track_id": "track-1", "friend_id": 7, "duration_seconds": 245})
    client.report_job_outcome("job-1", timeout=10)
```

`base_url` defaults to `APP_URL`, then `http://app:3000`. Each client reuses one
`requests.Session` (optionally injected); close it when finished. Both workers
use the app's `worker` identity so callbacks count as pipeline analytics.
No automatic retries: services decide which failures are fatal or best-effort.
Transport failures remain `requests.RequestException`; non-2xx responses raise
`GroovenetApiError(status, message)`, preferring JSON `error`, then `message`,
then HTTP status. Redirects are refused. Status-only methods accept empty or
non-JSON successful bodies; cover matching and fingerprint listing require JSON.
`fetch_audio` returns a streaming response that the caller closes with `with`.

See [CLAUDE.md](CLAUDE.md) for endpoint additions and testing. No code generation.

The current consumers and their policies are:

| Method                                       | App request                                                     | Service timeout                | Failure policy                                                                            |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `update_track`                               | PATCH `/api/tracks`                                             | 30s                            | Analysis/duration/art jobs fail; download URL write logs a warning and keeps the download |
| `report_job_outcome`                         | POST `/api/jobs/{id}/outcome`, no body                          | 10s                            | Best-effort after terminal Redis status                                                   |
| `extract_cover_art`                          | POST `/api/albums/{releaseId}/artwork/match`, `friend_id` query | 180s                           | Album cover job fails                                                                     |
| `fetch_audio`                                | GET `/api/audio`, `filename` query, streamed                    | 60s                            | Local-processing job fails                                                                |
| `claim_ingest` / `claim_set_derivation`      | POST ingest/set `/claim`, no body                               | Configured fingerprint timeout | Best-effort; work continues                                                               |
| `report_ingest_result` / `report_set_result` | POST ingest/set `/result`, full result body                     | Configured fingerprint timeout | Wrapped as `ResultReportError`; logged, next job continues                                |
| `upsert_fingerprint`                         | POST `/api/fingerprints`, full upsert body                      | Configured fingerprint timeout | Failed track counted; a later indexing run can retry                                      |
| `record_file_stats`                          | PATCH `/api/fingerprints`, hash/size/mtime body                 | Configured fingerprint timeout | Best-effort; existing fingerprint remains valid                                           |
| `list_fingerprints`                          | GET `/api/fingerprints`, engine/version/limit/offset query      | Configured fingerprint timeout | Keep existing index and use the service's refresh retry schedule                          |

The fingerprint timeout is `FINGERPRINT_RESULT_TIMEOUT` (default 30s). The
current album route replaces the older extract-cover-art-from-audio endpoint.
Payloads, including explicit nulls and zero values, pass through unchanged.
