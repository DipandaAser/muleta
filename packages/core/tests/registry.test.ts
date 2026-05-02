import { Queue, Worker } from "bullmq"
import { Redis } from "ioredis"
import { GenericContainer, type StartedTestContainer } from "testcontainers"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Muleta } from "../src/index.js"
import { createMuleta, InvalidJobStateError, JobNotFoundError } from "../src/index.js"
import { DEFAULT_BULLMQ_PREFIX, type InternalQueueRegistry } from "../src/queue/registry.js"

describe("QueueRegistry", () => {
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

  it("registers queues passed in options", () => {
    expect(muleta.queues.has("emails")).toBe(true)
    expect(muleta.queues.has("orders")).toBe(false)
  })

  it("lists registered queues with counts reflecting Redis state", async () => {
    await producer.add("send", { to: "a@b.com" })
    await producer.add("send", { to: "c@d.com" }, { delay: 60_000 })

    const list = await muleta.queues.list()

    expect(list).toHaveLength(1)
    const [emails] = list
    expect(emails).toMatchObject({
      name: "emails",
      displayName: "Email Delivery",
      isPaused: false,
    })
    expect(emails?.counts.waiting).toBe(1)
    expect(emails?.counts.delayed).toBe(1)
    expect(emails?.counts.completed).toBe(0)
  })

  it("reports paused state per queue", async () => {
    await producer.pause()
    const [info] = await muleta.queues.list()
    expect(info?.isPaused).toBe(true)
  })

  it("falls back to name when displayName is not set", async () => {
    await muleta.close()
    muleta = await createMuleta({
      redis: { url: redisUrl },
      queues: [{ name: "webhooks" }],
    })
    const [info] = await muleta.queues.list()
    expect(info?.displayName).toBe("webhooks")
  })

  it("throws when registering a duplicate queue name", () => {
    expect(() => muleta.queues.register({ name: "emails" })).toThrowError(/already registered/)
  })

  it("get() returns a single queue's info", async () => {
    const info = await muleta.queues.get("emails")
    expect(info).toMatchObject({
      name: "emails",
      displayName: "Email Delivery",
      isPaused: false,
    })
  })

  it("get() throws for unregistered queues", async () => {
    await expect(muleta.queues.get("ghost")).rejects.toThrowError(/not registered/)
  })

  it("getJobs() returns jobs in the requested state, newest first", async () => {
    const a = await producer.add("send", { to: "a@b" })
    const b = await producer.add("send", { to: "b@b" })
    const c = await producer.add("send", { to: "c@b" })

    const result = await muleta.queues.getJobs("emails", { states: ["waiting"] })
    expect(result.total).toBe(3)
    expect(result.jobs).toHaveLength(3)
    // newest first — c, b, a
    expect(result.jobs.map((j) => j.id)).toEqual([c.id, b.id, a.id])
    expect(result.jobs[0]).toMatchObject({ name: "send", state: "waiting" })
    expect(result.jobs[0]?.data).toEqual({ to: "c@b" })
  })

  it("getJobs() paginates via start/end and respects asc order", async () => {
    for (let i = 0; i < 5; i++) {
      await producer.add("send", { i })
    }
    const page1 = await muleta.queues.getJobs("emails", {
      states: ["waiting"],
      start: 0,
      end: 1,
    })
    expect(page1.jobs).toHaveLength(2)
    expect(page1.total).toBe(5)

    const ascendingFirst = await muleta.queues.getJobs("emails", {
      states: ["waiting"],
      start: 0,
      end: 0,
      asc: true,
    })
    expect(ascendingFirst.jobs[0]?.data).toEqual({ i: 0 })
  })

  it("getJobs() returns empty when no jobs in that state", async () => {
    const result = await muleta.queues.getJobs("emails", { states: ["failed"] })
    expect(result.jobs).toEqual([])
    expect(result.total).toBe(0)
  })

  it("getJobs() can filter across multiple states at once", async () => {
    await producer.add("send", { to: "w1" })
    await producer.add("send", { to: "w2" })
    await producer.add("send", { to: "later" }, { delay: 60_000 })

    const mixed = await muleta.queues.getJobs("emails", {
      states: ["waiting", "delayed"],
    })
    expect(mixed.total).toBe(3)
    expect(mixed.jobs.map((j) => j.state).sort()).toEqual(["delayed", "waiting", "waiting"])
  })

  describe("health", () => {
    it("returns a ready status with ping + info when Redis is reachable", async () => {
      const h = await muleta.health()

      expect(h.timestamp).toBeGreaterThan(0)
      expect(h.uptimeSeconds).toBeGreaterThanOrEqual(0)
      expect(h.redis.status).toBe("ready")
      expect(h.redis.connected).toBe(true)
      expect(h.redis.pingMs).not.toBeNull()
      expect(h.redis.pingMs).toBeGreaterThanOrEqual(0)
      expect(h.redis.address).toMatch(/:\d+$/)
      expect(h.redis.info).toBeDefined()
      expect(h.redis.info?.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(h.redis.info?.connectedClients).toBeGreaterThan(0)
      expect(h.redis.info?.memoryUsedBytes).toBeGreaterThan(0)
    })
  })

  describe("job detail + actions", () => {
    it("getJob() returns a full detail payload including opts and logs", async () => {
      const added = await producer.add(
        "send",
        { to: "a@b" },
        { attempts: 3, priority: 5, delay: 0 },
      )
      // Drive a log entry through BullMQ's job-scoped log API.
      await producer.client.then((c) => c) // ensure connection is ready
      await added.log("starting processing")

      const detail = await muleta.queues.getJob("emails", String(added.id))
      expect(detail).not.toBeNull()
      expect(detail).toMatchObject({
        id: String(added.id),
        name: "send",
        // A job added with `priority` lands in the "prioritized" list
        // rather than "waiting" — BullMQ stores them separately.
        state: "prioritized",
        data: { to: "a@b" },
        attempts: 3,
        priority: 5,
        delay: 0,
        stacktrace: [],
        returnvalue: null,
      })
      expect(detail?.opts).toMatchObject({ attempts: 3, priority: 5 })
      expect(detail?.logs).toContain("starting processing")
    })

    it("getJob() returns null for an unknown id", async () => {
      const detail = await muleta.queues.getJob("emails", "does-not-exist")
      expect(detail).toBeNull()
    })

    it("getJob() throws when the queue isn't registered", async () => {
      await expect(muleta.queues.getJob("ghost", "1")).rejects.toThrowError(/not registered/)
    })

    it("removeJob() deletes the job from Redis", async () => {
      const added = await producer.add("send", { to: "doomed" })
      await muleta.queues.removeJob("emails", String(added.id))
      const gone = await muleta.queues.getJob("emails", String(added.id))
      expect(gone).toBeNull()
    })

    it("removeJob() throws JobNotFoundError for a missing id", async () => {
      await expect(muleta.queues.removeJob("emails", "nope")).rejects.toBeInstanceOf(
        JobNotFoundError,
      )
    })

    it("retryJob() requeues a failed job", async () => {
      const added = await producer.add("send", { to: "will-fail" }, { attempts: 1 })

      // Spin up a worker that always fails so the job lands in "failed".
      const worker = new Worker(
        "emails",
        async () => {
          throw new Error("boom")
        },
        { connection: new Redis(redisUrl, { maxRetriesPerRequest: null }) },
      )

      try {
        await new Promise<void>((resolve, reject) => {
          worker.on("failed", (job) => {
            if (job?.id === added.id) resolve()
          })
          setTimeout(() => reject(new Error("worker never failed the job")), 5_000)
        })

        // Pause the worker so retry() doesn't race us back into processing.
        await worker.pause(true)

        await muleta.queues.retryJob("emails", String(added.id))
        const after = await muleta.queues.getJob("emails", String(added.id))
        expect(after?.state).not.toBe("failed")
      } finally {
        await worker.close()
      }
    })

    it("retryJob() throws InvalidJobStateError when the job isn't failed", async () => {
      const added = await producer.add("send", { to: "still-waiting" })
      await expect(muleta.queues.retryJob("emails", String(added.id))).rejects.toBeInstanceOf(
        InvalidJobStateError,
      )
    })

    it("promoteJob() moves a delayed job to waiting", async () => {
      const added = await producer.add("send", { to: "later" }, { delay: 60_000 })
      const before = await muleta.queues.getJob("emails", String(added.id))
      expect(before?.state).toBe("delayed")

      await muleta.queues.promoteJob("emails", String(added.id))

      const after = await muleta.queues.getJob("emails", String(added.id))
      expect(after?.state).toBe("waiting")
    })

    it("promoteJob() throws InvalidJobStateError when the job isn't delayed", async () => {
      const added = await producer.add("send", { to: "immediate" })
      await expect(muleta.queues.promoteJob("emails", String(added.id))).rejects.toBeInstanceOf(
        InvalidJobStateError,
      )
    })
  })

  describe("addJob + job-name index", () => {
    it("addJob() enqueues a job and returns its info", async () => {
      const info = await muleta.queues.addJob(
        "emails",
        "send-welcome",
        { to: "ada@example.com" },
        { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      )

      expect(info).toMatchObject({
        name: "send-welcome",
        state: "waiting",
        data: { to: "ada@example.com" },
        attempts: 3,
      })

      // The job is observable via getJobs.
      const listed = await muleta.queues.getJobs("emails", { states: ["waiting"] })
      expect(listed.jobs.map((j) => j.id)).toContain(info.id)
    })

    it("addJob() respects priority by routing to the prioritized list", async () => {
      const info = await muleta.queues.addJob("emails", "send", {}, { priority: 5 })
      const detail = await muleta.queues.getJob("emails", info.id)
      expect(detail?.state).toBe("prioritized")
      expect(detail?.priority).toBe(5)
    })

    it("addJob() respects delay by routing to the delayed list", async () => {
      const info = await muleta.queues.addJob("emails", "send", {}, { delay: 60_000 })
      const detail = await muleta.queues.getJob("emails", info.id)
      expect(detail?.state).toBe("delayed")
      expect(detail?.delay).toBe(60_000)
    })

    it("addJob() honours a caller-provided jobId", async () => {
      const info = await muleta.queues.addJob("emails", "send", {}, { jobId: "custom-id" })
      expect(info.id).toBe("custom-id")
    })

    it("addJob() throws when the queue isn't registered", async () => {
      await expect(muleta.queues.addJob("ghost", "send", {})).rejects.toThrowError(/not registered/)
    })

    it("addJob() defaults missing data to {}", async () => {
      const info = await muleta.queues.addJob("emails", "ping", undefined)
      const detail = await muleta.queues.getJob("emails", info.id)
      expect(detail?.data).toEqual({})
    })

    it("addJob() records the job name in the index", async () => {
      await muleta.queues.addJob("emails", "send-welcome", {})
      await muleta.queues.addJob("emails", "send-receipt", {})
      const names = muleta.queues.getJobNames()
      expect(names).toContain("send-welcome")
      expect(names).toContain("send-receipt")
    })

    it("getJobNames() de-duplicates repeated names", async () => {
      await muleta.queues.addJob("emails", "send", { i: 1 })
      await muleta.queues.addJob("emails", "send", { i: 2 })
      const names = muleta.queues.getJobNames()
      expect(names.filter((n) => n === "send")).toHaveLength(1)
    })

    it("refreshJobNames() picks up names enqueued outside of muleta", async () => {
      // Producer (outside muleta) drops a job in — index doesn't know about
      // it yet because addJob() is the only path that auto-records.
      await producer.add("external-job", { ext: true })
      expect(muleta.queues.getJobNames()).not.toContain("external-job")

      await muleta.queues.refreshJobNames()
      expect(muleta.queues.getJobNames()).toContain("external-job")
    })

    it("getJobNames() spans every registered queue (global, not per-queue)", async () => {
      // Add a second queue and enqueue a uniquely-named job on each — the
      // index should surface both names regardless of which queue we ask.
      muleta.queues.register({ name: "reports" })
      await muleta.queues.addJob("emails", "email-only-job", {})
      await muleta.queues.addJob("reports", "report-only-job", {})
      const names = muleta.queues.getJobNames()
      expect(names).toEqual(expect.arrayContaining(["email-only-job", "report-only-job"]))
    })
  })

  describe("getWorkers", () => {
    it("returns no workers when none are connected", async () => {
      const workers = await muleta.queues.getWorkers()
      expect(workers).toEqual([])
    })

    it("lists a connected worker tagged with its queue", async () => {
      const worker = new Worker(
        "emails",
        async () => {
          // Idle worker — never resolves a job, just stays connected.
        },
        {
          connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
          name: "emails-worker-1",
        },
      )
      try {
        await worker.waitUntilReady()
        const workers = await muleta.queues.getWorkers()
        const emailsWorker = workers.find((w) => w.queue === "emails")
        expect(emailsWorker).toBeDefined()
        expect(emailsWorker?.name).toBe("emails-worker-1")
        expect(emailsWorker?.id).toBeTruthy()
        expect(emailsWorker?.addr).toMatch(/:\d+$/)
        expect(emailsWorker?.ageSeconds).toBeGreaterThanOrEqual(0)
        expect(emailsWorker?.idleSeconds).toBeGreaterThanOrEqual(0)
      } finally {
        await worker.close()
      }
    })

    it("returns null name for anonymous workers (no `name` option)", async () => {
      const worker = new Worker("emails", async () => {}, {
        connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
      })
      try {
        await worker.waitUntilReady()
        const workers = await muleta.queues.getWorkers()
        const emailsWorker = workers.find((w) => w.queue === "emails")
        expect(emailsWorker).toBeDefined()
        expect(emailsWorker?.name).toBeNull()
      } finally {
        await worker.close()
      }
    })

    it("aggregates workers across multiple registered queues", async () => {
      muleta.queues.register({ name: "reports" })
      const reportsProducer = new Queue("reports", { connection: producerConnection })
      const emailsWorker = new Worker("emails", async () => {}, {
        connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
        name: "e-1",
      })
      const reportsWorker = new Worker("reports", async () => {}, {
        connection: new Redis(redisUrl, { maxRetriesPerRequest: null }),
        name: "r-1",
      })
      try {
        await Promise.all([emailsWorker.waitUntilReady(), reportsWorker.waitUntilReady()])
        const workers = await muleta.queues.getWorkers()
        const queues = new Set(workers.map((w) => w.queue))
        expect(queues.has("emails")).toBe(true)
        expect(queues.has("reports")).toBe(true)
        const names = workers.map((w) => w.name)
        expect(names).toEqual(expect.arrayContaining(["e-1", "r-1"]))
      } finally {
        await Promise.all([emailsWorker.close(), reportsWorker.close()])
        await reportsProducer.obliterate({ force: true }).catch(() => {})
        await reportsProducer.close()
      }
    })
  })
})

describe("queue autodiscovery", () => {
  let container: StartedTestContainer
  let redisUrl: string

  beforeAll(async () => {
    container = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start()
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`
  })

  afterAll(async () => {
    await container.stop()
  })

  let muleta: Muleta | null = null
  let producerConn: Redis | null = null
  const seeded: Queue[] = []

  async function seed(name: string, opts?: { prefix?: string }): Promise<Queue> {
    if (!producerConn) {
      producerConn = new Redis(redisUrl, { maxRetriesPerRequest: null })
    }
    const q = new Queue(name, {
      connection: producerConn,
      ...(opts?.prefix ? { prefix: opts.prefix } : {}),
    })
    await q.waitUntilReady()
    // Forcing an add guarantees the :meta hash exists before discovery scans.
    await q.add("seed", {})
    seeded.push(q)
    return q
  }

  afterEach(async () => {
    for (const q of seeded) {
      await q.obliterate({ force: true }).catch(() => {})
      await q.close()
    }
    seeded.length = 0
    if (producerConn) {
      producerConn.disconnect()
      producerConn = null
    }
    if (muleta) {
      await muleta.close()
      muleta = null
    }
  })

  it("discovers queues present in Redis on startup", async () => {
    await seed("orders")
    await seed("reports")

    muleta = await createMuleta({ redis: { url: redisUrl } })

    const names = (await muleta.queues.list()).map((q) => q.name).sort()
    expect(names).toEqual(["orders", "reports"])
  })

  it("picks up a queue that appears after startup on the next scan", async () => {
    muleta = await createMuleta({ redis: { url: redisUrl } })
    expect(await muleta.queues.list()).toEqual([])

    await seed("late")

    const internal = muleta.queues as InternalQueueRegistry
    await internal.discover([DEFAULT_BULLMQ_PREFIX])

    const names = (await muleta.queues.list()).map((q) => q.name)
    expect(names).toContain("late")
  })

  it("unregisters a discovered queue after it is obliterated", async () => {
    const transient = await seed("transient")

    muleta = await createMuleta({ redis: { url: redisUrl } })
    expect((await muleta.queues.list()).map((q) => q.name)).toContain("transient")

    await transient.obliterate({ force: true })

    const internal = muleta.queues as InternalQueueRegistry
    await internal.discover([DEFAULT_BULLMQ_PREFIX])

    expect((await muleta.queues.list()).map((q) => q.name)).not.toContain("transient")
  })

  it("keeps an explicit registration's displayName when the queue is also present in Redis", async () => {
    await seed("audit")

    muleta = await createMuleta({
      redis: { url: redisUrl },
      queues: [{ name: "audit", displayName: "Audit Log" }],
    })

    const info = await muleta.queues.get("audit")
    expect(info.displayName).toBe("Audit Log")
  })

  it("discovers queues under a non-default prefix when it is declared via explicit config", async () => {
    await seed("custom", { prefix: "myapp" })

    // Declaring *any* queue with the custom prefix seeds the discovery prefix
    // list — siblings under the same prefix get picked up for free.
    await seed("sibling", { prefix: "myapp" })

    muleta = await createMuleta({
      redis: { url: redisUrl },
      queues: [{ name: "custom", prefix: "myapp" }],
    })

    const names = (await muleta.queues.list()).map((q) => q.name).sort()
    expect(names).toEqual(["custom", "sibling"])
  })
})
