# syntax=docker/dockerfile:1.7

# ============================================================
# Stage 1 — builder
#   Installs full deps, builds the SPA, bundles the standalone
#   server, and materializes a self-contained prod-only directory
#   via `pnpm deploy`.
# ============================================================
FROM node:24-slim AS builder

# Corepack activates the pnpm version pinned in package.json.
# git is needed by the SPA build to read tag + SHA for the version badge.
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so the install layer caches independently of source changes
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/standalone/package.json ./apps/standalone/
COPY packages/core/package.json ./packages/core/
COPY packages/server/package.json ./packages/server/
COPY packages/ui/package.json ./packages/ui/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Source after deps so code changes don't invalidate the install layer
COPY packages/ ./packages/
COPY apps/standalone/ ./apps/standalone/

# Copied late so commit metadata churn doesn't bust the install layer.
COPY .git ./.git

# Build the SPA (vite → packages/ui/build) and bundle the standalone server
# (esbuild → apps/standalone/dist/index.js)
RUN pnpm --filter @muleta-dev/ui build \
 && pnpm --filter @muleta-dev/standalone build

# Materialize a deployable directory for the standalone — strips dev deps,
# resolves workspace deps, leaves only what the bundle imports at runtime.
# `--legacy` is required on pnpm ≥10 unless `inject-workspace-packages` is
# enabled, which we don't need here since the bundle already inlines the
# workspace deps.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @muleta-dev/standalone deploy --prod --legacy /deploy

# ============================================================
# Stage 2 — runtime
#   No pnpm, no tsx, no source TS — just node + the bundle +
#   the prod node_modules + the SPA assets. Runs as a non-root
#   user.
# ============================================================
FROM node:24-slim AS runtime

# Drop privileges. UID is fixed so volume mounts behave predictably.
RUN groupadd --system --gid 1001 muleta \
 && useradd  --system --uid 1001 --gid muleta --no-create-home --shell /usr/sbin/nologin muleta

WORKDIR /app

COPY --from=builder --chown=muleta:muleta /deploy/node_modules ./node_modules
COPY --from=builder --chown=muleta:muleta /app/apps/standalone/dist ./dist
COPY --from=builder --chown=muleta:muleta /app/packages/ui/build ./ui-build

USER muleta

ENV NODE_ENV=production
# Bundled `import.meta.url` no longer points at the original source layout,
# so the SPA build path needs to be told explicitly.
ENV MULETA_UI_BUILD_PATH=/app/ui-build
EXPOSE 3737

CMD ["node", "dist/index.js"]
