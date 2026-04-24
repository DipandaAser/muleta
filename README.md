# muleta

Open-source BullMQ dashboard and toolkit.

<img src="muleta-cover.png" alt="Open-source BullMQ dashboard" >

> Status: very early. The repository is being scaffolded.

## Requirements

- Node.js 20 or later
- [pnpm](https://pnpm.io) 9 or later
- A running Redis (for development)

## Quick start

### Run the pre-built Docker image

```bash
docker run --rm -p 3737:3737 \
  -e MULETA_REDIS_URL=redis://host.docker.internal:6379 \
  ghcr.io/muleta-dev/muleta:edge
```

Multi-arch image (`linux/amd64` + `linux/arm64`). Open <http://localhost:3737>. See [`apps/standalone/README.md`](apps/standalone/README.md) for tag semantics and compose setup.

### Build from source

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
