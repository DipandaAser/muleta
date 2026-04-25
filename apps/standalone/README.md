# @muleta-dev/standalone

Runnable muleta binary. Reads environment variables, binds a port, serves the JSON API.

Not published — this is the consumer of `@muleta-dev/core` and `@muleta-dev/server` that turns them into a running process.

## Run the pre-built image (fastest)

Multi-arch image on GHCR — works on linux/amd64 + linux/arm64 (Apple Silicon). Point it at any reachable Redis:

```bash
docker run --rm -p 3737:3737 \
  -e MULETA_REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/muleta-dev/muleta:edge
```

Then open <http://localhost:3737>.

Available tags:

| Tag | Moves | Use for |
| --- | --- | --- |
| `:edge` | every push to `main` | early adopters, always-latest |
| `:latest` | newest stable release | production |
| `:X.Y.Z` | pinned forever | reproducible deploys |
| `:sha-<short>` | pinned forever | debugging a specific commit |

## Run with Docker Compose

Starts Redis + muleta together; builds from source so you can tweak the Dockerfile:

```bash
cd apps/standalone
docker compose up --build
```

Then from another terminal:

```bash
curl http://localhost:3737/api/v1/queues
```

## Run from source

Useful during development:

```bash
# 1. Start a Redis
docker run --rm -p 6379:6379 redis:7-alpine

# 2. Boot muleta (from the repo root)
MULETA_REDIS_URL=redis://localhost:6379 \
pnpm -F @muleta-dev/standalone dev

# 3. Hit the API
curl http://localhost:3737/api/v1/queues
```

## Environment

Copy [`.env.example`](./.env.example) to `.env` and fill it in.

| Variable | Required | Notes |
| --- | --- | --- |
| `MULETA_REDIS_URL` | yes | `redis://[:password@]host:port[/db]` |

The standalone always binds `3737`. If you need a different port, map it at the proxy / container layer (`docker run -p 8080:3737`).

Queues are auto-discovered from Redis — any BullMQ queue under the default `bull:` prefix shows up within 15 s. No registration step required.

## Shutdown

Sends `SIGTERM` or `SIGINT` (Ctrl-C). The process drains in-flight requests, closes the Redis connection, then exits.
