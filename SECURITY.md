# Security policy

## Reporting a vulnerability

**Do not file a public GitHub issue for security reports.**

Email **security@muleta.dev** with:

- A description of the issue and the impact you observed
- Steps to reproduce (a minimal repro is ideal — code, config, queue state)
- The muleta version (Docker tag, npm package version, or commit SHA)
- Whether you've shared the report with anyone else

You'll get an acknowledgement within **3 business days**. We aim to ship a patched release within **30 days** of confirming a high-impact vulnerability — sooner if it's actively exploitable, longer if a complex fix needs design review. We'll keep you in the loop and credit you in the release notes unless you ask us not to.

## Scope

In scope:

- The `@muleta-dev/core`, `@muleta-dev/server`, and `@muleta-dev/standalone` packages
- The `ghcr.io/muleta-dev/muleta` Docker image
- The dashboard SPA bundled inside `@muleta-dev/server`
- The HTTP API exposed under `/api/v1/*`

Out of scope (report to the upstream project):

- BullMQ itself
- ioredis / Redis
- Hono, SvelteKit, or any direct dependency
- Vulnerabilities in your own app's auth middleware (see [docs/auth.md](docs/auth.md))

## Threat model

muleta is a **back-office operator tool**. It assumes:

1. **The mount is authenticated by the host app.** muleta ships unauthenticated and exposes destructive actions (retry / promote / remove jobs, pause queues). Mounting without auth means anyone on the network can drain your queues. See [docs/auth.md](docs/auth.md) for the wrapping pattern.
2. **The Redis instance is trusted.** muleta executes BullMQ commands against the configured Redis. Any operator with dashboard access has the same blast radius as `redis-cli` against that instance.
3. **Job payloads are not rendered as HTML.** Job data is shown in a code editor with syntax highlighting only — but if you store HTML in a job's `data` and another part of *your* app renders it raw, that's your XSS, not ours.

If you find a bypass of any of the above — e.g. a way to call destructive APIs without going through your auth middleware, or to escape the JSON viewer into the host page — please report it.

## Supported versions

Pre-1.0. Security fixes target the **latest minor release** (`0.x`). Older 0.x lines are not maintained — pin to a recent version and upgrade promptly.

| Version | Supported |
| --- | --- |
| `0.x` (latest minor) | ✅ |
| Older `0.x` | ❌ |

Once 1.0 ships, this policy will be updated to cover the supported `1.x` line.
