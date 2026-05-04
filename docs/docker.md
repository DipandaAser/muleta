# Running muleta with Docker

Run muleta as its own process — separate from your app, just pointing at the same Redis your queues use. Pre-built multi-arch image on GHCR.

If you'd rather mount the dashboard inside an existing app, see [docs/embed.md](embed.md).

## Quick start

```bash
docker run --rm -p 3737:3737 \
  -e MULETA_REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/muleta-dev/muleta:edge
```

Open <http://localhost:3737>.

The image is multi-arch (`linux/amd64` + `linux/arm64`) — works on Apple Silicon without `--platform`. `host.docker.internal` resolves to the host machine on Docker Desktop (macOS/Windows) and on Linux with `--add-host=host.docker.internal:host-gateway`.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `MULETA_REDIS_URL` | yes | `redis://[user:password@]host:port[/db]`. TLS: `rediss://...` |

That's the entire surface for v0.1. Queues are auto-discovered from Redis — any BullMQ queue under the default `bull:` prefix shows up within 15 s. No registration step required.

The container always binds port `3737`. Map a different host port at the proxy / `docker run -p` level (`-p 8080:3737`).

## Image tags

| Tag | Moves | Use for |
| --- | --- | --- |
| `:edge` | every push to `main` | early adopters, bleeding edge |
| `:latest` | newest stable release | production (after pinning a version once) |
| `:X.Y.Z` | pinned forever | reproducible deploys |
| `:sha-<short>` | pinned forever | debugging a specific commit |

Pin to a version (`:X.Y.Z`) for production. `:latest` is convenient but rolls forward across minor releases that may include behavior changes pre-1.0.

## Docker Compose

A working compose stack lives at [`apps/standalone/compose.yaml`](https://github.com/DipandaAser/muleta/blob/main/apps/standalone/compose.yaml). It builds muleta from source so you can tweak the Dockerfile.

```bash
git clone https://github.com/DipandaAser/muleta
cd muleta/apps/standalone
docker compose up --build
```

Then:

```bash
curl http://localhost:3737/api/v1/queues
```

To switch from build-from-source to the pre-built image, replace the `build:` block:

```yaml
services:
  muleta:
    image: ghcr.io/muleta-dev/muleta:latest
    depends_on:
      redis:
        condition: service_healthy
    environment:
      MULETA_REDIS_URL: redis://redis:6379
    ports:
      - "3737:3737"
```

## Connecting to your existing Redis

If your app's Redis is on the same Docker network, point at the service name:

```bash
docker run --rm -p 3737:3737 \
  --network=my-app-network \
  -e MULETA_REDIS_URL=redis://my-redis:6379 \
  ghcr.io/muleta-dev/muleta:edge
```

For a managed Redis (Upstash, AWS ElastiCache, etc.), use the full `rediss://` URL the provider hands you. muleta uses ioredis under the hood — anything ioredis accepts works.

## Auth

The Docker image ships **without** authentication. The dashboard is not safe to expose publicly without a layer in front.

Production patterns:

- **Reverse proxy with auth** — Caddy / nginx / Traefik in front, with HTTP basic auth or OIDC. Simple and works regardless of whether you're using muleta standalone or embedded.
- **Cloud IAP** — Cloudflare Access, Google IAP, AWS ALB OIDC, Tailscale. The image is just an HTTP service; whatever IAP you already use for internal tools works here.
- **Private network only** — bind to a VPC subnet that isn't internet-routable. Sufficient if your operator workstations connect via VPN.

Don't expose `:3737` to the public internet without one of the above. Destructive actions (retry / promote / remove jobs, pause queues) require no extra confirmation.

## Health check

The container responds to `GET /api/v1/health` with the Redis connection state and a few process metrics — wire it into your orchestrator's health probe.

```bash
curl http://localhost:3737/api/v1/health
# → { "timestamp": 1700000000, "uptimeSeconds": 42,
#     "redis": { "status": "ready", "connected": true, "pingMs": 1, ... } }
```

For Kubernetes:

```yaml
livenessProbe:
  httpGet: { path: /api/v1/health, port: 3737 }
  initialDelaySeconds: 5
readinessProbe:
  httpGet: { path: /api/v1/health, port: 3737 }
```

The endpoint always returns `200` — your probe should check the response body's `redis.connected` if you want to fail readiness when Redis is down. There's also `/api/v1/health/events` (SSE) for live monitoring.

## Shutdown

The container drains in-flight requests on `SIGTERM` / `SIGINT`, closes the Redis connection, then exits. Default `docker stop` grace period (10s) is plenty.

## Troubleshooting

**No queues showing up.** muleta auto-discovers queues by SCAN-ning Redis for keys under the `bull:` prefix. If your queues use a different prefix, that's not yet a configurable option in the standalone image (open an issue if you need it). For embedded mode you can pass `prefix` to `createMuleta`.

**Connection refused to `host.docker.internal`.** On Linux, add `--add-host=host.docker.internal:host-gateway` to your `docker run` command, or use the host's actual LAN IP.

**Queues appear but jobs don't.** Make sure your worker is using the same Redis connection (same URL, same prefix). The dashboard reads what BullMQ writes — if the worker is talking to a different instance, the dashboard will look empty.
