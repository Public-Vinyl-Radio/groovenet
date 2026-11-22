# syntax=docker/dockerfile:1.7
# uv is pinned too (a tag and its digest); a FROM line so Dependabot can update it.
FROM ghcr.io/astral-sh/uv:0.13.9@sha256:d3b601f0c7b118bc1753febf7c41cc80981df678445e0254284eecf84db79a7d AS uv

FROM ghcr.io/mgoltzsche/essentia@sha256:789fd48047b95a8184cab4d51bd581bea04bab85a38f58615711b5f5e1809f65

# The base image is Alpine 3.19.0, which ships a libxml2 with CVE-2024-56171 (critical,
# fixed in 2.11.8-r1). Upgrade just that package until the base image is rebuilt.
RUN apk add --no-cache python3 && apk upgrade --no-cache libxml2

COPY --from=uv /uv /bin/uv

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
