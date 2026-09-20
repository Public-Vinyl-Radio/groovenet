# @groovenet/cli

Terminal client for the collection. Binary is `groovenet`; published to npm and
globally installable. All HTTP goes through `@groovenet/client`.

## Configuration

`~/.groovenet/config.json`, managed by the CLI:

```bash
groovenet config set api_base https://groovenet.home.arpa/api
groovenet config show
```

Keys: `api_base`, `api_key`, `default_friend_id`, `username`, `insecure_tls`.

## Commands

```
config     set | show
tracks     search | show | update | missing-apple-music | deleted | restore
           recommend | similar-identity | similar-vibe
albums     list | show | update | download
playlists  list | show | create | generate
friends    list | add
```

**Every command takes `--json`.** Use it for anything programmatic — the default
output is a formatted table with ANSI colour that is painful to parse.

## Layout

```
src/
  bin/         entrypoint, commander wiring
  commands/    one file per group: tracks, albums, playlists, friends, play, config
  output.ts    table and JSON rendering
```

## Build

```bash
npm run build --workspace=packages/groovenet-client   # first
npm run build --workspace=packages/groovenet-cli
node build/bin/groovenet.js --help
```

## Gotchas

- **`play`, `pause`, `stop` and `now-playing` do not work.** They call client
  methods that unconditionally throw `"Server-side playback is not supported by
  this Groovenet API."` The commands are still registered, so they fail at
  runtime rather than being hidden. Either implement the API side or drop them.
- `--json` emits the raw API shape, which is wider than the table columns —
  fields absent from the table are still present in the JSON.
- No eslint config here either; see issue #253.
