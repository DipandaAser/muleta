# embed-hono

Minimal example: embed the muleta dashboard inside a [Hono](https://hono.dev) app, mounted at `/admin/queues`.

## Run

```bash
# from the muleta repo root
pnpm install
pnpm --filter @muleta-dev/example-embed-hono... build  # build the workspace deps
pnpm --filter @muleta-dev/example-embed-hono start

# REDIS_URL defaults to redis://localhost:6379
# PORT defaults to 3000
```

Visit <http://localhost:3000/admin/queues>.

## Files

- [`src/index.ts`](src/index.ts) — the whole thing, ~25 lines

## Auth

The placeholder middleware is where you'd plug your real admin auth. Muleta's dashboard ships **unauthenticated** — anyone who can reach the mount can see jobs, retry, and remove them.
