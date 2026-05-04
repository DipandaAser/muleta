# Embedding the dashboard

`@muleta-dev/server` ships the muleta dashboard — HTTP API + bundled SvelteKit SPA — as a single `Hono` handler you mount inside your existing app. There's no separate process, no reverse-proxy hop, and no per-mount rebuild: the same bundle works at `/admin/queues`, on a dedicated subdomain, or anywhere else.

If you'd rather run muleta as its own process, see [docs/docker.md](docker.md).

## Install

```bash
npm install @muleta-dev/server hono zod bullmq ioredis
```

`hono` and `zod` are peer dependencies. `bullmq` and `ioredis` come via `@muleta-dev/core`. Node 22+ is required.

## Two pieces

Every embed has the same two pieces:

```ts
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"

// 1. The runtime — opens the Redis connection, exposes queue accessors.
const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })

// 2. The handler — Hono app that serves /api/v1/* + the bundled SPA.
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: "/admin/queues", // see "basePath is required" below
})
```

`dashboard` is a plain Hono app. Mount it however your framework expects.

## basePath is required when mounting under a sub-path

Pass `basePath` matching the URL prefix you mount the handler at. It does **two** things:

1. Injects `window.__MULETA_BASE__` into the served HTML so the SPA's API client targets `<basePath>/api/v1/*`.
2. Strips `<basePath>` when looking up bundled JS/CSS assets on disk — without it, native Hono mounts return HTML for `.js` requests (browser will refuse to load them as modules).

Omit `basePath` (or set it to `""`) only when serving at the host root.

There's no auto-detect: native Hono mounts pass the unaltered request URL into the sub-app, so the handler can't tell the difference between the mount root and a deep-linked SPA route. Express-style adapters strip the prefix before the handler runs and lose it entirely. Be explicit.

## Hono (canonical)

Native, zero-adapter. Used internally by every other framework integration.

```ts
import { serve } from "@hono/node-server"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { Hono } from "hono"

const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: MOUNT,
})

const app = new Hono()

// Auth — see docs/auth.md
app.use(`${MOUNT}/*`, async (c, next) => {
  const user = await authenticate(c.req.raw)
  if (!user?.isAdmin) return c.text("forbidden", 403)
  await next()
})

app.route(MOUNT, dashboard)

serve({ fetch: app.fetch, port: 3000 })
```

Runnable example: [`examples/embed-hono`](https://github.com/DipandaAser/muleta/tree/main/examples/embed-hono).

## Express

Use the `honoToExpress` adapter. Express strips the matched mount prefix from `req.url` before middleware runs, so `basePath` is required for the SPA to know its mount.

```ts
import express from "express"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToExpress } from "@muleta-dev/server/express"

const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: MOUNT,
})

const app = express()

// Auth — see docs/auth.md
app.use(MOUNT, async (req, res, next) => {
  if (!(await isAdmin(req))) return res.status(403).end()
  next()
})

app.use(MOUNT, honoToExpress(dashboard))

app.listen(3000)
```

`honoToExpress` does **not** consume the request body — your existing body parsers (`express.json()`, etc.) keep working at the host level. The adapter passes the raw request through to Hono, which parses bodies on demand.

Runnable example: [`examples/embed-express`](https://github.com/DipandaAser/muleta/tree/main/examples/embed-express).

## AdonisJS

Adonis hands you the underlying `IncomingMessage` / `ServerResponse` via `request.request` / `response.response`. Use `honoToNode` with `stripPath` matching your mount.

```ts
// start/routes.ts
import router from "@adonisjs/core/services/router"
import { middleware } from "#start/kernel"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToNode } from "@muleta-dev/server/node"

const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: MOUNT,
})

router
  .any(`${MOUNT}/*`, async ({ request, response }) => {
    await honoToNode(dashboard, request.request, response.response, {
      stripPath: MOUNT,
    })
  })
  .use(middleware.auth(), middleware.requireAdmin())
```

`stripPath` is required: Adonis doesn't strip the matched mount automatically.

## NestJS

Nest runs on top of Express (or Fastify). For Express-based Nest apps, register `honoToExpress(dashboard)` as middleware via `app.use` in `main.ts`:

```ts
// main.ts
import { NestFactory } from "@nestjs/core"
import { NestExpressApplication } from "@nestjs/platform-express"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToExpress } from "@muleta-dev/server/express"
import { AppModule } from "./app.module"

const MOUNT = "/admin/queues"

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
  const dashboard = createHandler({
    endpoints: createEndpoints(muleta),
    assets: "bundled",
    basePath: MOUNT,
  })
  // Wire your guards / middleware here — see docs/auth.md
  app.use(MOUNT, honoToExpress(dashboard))
  await app.listen(3000)
}
bootstrap()
```

For Fastify-based Nest, file an issue — the `honoToExpress` adapter assumes Express's `(req, res, next)` shape and we don't yet ship a Fastify variant.

## Plain `node:http` / h3

Use `honoToNode`. Pass `stripPath` if your wrapping logic doesn't strip the mount itself.

```ts
import { createServer } from "node:http"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToNode } from "@muleta-dev/server/node"

const MOUNT = "/admin/queues"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: MOUNT,
})

createServer(async (req, res) => {
  if (req.url?.startsWith(MOUNT)) {
    return honoToNode(dashboard, req, res, { stripPath: MOUNT })
  }
  res.writeHead(404).end()
}).listen(3000)
```

Runnable example: [`examples/embed-node-http`](https://github.com/DipandaAser/muleta/tree/main/examples/embed-node-http).

## Mounting at a subdomain

Same handler, mount at the root. Set `basePath` to `""` (or omit it):

```ts
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  // basePath omitted — served at root
})

const app = new Hono()
app.route("/", dashboard)
```

Then point `queues.example.com` at the host. Your reverse proxy / DNS handles the rest.

## API only (no SPA)

Skip `assets` to expose only `/api/v1/*`. Useful when you have your own UI.

```ts
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
})

// Only /api/v1/* is mounted; no HTML, no static asset serving.
app.route("/queues-api", dashboard)
```

## Custom asset path

When developing the SPA outside the published tarball — e.g. running the standalone app from source where `dist/ui/` doesn't exist yet — point at a different build directory:

```ts
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: { path: "/path/to/your/svelte-build" },
  basePath: "/admin/queues",
})
```

## Lifecycle

- `await createMuleta(...)` opens a Redis connection — call it once at app boot, share the instance.
- Call `await muleta.close()` on shutdown to drain pending operations and close the connection. Hook it to your existing `SIGTERM` / `SIGINT` handler.
- The dashboard's HTTP API is stateless beyond the Redis connection — no in-memory queues, no per-request setup cost.

## What you get

The mount serves:

| Path | Purpose |
| --- | --- |
| `<basePath>/` | Dashboard SPA (HTML shell, hashed JS/CSS) |
| `<basePath>/_app/...` | SvelteKit immutable asset bundles |
| `<basePath>/api/v1/queues` | Queue list + counts |
| `<basePath>/api/v1/queues/:name/jobs` | Job list per queue |
| `<basePath>/api/v1/queues/:name/jobs/:id` | Job detail |
| `<basePath>/api/v1/queues/events` | SSE stream of queue updates |
| `<basePath>/api/v1/health/events` | SSE stream of Redis health |
| `<basePath>/api/v1/...` | Schedulers, workers, flows, retry/promote/remove actions |

Endpoint definitions live in [`packages/server/src/endpoints`](https://github.com/DipandaAser/muleta/tree/main/packages/server/src/endpoints). Each route is built with `@hono/zod-openapi` so types are inferred end-to-end if you call the API from TypeScript via the `Handler` type export.

## Auth

The dashboard ships **without** authentication — see [docs/auth.md](auth.md) for the wrapping pattern. Don't deploy embedded muleta to a production host without an auth wrapper in front of the mount.
