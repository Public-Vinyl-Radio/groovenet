---
title: Install GrooveNet
description: Start a self-hosted collection with Docker Compose.
sidebar:
  order: 1
---

The simplest self-hosted install needs [Docker Compose v2](https://docs.docker.com/compose/).

```bash
git clone https://github.com/Public-Vinyl-Radio/groovenet.git
cd groovenet

cp .env.example .env
# Edit .env: at minimum, set POSTGRES_PASSWORD and your Discogs values.

docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.local.yml run --rm migrate
```

Open [http://localhost:3000](http://localhost:3000), then [import your Discogs collection](/docs/getting-started/discogs/). The stack stores its database, audio, exports, backups, and cookies in Docker volumes.

Choose the [environment settings](/docs/configuration/environment/) before starting. See [running and updating](/docs/getting-started/running/) for daily commands and Compose modes.
