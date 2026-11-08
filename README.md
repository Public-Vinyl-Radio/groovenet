<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/src/assets/groovenet-wordmark-white.png" />
    <img src="site/src/assets/groovenet-wordmark-black.png" alt="GrooveNet" width="320" />
  </picture>
</p>

<p align="center">A self-hosted vinyl collection manager for DJs.</p>

<p align="center">
  <a href="https://groovenet.publicvinylradio.com">Website</a> ·
  <a href="https://groovenet.publicvinylradio.com/docs/">Docs</a> ·
  <a href="https://github.com/Public-Vinyl-Radio/groovenet/releases">Releases</a>
</p>

<p align="center">
  <a href="https://github.com/Public-Vinyl-Radio/groovenet/releases"><img src="https://img.shields.io/github/v/release/Public-Vinyl-Radio/groovenet?filter=v%2A&display_name=tag&label=app" alt="App release" /></a>
  <a href="https://github.com/Public-Vinyl-Radio/groovenet/pkgs/container/webapp"><img src="https://img.shields.io/github/v/tag/Public-Vinyl-Radio/groovenet?filter=v%2A&display_name=tag&label=GHCR%20image" alt="GHCR image tag" /></a>
  <a href="https://www.npmjs.com/package/@groovenet/cli"><img src="https://img.shields.io/npm/v/%40groovenet/cli?label=cli" alt="CLI npm version" /></a>
  <a href="https://www.npmjs.com/package/@groovenet/client"><img src="https://img.shields.io/npm/v/%40groovenet/client?label=client" alt="Client npm version" /></a>
  <a href="https://www.npmjs.com/package/@groovenet/player"><img src="https://img.shields.io/npm/v/%40groovenet/player?label=player" alt="Player npm version" /></a>
  <a href="https://github.com/Public-Vinyl-Radio/groovenet/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/Public-Vinyl-Radio/groovenet/test.yml?label=tests" alt="Tests" /></a>
  <a href="https://codecov.io/gh/Public-Vinyl-Radio/groovenet"><img src="https://img.shields.io/codecov/c/github/Public-Vinyl-Radio/groovenet" alt="Coverage" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Public-Vinyl-Radio/groovenet" alt="MIT license" /></a>
  <a href="https://app.netlify.com/"><img src="https://api.netlify.com/api/v1/badges/68e328bc-78a1-4bde-9c98-8808db621261/deploy-status" alt="Netlify deploy status" /></a>
</p>

GrooveNet imports your Discogs collection, enriches it with streaming metadata, analyzes audio for BPM, key, and mood, and helps you build better DJ playlists. Use it in the web or iOS app, from the `groovenet` CLI, or through the MCP server.

## Screenshots

<table>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="site/src/assets/screenshots/tracks-rows-desktop-dark.png" /><img src="site/src/assets/screenshots/tracks-rows-desktop-light.png" alt="Track list with search and filters" /></picture><br /><sub>Collection</sub></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="site/src/assets/screenshots/album-desktop-dark.png" /><img src="site/src/assets/screenshots/album-desktop-light.png" alt="Album details and track list" /></picture><br /><sub>Album</sub></td>
  </tr>
  <tr>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="site/src/assets/screenshots/optimiser-desktop-dark.png" /><img src="site/src/assets/screenshots/optimiser-desktop-light.png" alt="Playlist ordering tools" /></picture><br /><sub>Playlist optimiser</sub></td>
    <td width="50%"><picture><source media="(prefers-color-scheme: dark)" srcset="site/src/assets/screenshots/genres-desktop-dark.png" /><img src="site/src/assets/screenshots/genres-desktop-light.png" alt="Genres in the collection" /></picture><br /><sub>Genres</sub></td>
  </tr>
</table>

## Features

- **Collection search** — fast full-text and fuzzy search with filtering and infinite scroll.
- **Metadata enrichment** — link Discogs releases to Apple Music, YouTube, and SoundCloud; bulk-edit and complete metadata with AI.
- **Audio intelligence** — analyze downloaded audio with Essentia for BPM, key, and mood.
- **Playlist tools** — generate transitions based on BPM, key, mood, and genre.
- **Collection sharing** — browse friends’ collections and keep a listening history.
- **Automation** — manage the collection through the CLI or MCP server.
- **Data ownership** — self-hosted PostgreSQL, backups, restore, and optional remote storage.

## Quick start

```bash
cp .env.example .env
docker compose up -d
```

Configure the required environment values, then open the app at <http://localhost:3000>. See the [setup guide](https://groovenet.publicvinylradio.com/docs/getting-started/) for configuration, importing a Discogs collection, and updates.

## What's in the repo

| Project                                           | Description                                            |
| ------------------------------------------------- | ------------------------------------------------------ |
| [Web app](my-collection-search/)                  | Self-hosted collection manager and API.                |
| [CLI](packages/groovenet-cli/)                    | Terminal client for managing GrooveNet.                |
| [MCP server](mcp-server/)                         | Connect GrooveNet tools to an assistant.               |
| [Now Playing player](packages/groovenet-player/)  | Desktop player and queue for GrooveNet.                |
| [iOS app](ios/DJPlaylistMobile/DJPlaylistMobile/) | Browse playlists and download tracks from your server. |
| [Brick preview](apps/groovenet-brick/)            | Native C++/SDL2 controller and desktop mock preview.   |
| [Site](site/)                                     | Website and product documentation.                     |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor workflow.

## License

GrooveNet is released under the [MIT License](LICENSE).
