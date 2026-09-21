# syntax=docker/dockerfile:1.7
FROM python:3.14-slim

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

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY . .

RUN mkdir -p /app/audio-ingest

# Fail the build rather than the first job if the native library is missing:
# `pyacoustid` imports fine without it and only raises when asked to work.
RUN python -c "import chromaprint; print('libchromaprint', chromaprint._libchromaprint.chromaprint_get_version())"

# Queue-driven: no HTTP server, and deliberately no published port. Liveness is
# a recent heartbeat key in Redis refreshed by the main loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -m fingerprint_service.healthcheck

CMD ["python", "-m", "fingerprint_service.main"]
