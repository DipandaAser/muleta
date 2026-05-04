# syntax=docker/dockerfile:1.7

# Self-contained Dockerfile. Build context is `apps/demo/` itself —
# nothing outside this directory is needed, so the image builds
# correctly under platforms that pin context to the Dockerfile's
# directory (Dokploy, etc.) and from a manual `docker build .` here.
#
# The demo has zero workspace deps — only `faker`, `bullmq`, `ioredis`
# from the public registry — so we install with plain npm and skip the
# monorepo / pnpm machinery the rest of the repo uses.

FROM node:24-slim AS runtime

RUN groupadd --system --gid 1001 demo \
 && useradd  --system --uid 1001 --gid demo --no-create-home --shell /usr/sbin/nologin demo

WORKDIR /app

# Install deps first so this layer caches when only src/ changes.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
 && npm install --no-audit --no-fund tsx@4.21.0 typescript@^6.0.3 \
 && npm cache clean --force

# Source last so it doesn't bust the install cache on every code change.
COPY src ./src

RUN chown -R demo:demo /app
USER demo

ENV NODE_ENV=production

# tsx runs the entry point directly — no compile step. The demo isn't
# perf-sensitive and tsx has parity with `node` for our usage. tsconfig
# is intentionally not copied: tsx falls back to sensible defaults and
# the workspace tsconfig.base.json isn't reachable from this context
# anyway.
CMD ["node_modules/.bin/tsx", "src/index.ts"]
