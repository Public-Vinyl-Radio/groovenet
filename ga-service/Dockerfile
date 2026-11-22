# syntax=docker/dockerfile:1.7
# uv is pinned too (a tag and its digest); a FROM line so Dependabot can update it.
FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

FROM python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f

COPY --from=uv /uv /bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY . .

# Not root (#1074): uid/gid 1001, the same in every Groovenet image.
RUN groupadd --gid 1001 groovenet && \
    useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin groovenet
USER groovenet

EXPOSE 8002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=5).status == 200 else 1)"

CMD ["python", "-m", "uvicorn", "ga_service:app", "--host", "0.0.0.0", "--port", "8002"]
