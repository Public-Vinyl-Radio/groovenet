# syntax=docker/dockerfile:1.7
# uv is pinned too (a tag and its digest); a FROM line so Dependabot can update it.
FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

# Build context: project root (shared Python client is a path dependency).
FROM python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f

# ffmpeg decodes ingested chunks to PCM; libchromaprint fingerprints them.
# Both are native, and keeping them in this image rather than the web one is
# why the service was split out in the first place (#273).
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /var/lib/apt/lists/lock /var/cache/apt/archives/lock && \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libchromaprint1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY packages/groovenet-python/pyproject.toml packages/groovenet-python/README.md /app/packages/groovenet-python/
COPY packages/groovenet-python/groovenet_client /app/packages/groovenet-python/groovenet_client

WORKDIR /app/fingerprint-service
COPY fingerprint-service/pyproject.toml fingerprint-service/uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY fingerprint-service/ ./

# Not root (#1074): uid/gid 1001, shared by every Groovenet image so the ingest
# and audio volumes need no group tricks. The mount points exist here so a fresh
# volume starts out owned by this user; existing ones are re-owned by the
# `volume-perms` service.
RUN groupadd --gid 1001 groovenet && \
    useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin groovenet && \
    mkdir -p /app/audio-ingest /app/audio /app/set-recordings && \
    chown groovenet:groovenet /app/audio-ingest /app/audio /app/set-recordings

# Fail the build rather than the first job if the native library is missing:
# `pyacoustid` imports fine without it and only raises when asked to work.
RUN python -c "import chromaprint; print('libchromaprint', chromaprint._libchromaprint.chromaprint_get_version())"

# Queue-driven: no HTTP server, and deliberately no published port. Liveness is
# a recent heartbeat key in Redis refreshed by the main loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -m fingerprint_service.healthcheck

USER groovenet
CMD ["python", "-m", "fingerprint_service.main"]
