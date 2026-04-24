import type { z } from "@hono/zod-openapi"
import { createMuleta, type Muleta } from "@muleta-dev/core"
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

  it("GET /api/v1/queues/:name returns a single queue", async () => {
    const handler = createHandler({ endpoints: createEndpoints(muleta) })
    const res = await handler.request("/api/v1/queues/emails")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; displayName: string }
    expect(body).toMatchObject({ name: "emails", displayName: "Email Delivery" })
  })

  it("GET /api/v1/queues/:name returns 404 for unregistered queues", async () => {
    const handler = createHandler({ endpoints: createEndpoints(muleta) })
    const res = await handler.request("/api/v1/queues/ghost")
    expect(res.status).toBe(404)
  })

  it("GET /api/v1/queues/:name/jobs returns a page of jobs", async () => {
    await producer.add("send", { to: "a@b" })
    await producer.add("send", { to: "b@b" })
    await producer.add("send", { to: "c@b" })

    const handler = createHandler({ endpoints: createEndpoints(muleta) })
    const res = await handler.request("/api/v1/queues/emails/jobs?state=waiting&limit=2")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      jobs: Array<{ id: string; name: string; state: string; data: unknown }>
      total: number
    }
    expect(body.total).toBe(3)
    expect(body.jobs).toHaveLength(2)
    expect(body.jobs[0]).toMatchObject({ name: "send", state: "waiting" })
  })

  it("GET /api/v1/queues/:name/jobs rejects invalid state", async () => {
    const handler = createHandler({ endpoints: createEndpoints(muleta) })
    const res = await handler.request("/api/v1/queues/emails/jobs?state=nonsense")
    expect(res.status).toBe(400)
  })

  describe("job detail + actions", () => {
    it("GET /api/v1/queues/:name/jobs/:id returns full detail", async () => {
      const added = await producer.add("send", { to: "a@b" }, { attempts: 2 })
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const res = await handler.request(`/api/v1/queues/emails/jobs/${added.id}`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        id: string
        name: string
        data: unknown
        attempts: number
        stacktrace: string[]
        opts: Record<string, unknown>
      }
      expect(body).toMatchObject({
        id: String(added.id),
        name: "send",
        data: { to: "a@b" },
        attempts: 2,
        stacktrace: [],
      })
      expect(body.opts).toMatchObject({ attempts: 2 })
    })

    it("GET /api/v1/queues/:name/jobs/:id returns 404 for unknown job", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/jobs/does-not-exist")
      expect(res.status).toBe(404)
    })

    it("GET /api/v1/queues/:name/jobs/:id returns 404 for unregistered queue", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/ghost/jobs/1")
      expect(res.status).toBe(404)
    })

    it("DELETE /api/v1/queues/:name/jobs/:id removes the job", async () => {
      const added = await producer.add("send", { to: "doomed" })
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const res = await handler.request(`/api/v1/queues/emails/jobs/${added.id}`, {
        method: "DELETE",
      })
      expect(res.status).toBe(204)

      const after = await muleta.queues.getJob("emails", String(added.id))
      expect(after).toBeNull()
    })

    it("DELETE returns 404 for unknown job", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/jobs/nope", { method: "DELETE" })
      expect(res.status).toBe(404)
    })

    it("POST retry returns 400 when job isn't failed", async () => {
      const added = await producer.add("send", { to: "still-waiting" })
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const res = await handler.request(`/api/v1/queues/emails/jobs/${added.id}/retry`, {
        method: "POST",
      })
      expect(res.status).toBe(400)
    })

    it("POST promote moves a delayed job to waiting", async () => {
      const added = await producer.add("send", { to: "later" }, { delay: 60_000 })
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const res = await handler.request(`/api/v1/queues/emails/jobs/${added.id}/promote`, {
        method: "POST",
      })
      expect(res.status).toBe(204)

      const after = await muleta.queues.getJob("emails", String(added.id))
      expect(after?.state).toBe("waiting")
    })

    it("POST promote returns 400 when job isn't delayed", async () => {
      const added = await producer.add("send", { to: "immediate" })
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const res = await handler.request(`/api/v1/queues/emails/jobs/${added.id}/promote`, {
        method: "POST",
      })
      expect(res.status).toBe(400)
    })
  })

  describe("health", () => {
    it("GET /api/v1/health returns a snapshot", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/health")
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        timestamp: number
        uptimeSeconds: number
        redis: {
          status: string
          connected: boolean
          pingMs: number | null
          address: string
          info?: { version: string }
        }
      }
      expect(body.redis.connected).toBe(true)
      expect(body.redis.status).toBe("ready")
      expect(body.redis.info?.version).toMatch(/^\d+\./)
    })

    it("GET /api/v1/health/events streams SSE health frames", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const controller = new AbortController()
      const res = await handler.request("/api/v1/health/events?interval=500", {
        signal: controller.signal,
      })
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/)

      const reader = res.body?.getReader()
      expect(reader).toBeDefined()
      if (!reader) return

      // Read until we have at least one full SSE frame (two blank lines end it).
      const decoder = new TextDecoder()
      let buffer = ""
      const deadline = Date.now() + 5_000
      while (!buffer.includes("\n\n") && Date.now() < deadline) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) buffer += decoder.decode(value, { stream: true })
      }

      expect(buffer).toContain("event: health")
      expect(buffer).toContain("data:")

      controller.abort()
      await reader.cancel().catch(() => {})
    })
  })
})
