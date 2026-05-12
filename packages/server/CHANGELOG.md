# @muleta-dev/server

## 0.2.0

### Minor Changes

- [#59](https://github.com/DipandaAser/muleta/pull/59) [`4440732`](https://github.com/DipandaAser/muleta/commit/44407323178c15a9af85a046035016954e93458b) Thanks [@DipandaAser](https://github.com/DipandaAser)! - Dashboard quality-of-life pass + dependency security updates.
  - **Version badge in the sidebar header.** Tells you which release you're looking at — `v0.2.0` on tagged builds, `v0.2.0+abc1234` on edge images that ship between releases.
  - **Help popover.** Click the `?` in the sidebar footer for Documentation, GitHub, issue reporting, and What's new links — plus a footer showing the running muleta and Redis versions.
  - **Add-job page ~1.8 MB lighter.** Switched Shiki to `shiki/core` with fine-grained `json`/`bash`/`ts` grammar imports + the JS regex engine (drops the Oniguruma WASM). Switched Monaco to the slim `editor.api` entry, dropped the unused CSS/HTML/TS language workers. JSON validation in the data editor preserved.
  - **AdonisJS embed docs fix.** The wildcard route alone doesn't match the bare mount URL — `router.any(MOUNT, handle)` paired with `router.any(\`${MOUNT}/\*\`, handle)`is required. Both`docs/embed.md`and`docs/auth.md` updated.
  - **Security**: bumped Hono to `4.12.18` (patches 5 advisories: `bodyLimit()` bypass, Cache middleware `Vary` handling, `hono/jsx` HTML injection, CSS injection in JSX SSR, JWT `NumericDate` validation). Added a pnpm override pinning `fast-uri >= 3.1.2` to clear two transitive dev-dependency CVEs.

### Patch Changes

- Updated dependencies [[`4440732`](https://github.com/DipandaAser/muleta/commit/44407323178c15a9af85a046035016954e93458b)]:
  - @muleta-dev/core@0.2.0

## 0.1.0

### Minor Changes

- [#45](https://github.com/DipandaAser/muleta/pull/45) [`afb56ae`](https://github.com/DipandaAser/muleta/commit/afb56ae70398e8ae43b7ce4f3caaa5a3e2b8943c) Thanks [@DipandaAser](https://github.com/DipandaAser)! - First public release.

  `@muleta-dev/core` exposes the headless queue model used by every other muleta surface — queue/job/scheduler/worker/flow accessors over BullMQ plus a Redis health probe.

  `@muleta-dev/server` ships the dashboard ready to mount in any Node app: a Hono handler with the SvelteKit SPA bundled inside the package, plus subpath adapters for Express (`@muleta-dev/server/express`) and AdonisJS / NestJS / raw `node:http` (`@muleta-dev/server/node`). Mount it under any URL prefix via the `basePath` option.

  See [docs/embed.md](https://github.com/DipandaAser/muleta/blob/main/docs/embed.md) for framework-specific snippets and [docs/auth.md](https://github.com/DipandaAser/muleta/blob/main/docs/auth.md) for the auth-wrapping pattern — the dashboard ships unauthenticated and exposes destructive job actions, so an auth wrapper is required before deploying.

### Patch Changes

- Updated dependencies [[`afb56ae`](https://github.com/DipandaAser/muleta/commit/afb56ae70398e8ae43b7ce4f3caaa5a3e2b8943c)]:
  - @muleta-dev/core@0.1.0
