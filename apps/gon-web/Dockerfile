# GON web — container image for Cloud Run (P06-S1).
#
# Design (decision D2 in docs/07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md):
# ONE image, three roles — no `output: "standalone"` split:
#   1. HTTP server:            CMD ["npm", "run", "start"]   (next start)
#   2. Schema migrations job:  node scripts/migrate.mjs
#   3. Brew/outbox worker:     same CMD + GON_WORKER_ENABLED=1
#     (src/instrumentation.ts composes the worker runtime)
# Keeping prod node_modules + .next + db/ + scripts/ in the image lets the
# migration job and the worker run `pg` and read db/migrations exactly like
# the local battery, with no second build to drift.
#
# STATUS: NOT RUN in the dev sandbox (no Docker there) — syntax-reviewed only;
# first build happens on Cloud Build (deploy/gcp/45-deploy-web.sh).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.ts tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY db ./db
COPY scripts ./scripts
# No secrets are required at build time: pages are dynamic and the production
# CSP is a static string in next.config.ts.
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080
RUN groupadd --system --gid 1001 gon && useradd --system --uid 1001 --gid gon gon
COPY --chown=gon:gon package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder --chown=gon:gon /app/.next ./.next
COPY --chown=gon:gon next.config.ts ./
COPY --chown=gon:gon db ./db
COPY --chown=gon:gon scripts ./scripts
USER gon
EXPOSE 8080
# `next start` binds 0.0.0.0 (package.json) and reads $PORT (Cloud Run: 8080).
CMD ["npm", "run", "start"]
