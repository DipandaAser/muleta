# @muleta-dev/demo

The public demo for muleta — a self-contained stack that runs Redis, the muleta dashboard, and a long-lived job producer/worker process so visitors hitting [demo.muleta.dev](https://demo.muleta.dev) see a populated, animated dashboard.

Not published to npm. Lives in the monorepo so the demo data, queues, and topology evolve alongside the dashboard.

## What it does

- **Six queues**: `emails`, `webhooks`, `image-resize`, `billing`, `reports`, `orders`. Each has a worker with realistic processing times, progress reporting (image-resize), and a curated mix of transient and permanent failures so the failed-job inspector has interesting content.
- **Three job-schedulers**: a fast-cadence heartbeat (every 90s), a weekday cron (Mon-Fri 09:00 UTC), and a 30-minute reconcile — populates the Schedulers tab with realistic patterns.
- **A flow** queued every 2 minutes — `process-order` parent fans out to `validate-payment`, `reserve-inventory`, `send-confirmation` children — keeps the Flows tab interesting.
- **Realistic-looking data**: synthesized email recipients, webhook URLs, order amounts, image dimensions. No real PII, no real customer data.
- **Bounded volume**: Redis runs with persistence disabled, so any container restart resets the demo. Job retention configured (30min for completed, 2h for failed) so counts stabilize during long-lived sessions.

## Run it locally

```bash
cd apps/demo
docker compose up --build
```

Then:

- Dashboard: <http://localhost:3737> (the muleta service binds to 3737)
- Redis: localhost:6379 (volumeless — Ctrl-C wipes state)

The Caddy service in the compose file expects to bind 80/443 on the host — comment it out for local development if those ports are in use, and hit muleta directly on 3737.

To run just the producer/worker against an existing Redis:

```bash
REDIS_URL=redis://localhost:6379 pnpm dev
```

## Deploy

The compose stack is portable to any Docker host. The minimal flow:

1. Provision a small VPS (1 CPU, 1 GB RAM is plenty) with Docker installed.
2. Open ports `80` and `443` to the world.
3. Point the `demo.muleta.dev` A/AAAA records at the VPS public IP.
4. Clone this repo on the host, `cd apps/demo`, then:

```bash
docker compose up -d --build
```

5. First visit triggers Caddy to obtain a Let's Encrypt cert automatically. After that, traffic flows demo.muleta.dev → Caddy → muleta container → SPA + API.

To redeploy after a code change, `git pull` on the host and `docker compose up -d --build` re-runs the build for the `demo` service. The muleta container pulls `ghcr.io/muleta-dev/muleta:latest`, so a fresh `docker compose pull` brings in dashboard updates.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string for the demo's producer/workers. The compose file points it at the bundled Redis service. |
| `DEMO_PRODUCE_INTERVAL_MS` | `600` | Producer loop cadence. Lower = busier dashboard. |
| `DEMO_FLOW_INTERVAL_MS` | `120000` | Order-flow cadence in ms. |

## Auth posture

The demo dashboard ships **without** authentication. Anyone can visit it and trigger destructive actions (retry / promote / remove jobs, pause queues). That's intentional for the demo experience — visitors get to feel the full UX. Bounded blast radius:

- The data is synthetic, so a vandal can't expose real customer records.
- Redis persistence is disabled, so any state corruption is wiped on the next restart.
- The host should be sized small enough that an unbounded job spam attempt OOM's the demo before it impacts anything else worth protecting.

For your own production muleta deployments, **always** wrap the mount with auth — see [docs/auth.md](../../docs/auth.md).
