# syntax=docker/dockerfile:1.7
# Build context: project root (needed to access packages/groovenet-python)
# gamdl's pywidevine/protobuf dependency is not yet compatible with Python 3.14.
FROM python:3.13-slim

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

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy the local groovenet client so uv can resolve the path dependency
COPY packages/groovenet-python /app/packages/groovenet-python

# Copy worker project files and install deps
COPY download-worker/pyproject.toml download-worker/uv.lock /app/download-worker/

WORKDIR /app/download-worker

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY download-worker/ /app/download-worker/

RUN mkdir -p /app/audio /app/downloads

# The worker has no HTTP server; liveness is a recent heartbeat key in Redis
# refreshed by the main loop (worker.healthcheck reads it).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -m worker.healthcheck

CMD ["python", "-m", "worker.main"]
