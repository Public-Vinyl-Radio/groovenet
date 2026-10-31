# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-bookworm-slim AS node
FROM docker:29-cli AS docker-cli
FROM ubuntu:24.04

LABEL org.opencontainers.image.source="https://github.com/Public-Vinyl-Radio/groovenet"
LABEL org.opencontainers.image.description="Groovenet Node and Python CI native tools"

# Only the image publisher contacts apt; test jobs consume a verified digest.
RUN printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' > /etc/apt/apt.conf.d/80-ci-retries && \
    apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates curl git gnupg xz-utils zstd python3 \
      libatomic1 libstdc++6 ffmpeg libchromaprint1 && \
    rm -rf /var/lib/apt/lists/*

# Keep the Ubuntu runner's Python/native libraries and copy official Node.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Compose config checks do not need a Docker daemon in the job container.
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

ARG NPM_VERSION=12.0.1
RUN npm install -g "npm@${NPM_VERSION}" && \
    test "$(npm --version)" = "$NPM_VERSION" && \
    ffmpeg -version && ffprobe -version && \
    python3 -c "import ctypes; ctypes.CDLL('libchromaprint.so.1')" && \
    docker compose version

# Chromium's system libraries for the Storybook render check (#681). The job runs
# as a non-root user and cannot apt-install, so it only downloads the browser.
# Keep the Playwright version in step with my-collection-search/package.json.
RUN npx --yes playwright@1.64.0 install-deps chromium && rm -rf /var/lib/apt/lists/* /root/.npm

# Match hosted runner ownership and ordinary filesystem permission checks.
RUN useradd --create-home --uid 1001 --user-group --shell /bin/bash ci
USER 1001:1001
ENV HOME=/home/ci
WORKDIR /home/ci
