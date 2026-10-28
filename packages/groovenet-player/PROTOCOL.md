# Player control protocol

The local player daemon exposes version 1 of a newline-delimited JSON-RPC 2.0
protocol over a Unix domain socket. Its socket and pidfile are
`~/.groovenet/player/player.sock` and `~/.groovenet/player/player.pid`. The
directory is private to the current user. Every request, response, and event
includes the integer `version`; clients must reject a response with an
unsupported version, and the daemon answers an unsupported request version
with `VERSION_MISMATCH`.

## Framing and messages

Each UTF-8 JSON object occupies one line terminated by `\\n`. Requests use an
integer `id`, a non-empty `method`, and optional object-valued `params`:

```json
{"jsonrpc":"2.0","version":1,"id":1,"method":"status"}
```

A response has the same `id` and either a `result` or an `error` containing a
machine-readable `code` and a human-readable `message`:

```json
{"jsonrpc":"2.0","version":1,"id":1,"result":{"status":"stopped"}}
```

```json
{"jsonrpc":"2.0","version":1,"id":1,"error":{"code":"INVALID_ARGUMENT","message":"..."}}
```

Malformed JSON or invalid request envelopes receive `INVALID_REQUEST`. A
request with a different protocol version receives `VERSION_MISMATCH`. Events
are notifications without an `id`; the daemon sends them to every connected
client, and no separate subscribe request is needed. Clients can receive an
event before the response to the command that caused it.

## Methods

| Method | Parameters | Result |
| --- | --- | --- |
| `status` | none | Current playback snapshot |
| `play` | optional `index` (zero-based queue index) | Playback snapshot |
| `pause`, `resume`, `next`, `prev` | none | Playback snapshot |
| `stop` | none | Stop playback, retain queue and daemon; playback snapshot |
| `seek` | `seconds` (non-negative number) | Playback snapshot |
| `volume` | `volume` (0–100) | Playback snapshot |
| `queue.add` | `query` or `playlistId` | Added queue entries |
| `queue.addTrack` | `track` | Added queue entries |
| `queue.list` | none | Queue entries |
| `queue.remove` | `id` or zero-based `index` | Removed queue entry |
| `queue.move` | entry `id` and zero-based `to` | Snapshot |
| `devices` | none | Available audio output devices |
| `devices.select` | `id` | Available audio output devices after selection |
| `shutdown` | none | `{ "stopping": true }`, then the daemon closes |

Queue entries contain an `id` and a track. Playback snapshots contain
`status`, `current`, `queue`, `position` (seconds), `duration` (seconds or
`null`), `volume`, and `error` (or `null`).

## Event stream

Every event has the shape
`{"jsonrpc":"2.0","version":1,"event":"...","data":...}`.

| Event | `data` |
| --- | --- |
| `state` | Full playback snapshot, emitted whenever player state changes |
| `position` | `{ "position": number, "duration": number|null }` |
| `queue-change` | Current queue entries |
| `track-change` | Queue entry that started |
| `track-ended` | Queue entry that ended |
| `error` | `{ "entry": queueEntry, "error": playerError }` for a skipped track |

The stream is best-effort over the same connection as request/response traffic;
clients should reconnect and call `status` to recover the current state.

## Process ownership

`groovenet player start` runs the daemon in the foreground and owns its
lifecycle until SIGINT or SIGTERM. `groovenet player start --detach` launches
an independent daemon process and returns after its socket answers. The TUI
connects to an existing daemon when present. If it has to create an embedded
daemon, it owns and shuts down that process when the TUI exits. `shutdown` and
`groovenet player stop` request daemon shutdown. On startup, a reachable socket
is treated as live even if the pidfile is absent or stale; an unreachable stale
socket and pidfile are removed and recreated.
