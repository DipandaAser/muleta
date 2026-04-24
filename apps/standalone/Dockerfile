# syntax=docker/dockerfile:1.7
FROM node:24-slim

# Corepack activates the pnpm version pinned in package.json
RUN corepack enable

WORKDIR /app

# Copy only the files pnpm needs to install — maximizes layer caching
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

# Build the SvelteKit SPA — standalone reads packages/ui/build at runtime
RUN pnpm --filter @muleta-dev/ui build

ENV NODE_ENV=production
EXPOSE 3737

CMD ["pnpm", "--filter", "@muleta-dev/standalone", "start"]
