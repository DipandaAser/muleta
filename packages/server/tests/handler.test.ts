import type { z } from "@hono/zod-openapi"
import { createMuleta, type Muleta } from "@muleta/core"
import { Queue } from "bullmq"
import { hc } from "hono/client"
import { Redis } from "ioredis"
import { GenericContainer, type StartedTestContainer } from "testcontainers"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  createEndpoints,
  createHandler,
  type Handler,
  type ListQueuesResponseSchema,
} from "../src/index.js"

type ListQueuesResponse = z.infer<typeof ListQueuesResponseSchema>

describe("createHandler", () => {
  let container: StartedTestContainer
  let redisUrl: string

  beforeAll(async () => {
    container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start()
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
  })

  afterAll(async () => {
    await container.stop()
  })

  let muleta: Muleta
  let producerConnection: Redis
  let producer: Queue

  beforeEach(async () => {
    muleta = await createMuleta({
      redis: { url: redisUrl },
      queues: [{ name: "emails", displayName: "Email Delivery" }],
    })

    producerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null })
    producer = new Queue("emails", { connection: producerConnection })
  })

  afterEach(async () => {
    await producer.obliterate({ force: true }).catch(() => {})
    await producer.close()
    producerConnection.disconnect()
    await muleta.close()
  })

  it("GET /api/v1/queues returns the registered queues with counts", async () => {
    await producer.add("send", { to: "a@b.com" })
    await producer.add("send", { to: "c@d.com" }, { delay: 60_000 })

    const handler = createHandler({ endpoints: createEndpoints(muleta) })

    const res = await handler.request("/api/v1/queues")
    expect(res.status).toBe(200)

    const body = (await res.json()) as ListQueuesResponse

    expect(body.queues).toHaveLength(1)
    expect(body.queues[0]).toMatchObject({
      name: "emails",
      displayName: "Email Delivery",
      isPaused: false,
    })
    expect(body.queues[0]?.counts.waiting).toBe(1)
    expect(body.queues[0]?.counts.delayed).toBe(1)
  })

  it("returns 404 for unknown routes", async () => {
    const handler = createHandler({ endpoints: createEndpoints(muleta) })
    const res = await handler.request("/api/v1/does-not-exist")
    expect(res.status).toBe(404)
  })

  // Proves the chained-app refactor preserves route-level type inference:
  // if the Handler type lost its schema, hc<Handler>.api.v1.queues wouldn't compile.
  it("is reachable through hc<Handler> with typed routes", async () => {
    await producer.add("send", { to: "a@b.com" })

    const handler = createHandler({ endpoints: createEndpoints(muleta) })
    const client = hc<Handler>("http://localhost/", {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        handler.fetch(new Request(input, init)),
    })

    const res = await client.api.v1.queues.$get()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.queues[0]?.counts.waiting).toBe(1)
  })
})
