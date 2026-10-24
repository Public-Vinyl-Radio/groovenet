FROM node:26-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/groovenet-contracts/package.json packages/groovenet-contracts/
COPY packages/groovenet-client/package.json packages/groovenet-client/
COPY packages/groovenet-player/package.json packages/groovenet-player/
COPY packages/groovenet-cli/package.json packages/groovenet-cli/
COPY mcp-server/package.json mcp-server/
RUN npm install -g "npm@$(node -p "require('./package.json').engines.npm")" && npm ci --ignore-scripts
COPY packages/groovenet-contracts packages/groovenet-contracts
COPY packages/groovenet-client packages/groovenet-client
COPY packages/groovenet-player packages/groovenet-player
RUN npm run build --workspace @groovenet/contracts && npm run build --workspace @groovenet/client && npm run build --workspace @groovenet/player

FROM node:26-bookworm-slim
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/groovenet-contracts ./packages/groovenet-contracts
COPY --from=build /repo/packages/groovenet-client ./packages/groovenet-client
COPY --from=build /repo/packages/groovenet-player ./packages/groovenet-player
USER node
EXPOSE 13700
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:13700/health',{headers:{Authorization:'Bearer '+process.env.PLAYER_API_KEY}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/groovenet-player/build/server/bin.js"]
