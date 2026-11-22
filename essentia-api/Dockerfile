# syntax=docker/dockerfile:1.7
FROM ghcr.io/mgoltzsche/essentia

RUN apk add --no-cache python3

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY essentia_api.py observability.py ./

# Not root (#1074): uid/gid 1001, the same in every Groovenet image. The service
# is stateless and only writes to /tmp.
RUN addgroup -g 1001 groovenet && adduser -D -u 1001 -G groovenet groovenet
USER groovenet

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=5).status == 200 else 1)"

CMD ["python", "-m", "uvicorn", "essentia_api:app", "--host", "0.0.0.0", "--port", "8001"]
