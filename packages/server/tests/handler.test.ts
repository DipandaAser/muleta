import type { z } from "@hono/zod-openapi"
import { createMuleta, type Muleta } from "@muleta-dev/core"
import { Queue, Worker } from "bullmq"
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

  describe("POST /api/v1/queues/:name/pause and /resume", () => {
    it("pause flips isPaused to true; resume flips it back", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const pauseRes = await handler.request("/api/v1/queues/emails/pause", { method: "POST" })
      expect(pauseRes.status).toBe(204)
      const paused = await muleta.queues.get("emails")
      expect(paused.isPaused).toBe(true)

      const resumeRes = await handler.request("/api/v1/queues/emails/resume", { method: "POST" })
      expect(resumeRes.status).toBe(204)
      const resumed = await muleta.queues.get("emails")
      expect(resumed.isPaused).toBe(false)
    })

    it("returns 404 for unregistered queues on both verbs", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const pauseRes = await handler.request("/api/v1/queues/ghost/pause", { method: "POST" })
      expect(pauseRes.status).toBe(404)

      const resumeRes = await handler.request("/api/v1/queues/ghost/resume", { method: "POST" })
      expect(resumeRes.status).toBe(404)
    })
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

  describe("POST /api/v1/queues/:name/jobs", () => {
    it("enqueues a job and returns 201 + JobInfo", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "send-welcome",
          data: { to: "ada@example.com" },
          opts: { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
        }),
      })

      expect(res.status).toBe(201)
      const body = (await res.json()) as { id: string; name: string; attempts: number }
      expect(body.name).toBe("send-welcome")
      expect(body.attempts).toBe(5)

      // Round-trip: the job is now visible to getJobs.
      const result = await muleta.queues.getJobs("emails", { states: ["waiting"] })
      expect(result.jobs.map((j) => j.id)).toContain(body.id)
    })

    it("returns 404 when the queue isn't registered", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/ghost/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x", data: {} }),
      })
      expect(res.status).toBe(404)
    })

    it("returns 400 on invalid backoff type", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "x",
          opts: { backoff: { type: "linear", delay: 1000 } },
        }),
      })
      expect(res.status).toBe(400)
    })

    it("returns 400 when name is missing", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: { foo: 1 } }),
      })
      expect(res.status).toBe(400)
    })
  })

  describe("GET /api/v1/jobs/names", () => {
    it("returns the global job-name index", async () => {
      // Seed a couple of names by enqueueing through the registry.
      await muleta.queues.addJob("emails", "send-welcome", {})
      await muleta.queues.addJob("emails", "send-receipt", {})

      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/jobs/names")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { names: string[] }
      expect(body.names).toEqual(expect.arrayContaining(["send-welcome", "send-receipt"]))
    })

    it("lazily refreshes from Redis when the index is empty", async () => {
      // Producer (outside muleta) drops a name in.
      await producer.add("external-name", {})
      // No addJob call → index hasn't recorded it yet.

      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/jobs/names")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { names: string[] }
      expect(body.names).toContain("external-name")
    })
  })

  describe("GET /api/v1/workers", () => {
    it("returns an empty list when no workers are connected", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/workers")
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        workers: Array<{ name: string | null; queue: string }>
      }
      expect(body.workers).toEqual([])
    })

    it("surfaces a connected worker tagged with its queue and parsed name", async () => {
      const worker = new Worker(
        "emails",
        async () => {
          // Idle worker — never resolves a job, just stays connected.
        },
        {
          connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
          name: "api-worker-1",
        },
      )
      try {
        await worker.waitUntilReady()
        const handler = createHandler({ endpoints: createEndpoints(muleta) })
        const res = await handler.request("/api/v1/workers")
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          workers: Array<{
            id: string
            name: string | null
            queue: string
            ageSeconds: number
            idleSeconds: number
          }>
        }
        const w = body.workers.find((w) => w.queue === "emails")
        expect(w).toBeDefined()
        expect(w?.name).toBe("api-worker-1")
        expect(w?.id).toBeTruthy()
        expect(w?.ageSeconds).toBeGreaterThanOrEqual(0)
        expect(w?.idleSeconds).toBeGreaterThanOrEqual(0)
      } finally {
        await worker.close()
      }
    })

    it("flattens workers across multiple registered queues", async () => {
      // Adds a second queue post-construction so we exercise the loop in
      // `getWorkers` rather than just the single-queue path. Mirrors the
      // core registry's multi-queue test at the HTTP boundary so a future
      // accidental per-queue-only response would fail here too.
      muleta.queues.register({ name: "reports" })
      const reportsProducer = new Queue("reports", { connection: producerConnection })
      const emailsWorker = new Worker("emails", async () => {}, {
        connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
        name: "api-emails-1",
      })
      const reportsWorker = new Worker("reports", async () => {}, {
        connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
        name: "api-reports-1",
      })
      try {
        await Promise.all([emailsWorker.waitUntilReady(), reportsWorker.waitUntilReady()])
        const handler = createHandler({ endpoints: createEndpoints(muleta) })
        const res = await handler.request("/api/v1/workers")
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          workers: Array<{ name: string | null; queue: string }>
        }
        const queues = new Set(body.workers.map((w) => w.queue))
        expect(queues.has("emails")).toBe(true)
        expect(queues.has("reports")).toBe(true)
        const names = body.workers.map((w) => w.name)
        expect(names).toEqual(expect.arrayContaining(["api-emails-1", "api-reports-1"]))
      } finally {
        await Promise.all([emailsWorker.close(), reportsWorker.close()])
        await reportsProducer.obliterate({ force: true }).catch(() => {})
        await reportsProducer.close()
      }
    })
  })

  describe("GET /api/v1/queues/:name/schedulers", () => {
    it("returns an empty list when no schedulers are registered on the queue", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/schedulers")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { schedulers: unknown[] }
      expect(body.schedulers).toEqual([])
    })

    it("surfaces a cron-pattern scheduler with template + tz", async () => {
      await producer.upsertJobScheduler(
        "daily-digest",
        { pattern: "0 9 * * *", tz: "UTC" },
        { name: "send-email", data: { kind: "digest" } },
      )

      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/schedulers")
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        schedulers: Array<{
          id: string
          jobName: string
          pattern?: string
          every?: number
          tz?: string
          next: number | null
          template?: { data?: unknown }
        }>
      }

      expect(body.schedulers).toHaveLength(1)
      const [s] = body.schedulers
      expect(s).toMatchObject({
        id: "daily-digest",
        jobName: "send-email",
        pattern: "0 9 * * *",
        tz: "UTC",
      })
      expect(s?.every).toBeUndefined()
      expect(typeof s?.next).toBe("number")
      expect(s?.template?.data).toEqual({ kind: "digest" })
    })

    it("returns 404 for an unregistered queue", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/nope/schedulers")
      expect(res.status).toBe(404)
    })

    it("DELETE /:id removes the scheduler and returns 204", async () => {
      await producer.upsertJobScheduler("doomed", { every: 30_000 }, { name: "ping" })
      const handler = createHandler({ endpoints: createEndpoints(muleta) })

      const res = await handler.request("/api/v1/queues/emails/schedulers/doomed", {
        method: "DELETE",
      })
      expect(res.status).toBe(204)

      const after = await muleta.queues.getJobSchedulers("emails")
      expect(after.find((s) => s.id === "doomed")).toBeUndefined()
    })

    it("DELETE /:id returns 404 when scheduler doesn't exist", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/emails/schedulers/never", {
        method: "DELETE",
      })
      expect(res.status).toBe(404)
    })

    it("DELETE /:id returns 404 for an unregistered queue", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/queues/nope/schedulers/x", {
        method: "DELETE",
      })
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/v1/schedulers", () => {
    it("returns an empty list when no schedulers exist anywhere", async () => {
      const handler = createHandler({ endpoints: createEndpoints(muleta) })
      const res = await handler.request("/api/v1/schedulers")
      expect(res.status).toBe(200)
      const body = (await res.json()) as { schedulers: unknown[] }
      expect(body.schedulers).toEqual([])
    })

    it("flattens schedulers across queues with their queue tag", async () => {
      muleta.queues.register({ name: "reports" })
      const reportsProducer = new Queue("reports", { connection: producerConnection })
      try {
        await producer.upsertJobScheduler(
          "monthly",
          { pattern: "0 0 1 * *", tz: "UTC" },
          { name: "rollup" },
        )
        await reportsProducer.upsertJobScheduler("frequent", { every: 30_000 }, { name: "ping" })

        const handler = createHandler({ endpoints: createEndpoints(muleta) })
        const res = await handler.request("/api/v1/schedulers")
        expect(res.status).toBe(200)
        const body = (await res.json()) as {
          schedulers: Array<{ id: string; queue: string; next: number | null }>
        }

        const ids = body.schedulers.map((s) => s.id)
        expect(ids).toEqual(expect.arrayContaining(["frequent", "monthly"]))
        const frequent = body.schedulers.find((s) => s.id === "frequent")
        const monthly = body.schedulers.find((s) => s.id === "monthly")
        expect(frequent?.queue).toBe("reports")
        expect(monthly?.queue).toBe("emails")
        // Soonest-first global ordering: every-30s precedes monthly cron.
        expect(ids.indexOf("frequent")).toBeLessThan(ids.indexOf("monthly"))
      } finally {
        await reportsProducer.obliterate({ force: true }).catch(() => {})
        await reportsProducer.close()
      }
    })
  })
})
