# embed-node-http

Minimal example: embed the muleta dashboard inside a plain `node:http` server, mounted at `/admin/queues`.

This is the same pattern that works for **AdonisJS v6** — its router hands you the underlying `IncomingMessage` / `ServerResponse` via `request.request` / `response.response`, and you delegate to `honoToNode` with the mount prefix stripped:

```ts
// start/routes.ts
router.any("/admin/queues/*", async ({ request, response }) => {
  await honoToNode(dashboard, request.request, response.response, {
    stripPath: "/admin/queues",
  })
})
```

Same idea applies to **h3** (`event.node.req` / `event.node.res`) and any framework that exposes the raw Node request/response.

## Run

```bash
pnpm install
pnpm --filter @muleta-dev/example-embed-node-http... build
pnpm --filter @muleta-dev/example-embed-node-http start
```

Visit <http://localhost:3000/admin/queues>.

## Why `stripPath`?

Plain `node:http` (and AdonisJS) keep the full request URL — `/admin/queues/api/v1/queues` arrives as-is, not stripped to `/api/v1/queues` like Express would. `stripPath: "/admin/queues"` tells the adapter to strip the prefix before delegating to Hono, so the dashboard's `/api/v1/*` routes still match.
