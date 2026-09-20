# DJ Playlist — System Architecture (for Claude Code)

## Overview
Multi-service vinyl collection management system combining a Next.js web app with Python microservices for audio analysis, downloads, and AI-powered playlist generation. Designed for DJs to manage their Discogs collections with rich metadata from Apple Music, Spotify, YouTube, and audio analysis.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Next.js App (Port 3000)                │
│  - Web UI (React 19, Chakra UI v3)                          │
│  - API Routes (tracks, playlists, friends, AI search)       │
│  - React Query for caching/optimistic updates               │
└──────────────┬──────────────────────────────────────────────┘
               │
       ┌───────┴────────┬─────────────┬──────────────┐
       │                │             │              │
   ┌───▼────┐      ┌────▼────┐   ┌───▼────┐    ┌────▼────┐
   │ Postgres│      │PostgreSQL search  │ Redis  │    │Essentia │
   │(pgvector)│     │ (Search) │  │(Queue) │    │API      │
   │Port 5432│      │Port 7700│   │Port 6379    │Port 8001│
   └────┬────┘      └─────────┘   └───┬────┘    └────┬────┘
        │                              │              │
        │                         ┌────▼─────┐        │
        │                         │Download  │        │
        │                         │ Worker   │────────┘
        │                         │(Python)  │
        │                         └──────────┘
        │
        │                         ┌──────────┐
        └─────────────────────────┤GA Service│
                                  │Port 8002 │
                                  │(FastAPI) │
                                  └──────────┘
```

### Services

#### 1. Next.js App (my-collection-search/)
- **Purpose**: Main web application and API server
- **Tech**: Next.js 15, React 19, TypeScript, Chakra UI v3, TanStack Query v5
- **Responsibilities**:
  - User interface for browsing/searching collections
  - REST API endpoints for tracks, playlists, friends
  - Integration with external APIs (Discogs, Apple Music, Spotify, YouTube, OpenAI)
  - Database operations and PostgreSQL search indexing
  - Job queue management (enqueuing download tasks)
- **See**: `my-collection-search/CLAUDE.md` for detailed app architecture

#### 2. PostgreSQL + pgvector
- **Purpose**: Primary data store with vector search capabilities
- **Image**: `pgvector/pgvector:pg15`
- **Features**:
  - Stores tracks, playlists, playlist_tracks, friends tables
  - pgvector extension for semantic similarity search using OpenAI embeddings
  - Compound primary key (track_id, username) allows multi-user collections
- **Migrations**: Managed via node-pg-migrate in `my-collection-search/migrations/`

#### 3. PostgreSQL search
- **Purpose**: Fast full-text search engine for instant track search
- **Image**: `pgvector/pgvector:pg15`
- **Features**:
  - Indexes denormalized track documents from Postgres
  - Searchable fields: title, artist, album, genres, styles, notes, tags
  - Filterable fields: BPM, key, star_rating, platform URLs, username
  - Custom ranking rules for relevance
- **Note**: Postgres is source of truth; PostgreSQL search is read-only index

#### 4. Redis
- **Purpose**: Job queue for background tasks
- **Image**: `redis:7-alpine`
- **Use Cases**:
  - Download worker job queue (audio file downloads)
  - Future: Audio analysis jobs, playlist generation tasks
- **Note**: Currently used primarily for download-worker; expandable for other async tasks

#### 5. Essentia API (Python FastAPI)
- **Purpose**: Audio analysis microservice
- **Tech**: FastAPI, Python, Essentia library
- **Port**: 8001
- **Capabilities**:
  - Extracts audio features: BPM, musical key, danceability
  - Mood analysis: happy, sad, aggressive, relaxed scores
  - Runs **after** audio files are downloaded
- **Image**: `ghcr.io/public-vinyl-radio/essentia-api:v1.0.78` (prod)
- **Source**: `essentia-api/` directory

#### 6. Download Worker (Python)
- **Purpose**: Background service for downloading audio files
- **Tech**: Python, gamdl (download tool)
- **Responsibilities**:
  - Pulls download jobs from Redis queue
  - Downloads audio from YouTube, Apple Music, etc.
  - Uses cookies for authenticated access (YouTube Premium, Apple Music)
  - Saves files to shared `/audio` volume
  - Triggers Essentia API for audio analysis
  - Updates database via Next.js API with extracted metadata
- **Image**: `ghcr.io/public-vinyl-radio/download-worker:v1.0.78` (prod)
- **Cookie Storage**: Shared `cookie_data` volume for gamdl authentication

#### 7. GA Service (Genetic Algorithm Playlist Generator)
- **Purpose**: AI-powered playlist generation using genetic algorithms
- **Tech**: FastAPI, Python
- **Port**: 8002
- **Functionality**:
  - Accepts seed playlist tracks
  - Applies fitness function based on BPM matching, key compatibility, mood progression
  - Generates optimized playlist flow
- **Image**: `ghcr.io/public-vinyl-radio/ga-service:v1.0.78` (prod)

#### 8. Shared Client Package (`packages/groovenet-client`)
- **Package name**: `@groovenet/client`
- **Purpose**: Single typed API client shared by the MCP server and CLI
- **Key exports**: `GroovenetClient`, `loadConfig`/`saveConfig`, domain types (`Track`, `Album`, `Playlist`, `Friend`), Zod schemas
- **Important**: Types are copied from `my-collection-search/src/types/track.ts` — the Next.js app remains the source of truth
- **Build**: `npm run build --workspace=packages/groovenet-client`

#### 9. CLI (`packages/groovenet-cli`)
- **Package name**: `@groovenet/cli` — published to npm, globally installable
- **Binary**: `groovenet`
- **Config**: `~/.groovenet/config.json` (set via `groovenet config set api_base <url>`)
- **Commands**: `tracks`, `albums`, `playlists`, `play/pause/stop/now-playing`, `friends`, `config`
- **All commands support `--json`** for machine-readable output
- **Build**: `npm run build --workspace=packages/groovenet-cli`
- **Publish**: `npm publish` inside both `packages/groovenet-client` and `packages/groovenet-cli`

#### 10. MCP Server (`mcp-server/`)
- **Purpose**: Exposes collection tools to Claude Code via Model Context Protocol
- **Config**: `API_BASE` and `API_KEY` env vars (no `~/.groovenet/config.json` — daemon mode)
- **Uses**: `GroovenetClient` from `@groovenet/client` — no bespoke API calls
- **Tools**: tracks (search/details/update/missing-apple-music), albums (search/get/update/download), playlists, friends, Apple Music search, YouTube search
- **Build**: `npm run build --workspace=mcp-server`
- **Register**: `claude mcp add --transport stdio --scope project groovenet -- node /path/to/mcp-server/build/index.js`

## Data Flow

### Collection Import Flow
```
User → Next.js UI → Discogs API
              ↓
      Parse & Store in Postgres
              ↓
      Index in PostgreSQL search
              ↓
      Display in UI
```

### Audio Download & Analysis Flow
```
User requests download → Next.js API
              ↓
      Enqueue job in Redis
              ↓
      Download Worker picks up job
              ↓
      gamdl downloads file (with cookies if needed)
              ↓
      File saved to /audio volume
              ↓
      Worker calls Essentia API
              ↓
      Essentia extracts BPM, key, mood, etc.
              ↓
      Worker updates track via Next.js API
              ↓
      Postgres updated & PostgreSQL search re-indexed
              ↓
      UI reflects new metadata
```

### Playlist Generation Flow
```
User selects tracks → Next.js UI
              ↓
      POST to /api/playlists/genetic
              ↓
      Next.js calls GA Service
              ↓
      GA Service runs genetic algorithm
              ↓
      Optimized playlist returned
              ↓
      Display in UI
```

## Docker Compose Configurations

### `docker-compose.yml` (Base - Local Builds)
- Builds all images from source
- Platform-agnostic (x86_64, ARM64)
- Suitable for development and Mac production deployments
- Services: app, db, search, essentia-api, migrate

### `docker-compose.dev.yml` (Development Overrides)
- Extends base configuration
- Volume mounts source code for hot reload
- Development optimizations
- **Usage**: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`

### `docker-compose.prod.yml` (Production - Registry Images)
- Uses pre-built images from GitHub Container Registry
- **Architecture**: x86_64/amd64 only (ARM64 not yet published)
- All services: app, db, search, redis, essentia, ga-service, download-worker
- Named volumes for data persistence
- **Usage**: `docker compose -f docker-compose.prod.yml up -d`
- **Ideal for**: Linux servers, Portainer deployments

## Deployment Options

### Development (Any Platform)
```bash
cd my-collection-search
cp .env.example .env
# Edit .env with credentials
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
docker compose run --rm migrate
```

### Production - Linux x86_64 (Portainer or CLI)
```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml run --rm migrate
```

### Production - Mac ARM64
```bash
docker compose -f docker-compose.yml up --build -d
docker compose run --rm migrate
```

## Volumes & Data Persistence

- `db_data` — PostgreSQL database files
- `search_indexes_data` — PostgreSQL search index data
- `redis_data` — Redis persistence
- `music_data` — Downloaded audio files (shared: app ↔ download-worker)
- `db_dumps` — Database backup SQL files
- `cookie_data` — gamdl authentication cookies (shared: app ↔ download-worker)
- `discogs_exports` — Exported Discogs collection data
- `spotify_exports` — Exported Spotify data

## Environment Variables

See `my-collection-search/.env.example` for full list. Key variables:

### Required
- `DATABASE_URL` — Postgres connection string
- `DATABASE_URL` — Search engine config
- `DISCOGS_USER_TOKEN`, `DISCOGS_USERNAME` — Collection import

### Optional (Platform Integrations)
- `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY_PATH`
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`
- `YOUTUBE_API_KEY`
- `OPENAI_API_KEY` — AI features & vector embeddings

### Service URLs
- `REDIS_URL` — Redis connection (default: `redis://redis:6379`)
- `ESSENTIA_API_URL` — Audio analysis endpoint (default: `http://essentia:8001/analyze`)

## CI/CD & Releases

### Image Building
- **Trigger**: Push git tag (e.g., `v1.0.78`)
- **Process**: GitHub Actions builds and pushes images to `ghcr.io/public-vinyl-radio/*`
- **Images**:
  - `ghcr.io/public-vinyl-radio/webapp:v1.0.78` (Next.js app)
  - `ghcr.io/public-vinyl-radio/essentia-api:v1.0.78`
  - `ghcr.io/public-vinyl-radio/ga-service:v1.0.78`
  - `ghcr.io/public-vinyl-radio/download-worker:v1.0.78`

### Version Updates
- **Process**: automated via [release-please](https://github.com/googleapis/release-please) + Conventional Commits. See `RELEASING.md`.
  1. Land Conventional Commit PRs on `main` (PR title is the commit — squash merge).
  2. release-please opens/updates a **Release PR** (bumps version + `CHANGELOG.md`).
  3. Merging the Release PR creates tag `vX.Y.Z` → `docker-publish.yml` publishes `ghcr.io/public-vinyl-radio/*:vX.Y.Z` (+ `latest`).
  4. Deploy by pinning `IMAGE_TAG=vX.Y.Z` and pulling on the box (see `RELEASING.md`).
- Version source of truth: root `package.json` (mirrored to `my-collection-search/package.json` for the About page).
- Requires the `RELEASE_PLEASE_TOKEN` PAT secret (GITHUB_TOKEN-created tags don't trigger builds).

### Architecture Note
- Images are published for **x86_64/amd64 only** by design (homelab targets are amd64).
- arm64 is intentionally not built to avoid slow QEMU emulation in CI. If arm64 is
  needed later, switch the build to native arm64 runners rather than emulation.

## Architectural Decisions

### Why PostgreSQL search?
- Faster, simpler setup than Elasticsearch for small-to-medium datasets
- Built-in typo tolerance and relevance ranking
- Lightweight resource footprint
- Real-time indexing

### Why pgvector?
- Enables semantic similarity search using OpenAI embeddings
- Keeps vector data co-located with relational data
- Simpler architecture than separate vector DB (Pinecone, Weaviate)

### Why FastAPI for Microservices?
- Python ecosystem for ML/audio libraries (Essentia, genetic algorithms)
- Fast async performance for API endpoints
- Easy integration with Next.js via REST

### Why gamdl?
- Handles authenticated downloads from Apple Music, YouTube Premium
- Cookie-based authentication for premium services
- Reliable for bulk downloads

### Why Redis for Background Jobs?
- Lightweight, fast queue management
- Simple pub/sub for worker coordination
- Expandable for future async tasks (batch analysis, scheduled imports)

### Why Python Workers?
- Better ecosystem for audio processing, ML tasks
- Decouples heavy I/O (downloads) from Next.js event loop
- Horizontal scaling: run multiple workers if needed

## Common Operations

### Add Migration
```bash
cd my-collection-search
npm run migrate create my-migration-name
# Edit migration file in migrations/
npm run migrate up  # Apply locally
docker compose run --rm migrate  # Apply in Docker
```

### Re-index PostgreSQL search
```bash
# Via UI: Navigate to /admin/reindex (if implemented)
# Via API: POST to appropriate re-index endpoint
# Or manually: Delete index and re-import from Postgres
```

### Backup Database
```bash
# Via UI: POST /api/backup
# Via CLI:
docker compose exec db pg_dump -U djplaylist djplaylist > dumps/backup_$(date +%F).sql
```

### Restore Database
```bash
# Via UI: POST /api/restore with SQL file
# Via CLI:
docker compose exec -T db psql -U djplaylist djplaylist < dumps/backup_2025-01-15.sql
```

### View Worker Logs
```bash
docker compose logs -f download-worker
```

### Manually Queue Download Job
```bash
# Connect to Redis:
docker compose exec redis redis-cli
# Add job (format depends on worker implementation):
LPUSH download-queue '{"track_id": "12345", "source": "youtube", "url": "..."}'
```

### Update Production Images
```bash
# 1. Tag new version
git tag v1.0.79 && git push origin v1.0.79
# 2. Wait for GitHub Actions to build
# 3. Update docker-compose.prod.yml with new tag
# 4. On server:
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Download Worker Not Processing Jobs
```bash
# Check Redis connection:
docker compose exec redis redis-cli ping

# Check queue contents:
docker compose exec redis redis-cli LLEN download-queue

# View worker logs:
docker compose logs download-worker

# Verify cookie file exists:
docker compose exec download-worker ls -la /app/cookies/
```

### Essentia Analysis Failing
```bash
# Check service is running:
curl http://localhost:8001/health

# View logs:
docker compose logs essentia-api

# Verify audio file permissions:
docker compose exec app ls -la /app/audio/
```

### PostgreSQL search Out of Sync
```bash
# Check index stats:
curl http://localhost:7700/indexes/tracks/stats \
  -H "Authorization: Bearer mysupersecretkey"

# Trigger re-index via app (implementation-dependent)
```

### Port Conflicts
```bash
# Check what's using port:
lsof -i :3000  # or 5432, 7700, etc.

# Modify ports in docker-compose.yml if needed:
ports:
  - "3001:3000"  # Map external 3001 to internal 3000
```

## Development Tips

### Adding a New Background Job Type
1. Define job schema/interface
2. Enqueue job from Next.js API via Redis
3. Update download-worker to handle new job type
4. Test locally with `docker compose logs -f download-worker`

### Adding a New Microservice
1. Create service directory (e.g., `my-service-api/`)
2. Add Dockerfile
3. Add service to `docker-compose.yml` (local build)
4. Add to GitHub Actions workflow for image builds
5. Add to `docker-compose.prod.yml` with registry image

### Working on Next.js App
See `my-collection-search/CLAUDE.md` for detailed frontend/API development guide.

### Testing Genetic Algorithm
```bash
# Call GA service directly:
curl -X POST http://localhost:8002/generate \
  -H "Content-Type: application/json" \
  -d '{"playlist": [...]}'
```

## Project Goals

- **Single Source of Truth**: Postgres for data, PostgreSQL search for search
- **Async Heavy Tasks**: Offload downloads/analysis to background workers
- **Multi-Platform Support**: Aggregate metadata from Discogs, Apple, Spotify, YouTube
- **Rich Audio Metadata**: BPM, key, mood for DJ-quality playlist building
- **Collaboration**: Multi-user support via friends system
- **Self-Hosted**: Fully containerized, run anywhere with Docker

## Future Enhancements

- [ ] ARM64 image builds for Apple Silicon production deployments
- [ ] Automated version bump script
- [ ] Horizontal scaling for download workers
- [ ] Scheduled jobs (auto-sync Discogs collections, check for new releases)
- [ ] Advanced playlist features (harmonic mixing, energy curves)
- [ ] WebSocket for real-time download progress
- [ ] User authentication & authorization (currently single-user focused)

## Contributing

When working across services:
1. Keep data contracts consistent (Track schema, API responses)
2. Update both app and worker when changing shared models
3. Test full flow: UI → API → Redis → Worker → Essentia → DB → PostgreSQL search
4. Document new environment variables in `.env.example`
5. Add migrations for schema changes
6. Update both CLAUDE.md files (root + my-collection-search/) if relevant
7. When adding new API endpoints: add the method to `packages/groovenet-client/src/client.ts`, then wire into CLI and/or MCP server — types in `my-collection-search/src/types/track.ts` are the source of truth, copy to `packages/groovenet-client/src/types.ts` if they change
8. Build order matters: client → cli → mcp-server (`just build-packages`)
9. `just bootstrap` installs the pre-commit hook (`.pre-commit-config.yaml`); run `just lint-all` to check the whole repo as CI does. `packages/groovenet-python` is generated and excluded from it.

## See Also

- `my-collection-search/CLAUDE.md` — Deep dive into Next.js app architecture
- `mcp-server/README.md` — MCP server tool reference and setup
- `packages/groovenet-client/` — Shared typed API client source
- `packages/groovenet-cli/` — CLI source
- `README.md` — User-facing documentation and setup guide
- `my-collection-search/.env.example` — Complete environment variable reference
