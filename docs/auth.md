# Authentication

**muleta ships without authentication.** The dashboard exposes destructive actions — retry, promote, remove jobs, pause queues, enqueue new jobs. Mounting it without auth is equivalent to running `redis-cli` against your queue Redis from the public internet.

This is intentional: muleta has no opinion on how your app authenticates users, what counts as "admin", or where session state lives. You wrap the mount with whatever middleware you already use elsewhere.

## The pattern

Whatever framework you're embedding into, the rule is the same:

1. Run your auth check **before** the dashboard mount
2. On failure, return early with `401` or `403`
3. On success, fall through to the dashboard

## Hono

```ts
import { Hono } from "hono"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: "/admin/queues",
})

const app = new Hono()

app.use("/admin/queues/*", async (c, next) => {
  const user = await authenticate(c.req.raw) // your function
  if (!user?.isAdmin) return c.text("forbidden", 403)
  await next()
})

app.route("/admin/queues", dashboard)
```

The `*` glob is required — without it the middleware only fires on the exact `/admin/queues` URL, not the asset and API routes underneath.

## Express

```ts
import express from "express"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToExpress } from "@muleta-dev/server/express"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: "/admin/queues",
})

const app = express()

app.use("/admin/queues", async (req, res, next) => {
  const user = await authenticate(req) // your function
  if (!user?.isAdmin) return res.status(403).end()
  next()
})

app.use("/admin/queues", honoToExpress(dashboard))
```

Order matters — register the auth middleware **before** the `honoToExpress(dashboard)` mount.

## AdonisJS

AdonisJS already runs middleware ahead of the route handler — use a [route group](https://docs.adonisjs.com/guides/routing#route-groups) and apply your auth middleware there.

```ts
// start/routes.ts
import router from "@adonisjs/core/services/router"
import { middleware } from "#start/kernel"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { honoToNode } from "@muleta-dev/server/node"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })
const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: "/admin/queues",
})

router
  .any("/admin/queues/*", async ({ request, response }) => {
    await honoToNode(dashboard, request.request, response.response, {
      stripPath: "/admin/queues",
    })
  })
  .use(middleware.auth(), middleware.requireAdmin()) // your existing middleware
```

## What "logged in" should mean

A few things to think through when wiring auth — these aren't muleta-specific, but they're worth calling out:

- **Treat the dashboard as production access.** Even read-only views like the queue list reveal job names, user IDs in payloads, scheduler patterns. Gate it behind whatever you'd gate a database admin tool with.
- **Two roles are usually enough**: `admin` (everything) and `viewer` (read-only). muleta's UI doesn't have a viewer mode yet — the destructive buttons are always rendered — so for now, only grant access to operators who should be allowed to modify queue state.
- **Bot-friendly auth (Basic, mTLS, JWT)** works fine for the API side (`/api/v1/*`), but the dashboard SPA expects browser-cookie auth or a session header your app already understands. If you need API-only access from a script, hit the muleta endpoints directly — see [docs/embed.md](embed.md) for the route shape.

## Roadmap

A built-in viewer/admin role split, audit log of mutating actions, and an optional bearer-token mode are tracked in the roadmap. They will not change the wrapping pattern above — wrapping with your own middleware will always work.
