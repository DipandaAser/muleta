# embed-express

Minimal example: embed the muleta dashboard inside an [Express](https://expressjs.com) app, mounted at `/admin/queues`.

The same pattern works for **NestJS** (it's Express under the decorators) — grab the underlying Express instance with `app.getHttpAdapter().getInstance()` and call `expressApp.use("/admin/queues", honoToExpress(dashboard))`.

## Run

```bash
pnpm install
pnpm --filter @muleta-dev/example-embed-express... build
pnpm --filter @muleta-dev/example-embed-express start
```

Visit <http://localhost:3000/admin/queues>.

## Note on `basePath`

Express's `app.use(path, mw)` strips the matched prefix from `req.url` before invoking the middleware, so Hono's `/api/v1/*` routes match directly. We pass `basePath: "/admin/queues"` to `createHandler` so the SPA's client still knows the original mount path after navigation.
