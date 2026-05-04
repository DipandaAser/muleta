# syntax=docker/dockerfile:1.7

# ============================================================
# Stage 1 — installer
#   pnpm-deploys the demo app into a self-contained directory so
#   the runtime image doesn't ship the full monorepo or dev deps.
# ============================================================
FROM node:24-slim AS installer

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/demo/package.json ./apps/demo/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @muleta-dev/demo...

COPY apps/demo/ ./apps/demo/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @muleta-dev/demo deploy --prod --legacy /deploy

# tsx isn't in the prod deps (it's devDependency), but the runtime
# uses it to run TypeScript directly without a compile step. Install
# it into the deploy directory.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    cd /deploy && pnpm add tsx@4.21.0

# ============================================================
# Stage 2 — runtime
#   Runs the seeder + workers under tsx. No SPA, no muleta server —
#   the dashboard runs in a separate container.
# ============================================================
FROM node:24-slim AS runtime

RUN groupadd --system --gid 1001 demo \
 && useradd  --system --uid 1001 --gid demo --no-create-home --shell /usr/sbin/nologin demo

WORKDIR /app

COPY --from=installer --chown=demo:demo /deploy/node_modules ./node_modules
COPY --from=installer --chown=demo:demo /app/apps/demo/src ./src
COPY --from=installer --chown=demo:demo /app/apps/demo/package.json ./package.json

USER demo

ENV NODE_ENV=production

CMD ["node_modules/.bin/tsx", "src/index.ts"]
