# @muleta-dev/server

## 0.1.0

### Minor Changes

- [#45](https://github.com/DipandaAser/muleta/pull/45) [`afb56ae`](https://github.com/DipandaAser/muleta/commit/afb56ae70398e8ae43b7ce4f3caaa5a3e2b8943c) Thanks [@DipandaAser](https://github.com/DipandaAser)! - First public release.

  `@muleta-dev/core` exposes the headless queue model used by every other muleta surface — queue/job/scheduler/worker/flow accessors over BullMQ plus a Redis health probe.

  `@muleta-dev/server` ships the dashboard ready to mount in any Node app: a Hono handler with the SvelteKit SPA bundled inside the package, plus subpath adapters for Express (`@muleta-dev/server/express`) and AdonisJS / NestJS / raw `node:http` (`@muleta-dev/server/node`). Mount it under any URL prefix via the `basePath` option.

  See [docs/embed.md](https://github.com/DipandaAser/muleta/blob/main/docs/embed.md) for framework-specific snippets and [docs/auth.md](https://github.com/DipandaAser/muleta/blob/main/docs/auth.md) for the auth-wrapping pattern — the dashboard ships unauthenticated and exposes destructive job actions, so an auth wrapper is required before deploying.

### Patch Changes

- Updated dependencies [[`afb56ae`](https://github.com/DipandaAser/muleta/commit/afb56ae70398e8ae43b7ce4f3caaa5a3e2b8943c)]:
  - @muleta-dev/core@0.1.0
