# @muleta-dev/core

Core library for [muleta](https://muleta.dev) — the operator dashboard for [BullMQ](https://docs.bullmq.io). Headless queue registry, job/worker/scheduler/flow accessors, and a Redis health probe. No HTTP, no UI.

Most users want [`@muleta-dev/server`](https://www.npmjs.com/package/@muleta-dev/server) instead — that ships the dashboard ready to mount in your app. Reach for `@muleta-dev/core` when you need raw programmatic access to the same internals (e.g. building custom tooling on top of muleta's queue model).

## Install

```bash
npm install @muleta-dev/core bullmq ioredis
```

`bullmq` and `ioredis` are peer dependencies — pin them in your own app.

## Usage

```ts
import { createMuleta } from "@muleta-dev/core"

const muleta = await createMuleta({
  redis: { url: process.env.REDIS_URL! },
  queues: [{ name: "emails" }, { name: "webhooks", displayName: "Webhooks" }],
})

const queues = await muleta.queues.list()
const flows = await muleta.queues.getAllFlows()
const health = await muleta.health()

// when shutting down
await muleta.close()
```

The full surface lives in [`src/index.ts`](https://github.com/DipandaAser/muleta/blob/main/packages/core/src/index.ts) — `QueueRegistry`, `JobInfo`, `JobDetail`, `JobSchedulerInfo`, `WorkerInfo`, `FlowSummary`, `FlowJobNode`, plus the `MuletaOptions` config and `InvalidJobStateError` / `JobNotFoundError` typed errors.

## Status

**Pre-1.0.** API can change between `0.x` minor releases — see [CHANGELOG](https://github.com/DipandaAser/muleta/blob/main/CHANGELOG.md).

## License

[Apache-2.0](./LICENSE)
