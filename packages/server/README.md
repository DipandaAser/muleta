# @muleta-dev/server

Embed the [muleta](https://muleta.dev) dashboard in your Node app. Hono-based HTTP handler with the SPA bundled inside the package — single install, single mount point.

## Install

```bash
npm install @muleta-dev/server hono zod bullmq ioredis
```

`hono` and `zod` are peer dependencies; `bullmq` and `ioredis` come via `@muleta-dev/core`. Node 22+ required.

## Mount it

### Hono (canonical)

```ts
import { serve } from "@hono/node-server"
import { createMuleta } from "@muleta-dev/core"
import { createEndpoints, createHandler } from "@muleta-dev/server"
import { Hono } from "hono"

const muleta = await createMuleta({ redis: { url: process.env.REDIS_URL! } })

const dashboard = createHandler({
  endpoints: createEndpoints(muleta),
  assets: "bundled",
  basePath: "/admin/queues",
})

const app = new Hono()
app.route("/admin/queues", dashboard)
serve({ fetch: app.fetch, port: 3000 })
```

`basePath` matches the URL prefix you mount at — required when mounting under any sub-path. Same bundle works at `/admin/queues`, on a dedicated subdomain, or anywhere else without a per-mount rebuild.

### Other frameworks

Adapters ship as subpath imports:

| Framework | Adapter | Example |
| --- | --- | --- |
| Express | `@muleta-dev/server/express` (`honoToExpress`) | [`examples/embed-express`](https://github.com/DipandaAser/muleta/tree/main/examples/embed-express) |
| AdonisJS / NestJS / `node:http` / h3 | `@muleta-dev/server/node` (`honoToNode`) | [`examples/embed-node-http`](https://github.com/DipandaAser/muleta/tree/main/examples/embed-node-http) |

Full embed guide with framework-by-framework snippets: <https://github.com/DipandaAser/muleta/blob/main/docs/embed.md>.

## Auth

**muleta has no built-in authentication.** The dashboard exposes destructive actions (retry, remove, pause). Wrap the mount with your own admin auth middleware before deploying:

```ts
app.use("/admin/queues/*", yourAuthMiddleware)
app.route("/admin/queues", dashboard)
```

Patterns for Hono / Express / Adonis: <https://github.com/DipandaAser/muleta/blob/main/docs/auth.md>.

## Status

**Pre-1.0.** API can change between `0.x` minor releases — see [CHANGELOG](https://github.com/DipandaAser/muleta/blob/main/CHANGELOG.md).

## License

[Apache-2.0](./LICENSE)
