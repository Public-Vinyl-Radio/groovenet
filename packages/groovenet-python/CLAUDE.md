# groovenet_client

Hand-written synchronous client over requests.Session, shared by both Python
workers. Keep this package small: implement only app endpoints they consume.
`client.py` owns transport/error handling; `types.py` owns their wire payloads.
Services own retries, logging, best-effort delivery and response validation.

## Adding an endpoint

1. Read the app route and its contract in `my-collection-search/src/api-contract`.
2. Add only the needed TypedDict payload/response fields to `types.py`.
3. Add a thin typed method in `client.py` through `_request`; encode path IDs
   with `quote(..., safe="")` and pass query parameters separately.
4. Add the method's case to `tests/test_client.py`: assert method, URL, body,
   query, identification header and timeout. The contract test uses these actual
   recorded requests, so no second endpoint registry is needed.
5. Run `just generate-spec` at the repo root, then the tests below. The contract
   check skips if `openapi-generated.json` is absent locally; CI generates it
   and sets `GROOVENET_REQUIRE_OPENAPI=1` to require the check.
6. Wire it into the consuming service and run that service's coverage suite.
   Preserve the caller's timeout and retry/error policy. Keep app HTTP calls
   here; external services such as Essentia use their own transport.

```bash
uv run --group dev pytest --cov=groovenet_client --cov-branch --cov-report=term-missing
uv build
# From the repository root:
pre-commit run --all-files
```

Errors prefer body `error`, then `message`, then HTTP status, like the
TypeScript client's precedence. Never parse successful status-only responses.
Every non-2xx raises (including redirects); transport exceptions pass through.
No retries are installed on the Session. `fetch_audio` streams without buffering
and its caller must close the response. Both workers identify as `worker`, the
app's recognised pipeline source. Docker builds use the repository root.

## Household API tokens (#1282)

`GROOVENET_TOKEN` optionally supplies `Authorization: Bearer` for app requests.
Without it, requests retain their existing authentication behaviour. The CLI
also accepts a token through `groovenet config set api_key <token>`; config output
redacts it. The TypeScript client reuses `apiKey` (the environment alias overrides it);
the Python client accepts the optional `token` keyword. Remote player credentials
remain in `player_api_key`: either the legacy player key or a scoped household token.
