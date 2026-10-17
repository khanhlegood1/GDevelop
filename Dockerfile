# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# Preserve paths used by file: dependencies and by the resource import scripts.
COPY . .
# .git is deliberately excluded; derive a cache/version identifier from the
# clean build context before npm creates generated files and node_modules.
RUN find . -type f -print0 | sort -z | xargs -0 sha256sum \
    | sha256sum | cut -d ' ' -f1 > /tmp/gdevelop-source-version
WORKDIR /src/newIDE/app
RUN npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
WORKDIR /src/GDJS
RUN npm ci --no-audit --no-fund
WORKDIR /src/newIDE/app
# Do not enable development mode in production. Only the runtime source changes.
ENV REACT_APP_SELF_HOSTED=true \
    GENERATE_SOURCEMAP=false \
    NODE_OPTIONS=--max-old-space-size=6144
RUN npx --no-install patch-package \
    && GDEVELOP_BUILD_COMMIT="$(cat /tmp/gdevelop-source-version)" npm run build \
    && node scripts/copy-GDJS-Runtime-to-build.js \
    && test -s build/libGD.js \
    && test -s build/libGD.wasm \
    && test -s build/GDJS/Runtime/index.html

FROM node:22-bookworm-slim AS storage
WORKDIR /app
COPY deploy/storage/server.js ./server.js
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3001/api/storage/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

FROM nginxinc/nginx-unprivileged:1.28-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /src/newIDE/app/build/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
