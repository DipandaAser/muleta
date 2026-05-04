# @muleta-dev/server

Embed the [muleta](https://muleta.dev) dashboard in your Node app. Hono-based HTTP handler with the SPA bundled inside the package — single install, single mount point.

## Install

```bash
npm install @muleta-dev/server hono zod bullmq ioredis
```

`hono` and `zod` are peer dependencies; `bullmq` and `ioredis` come via `@muleta-dev/core`.

## Mount it

### Hono (canonical)

```ts
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled", // serves the SPA from the package's dist/ui/
})

const app = new Hono()
app.route("/admin/queues", dashboard) // mount anywhere
serve({ fetch: app.fetch, port: 3000 })
```

The SPA's API client auto-detects the mount path at runtime, so the same bundle works at `/admin/queues`, on a dedicated subdomain, or anywhere else without a per-mount rebuild.

> Express, NestJS, AdonisJS, and plain Node `http` adapters land in a follow-up release — for v0.1, mount via Hono or run the [Docker image](https://github.com/DipandaAser/muleta/pkgs/container/muleta).

## Auth

**muleta has no built-in authentication.** Wrap the mount with your own admin auth middleware:

```ts
app.use("/admin/*", yourAuthMiddleware)
app.route("/admin/queues", dashboard)
```

## Status

**Pre-1.0.** API can change between `0.x` minor releases — see [CHANGELOG](https://github.com/DipandaAser/muleta/blob/main/CHANGELOG.md).

## License

[Apache-2.0](./LICENSE)
