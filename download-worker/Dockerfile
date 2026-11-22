# syntax=docker/dockerfile:1.7
# uv is pinned too (a tag and its digest); a FROM line so Dependabot can update it.
FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

# Build context: project root (needed to access packages/groovenet-python)
# Keep on Python 3.13. gamdl's pywidevine/protobuf dependency crashes at import
# on 3.14 ("TypeError: Metaclasses with custom tp_new are not supported"), which
# fails every Apple Music download. Dependabot must NOT bump this: it is ignored
# in .github/dependabot.yml, and docker-publish.yml smoke-tests `gamdl --help`
# in the built image. Revisit once gamdl/pywidevine/protobuf support 3.14.
FROM python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /var/lib/apt/lists/lock /var/cache/apt/archives/lock && \
    apt-get update && apt-get install -y \
    ffmpeg \
    mediainfo \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy only the client build inputs, keeping tests/docs out of the image.
COPY packages/groovenet-python/pyproject.toml packages/groovenet-python/README.md /app/packages/groovenet-python/
COPY packages/groovenet-python/groovenet_client /app/packages/groovenet-python/groovenet_client

# Copy worker project files and install deps
COPY download-worker/pyproject.toml download-worker/uv.lock /app/download-worker/

WORKDIR /app/download-worker

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY download-worker/ /app/download-worker/

# Not root (#1074). uid/gid 1001 is shared by every Groovenet image, so the
# volumes the worker shares with the app (audio, covers, cookies, essentia-data)
# are writable without group tricks. Existing volumes are re-owned on upgrade by
# the `volume-perms` service. HOME holds the gamdl and yt-dlp caches.
RUN groupadd --gid 1001 groovenet && \
    useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin groovenet && \
    mkdir -p /app/audio /app/downloads /app/cookies /app/essentia-data /app/public/uploads/album-covers && \
    chown groovenet:groovenet /app/audio /app/downloads /app/cookies /app/essentia-data /app/public/uploads/album-covers
USER groovenet

# The worker has no HTTP server; liveness is a recent heartbeat key in Redis
# refreshed by the main loop (worker.healthcheck reads it).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -m worker.healthcheck

CMD ["python", "-m", "worker.main"]
