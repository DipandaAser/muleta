# @muleta/standalone

Runnable muleta binary. Reads environment variables, binds a port, serves the JSON API.

Not published — this is the consumer of `@muleta/core` and `@muleta/server` that turns them into a running process.

## Run with Docker Compose

Fastest path. Starts Redis + muleta together:

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
MULETA_QUEUES=emails,webhooks \
pnpm -F @muleta/standalone dev

# 3. Hit the API
curl http://localhost:3737/api/v1/queues
```

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MULETA_REDIS_URL` | yes | — | `redis://[:password@]host:port[/db]` |
| `MULETA_PORT` | no | `3737` | Port to bind |
| `MULETA_QUEUES` | no | *(none)* | Comma-separated queue names to register; autodiscovery lands in a later change |

## Shutdown

Sends `SIGTERM` or `SIGINT` (Ctrl-C). The process drains in-flight requests, closes the Redis connection, then exits.
