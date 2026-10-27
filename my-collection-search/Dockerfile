# syntax=docker/dockerfile:1.19

# OS layers never depend on a package manifest or source file.
FROM node:26-bookworm-slim AS os-base

FROM os-base AS base
# All stages inherit the app's exact npm pin, checked against mise in CI.
COPY my-collection-search/package.json /tmp/npm-toolchain.json
RUN npm install -g "npm@$(node -p "require('/tmp/npm-toolchain.json').engines.npm")" && \
    test "$(npm --version)" = "$(node -p "require('/tmp/npm-toolchain.json').engines.npm")"

FROM os-base AS postgres-base
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends curl gnupg ca-certificates && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list

FROM postgres-base AS runtime-base
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      git \
      ffmpeg \
      mediainfo \
      restic \
      postgresql-client-16 \
      docker-ce-cli \
      gosu

# The stock Node image's npm/npx symlinks already point into this directory.
COPY --from=base /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=base /tmp/npm-toolchain.json /tmp/npm-toolchain.json
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs -m nextjs

# Every path a named volume mounts over has to exist here first. Docker seeds a
# new volume's ownership from the image, so a path missing from this list is
# created root-owned and the app — running as nextjs — cannot write to it.
# `audio-ingest` was missing, and the ingest route (#275) failed every upload
# with EACCES while reporting a 500 the listener device politely retried.
#
# The symlinks that used to live here (pointing app code's process.cwd()-relative
# reads — cookies, dumps, discogs_exports, audio, audio-ingest, essentia-data,
# public/uploads/album-covers — at these volumes) moved to entrypoint.sh: Next's
# generated standalone server.js runs `process.chdir(__dirname)` at startup,
# which is the nested directory outputFileTracingRoot produces
# (/app/my-collection-search/my-collection-search, not this WORKDIR), so a
# symlink created here at build time was never where the running server
# actually looked. entrypoint.sh finds that real directory at container start
# instead of hardcoding it.
RUN mkdir -p /app/my-collection-search /app/cookies /app/dumps /app/discogs_exports /app/audio /app/audio-ingest /app/essentia-data /app/public/uploads/album-covers && \
    chown -R nextjs:nodejs /app

COPY --chmod=755 my-collection-search/entrypoint.sh /entrypoint.sh

# Dev installs into its persistent volume at startup; it needs no app build.
FROM runtime-base AS dev
WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000"]

FROM base AS workspace-deps
WORKDIR /repo
COPY package.json package-lock.json ./
# Keep this list aligned with the root package.json workspaces.
COPY packages/groovenet-contracts/package.json ./packages/groovenet-contracts/
COPY packages/groovenet-client/package.json ./packages/groovenet-client/
COPY packages/groovenet-player/package.json ./packages/groovenet-player/
COPY packages/groovenet-cli/package.json ./packages/groovenet-cli/
COPY mcp-server/package.json ./mcp-server/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

FROM workspace-deps AS deps
COPY my-collection-search/package.json my-collection-search/package-lock.json ./my-collection-search/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefix my-collection-search --ignore-scripts

FROM deps AS contracts
COPY packages/groovenet-contracts/tsconfig.json ./packages/groovenet-contracts/
COPY --exclude=**/*.test.ts packages/groovenet-contracts/src ./packages/groovenet-contracts/src
RUN npm run build --workspace=@groovenet/contracts
# The web app bundles @groovenet/client/player-session, the part of the client
# with no Node imports; it resolves through the client's build output.
COPY packages/groovenet-client/tsconfig.json ./packages/groovenet-client/
COPY --exclude=**/*.test.ts packages/groovenet-client/src ./packages/groovenet-client/src
RUN npm run build --workspace=@groovenet/client

# Frontend inputs are shared by Storybook and Next. Backend routes/services,
# tests and documentation do not invalidate Storybook or dependency installs.
FROM contracts AS frontend
WORKDIR /repo/my-collection-search
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY my-collection-search/tsconfig.json my-collection-search/next.config.mjs ./
COPY --exclude=app --exclude=server --exclude=scripts --exclude=workers \
     --exclude=test --exclude=instrumentation.ts --exclude=instrumentation-client.ts \
     --exclude=**/__tests__ --exclude=**/*.test.* --exclude=**/*.spec.* \
     my-collection-search/src ./src
COPY my-collection-search/src/app/chakraTheme.ts my-collection-search/src/app/houseStyle.ts \
     my-collection-search/src/app/fonts.ts my-collection-search/src/app/fontChoices.ts ./src/app/
COPY my-collection-search/src/app/fonts ./src/app/fonts
COPY --exclude=**/*.test.* my-collection-search/src/app/palettes ./src/app/palettes

FROM frontend AS storybook
ENV STORYBOOK_DISABLE_TELEMETRY=1
COPY my-collection-search/.storybook ./.storybook
COPY my-collection-search/scripts/check-storybook.mjs ./scripts/check-storybook.mjs
RUN npm run build-storybook

FROM frontend AS builder
COPY --exclude=**/__tests__ --exclude=**/*.test.* --exclude=**/*.spec.* \
     my-collection-search/src ./src
COPY my-collection-search/sentry.*.config.ts ./
COPY my-collection-search/config ./config
COPY my-collection-search/content ./content
COPY my-collection-search/public ./public
# Next must inventory the verified Storybook bundle before building.
COPY --from=storybook /repo/my-collection-search/public/storybook ./public/storybook
RUN --mount=type=cache,target=/repo/my-collection-search/.next/cache \
    npm run build

FROM runtime-base AS runner
WORKDIR /app/my-collection-search

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output (next.config.mjs: output: "standalone"): a
# self-contained server with a traced, minimal node_modules — far smaller than
# copying the full dependency tree, so much less to build/push per image.
COPY --from=builder --chown=nextjs:nodejs /repo/my-collection-search/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/my-collection-search/.next/static ./my-collection-search/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/my-collection-search/public ./my-collection-search/public

# Build metadata surfaced by the About page (/api/version). Kept last so these
# per-commit values don't invalidate the cache of the COPY/apt layers above.
ARG GIT_SHA
ARG BUILD_TIME
ARG APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
# outputFileTracingRoot (next.config.mjs) points at the monorepo root, so
# Next's standalone output nests this app's own server.js one level deeper
# than this WORKDIR — but WORKDIR must stay here: cookieUtils.ts and
# backupStatusService.ts resolve their directories off process.cwd(), which
# only lines up with the volume symlinks below (cookies, dumps, ...) at this
# level. `node <path>` doesn't change cwd, so this keeps both correct.
CMD ["node", "my-collection-search/server.js"]

FROM postgres-base AS migrator
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends postgresql-client-15
COPY --from=base /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
COPY --from=base /tmp/npm-toolchain.json /tmp/npm-toolchain.json
RUN --mount=type=cache,target=/root/.npm \
    npm install -g node-pg-migrate@8.0.4
COPY --from=contracts /repo /repo
WORKDIR /repo/my-collection-search

# Migrations run without the Next.js source tree. Copy their runtime inputs
# directly so this target does not depend on an application build.
COPY my-collection-search/migrations ./migrations
COPY my-collection-search/scripts ./scripts
COPY my-collection-search/src/server/genres/taxonomySeed.js ./src/server/genres/taxonomySeed.js

# Verify every migration can load in the deployed image before publishing it.
# Database-only tests on the checkout cannot detect missing image dependencies.
RUN node --input-type=module -e "import { readdir } from 'node:fs/promises'; for (const file of await readdir('./migrations')) { if (file.endsWith('.js')) await import('./migrations/' + file); }"

# One-off maintenance scripts (src/scripts/*.ts), e.g. backfill-key-confidence
# (#524). Built on demand only — not part of the CI publish pipeline, and not
# started by a plain `docker compose up` (see its `scripts` profile). Reuses
# `contracts`' node_modules, which still has devDependencies (tsx) here
# in the build, before `builder`/`runner` set NODE_ENV=production.
FROM base AS scripts
WORKDIR /repo/my-collection-search
COPY --from=contracts /repo/node_modules /repo/node_modules
COPY --from=contracts /repo/my-collection-search/node_modules ./node_modules
COPY --from=contracts /repo/packages/groovenet-contracts /repo/packages/groovenet-contracts
COPY --from=contracts /repo/packages/groovenet-client /repo/packages/groovenet-client
COPY my-collection-search/package*.json my-collection-search/tsconfig.json ./
COPY my-collection-search/src ./src
