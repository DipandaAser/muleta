import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { GenericContainer, type StartedTestContainer } from "testcontainers"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import type { Muleta } from "../src/index.js"
import { createMuleta } from "../src/index.js"

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

    const result = await muleta.queues.getJobs("emails", { state: "waiting" })
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
    const page1 = await muleta.queues.getJobs("emails", { state: "waiting", start: 0, end: 1 })
    expect(page1.jobs).toHaveLength(2)
    expect(page1.total).toBe(5)

    const ascendingFirst = await muleta.queues.getJobs("emails", {
      state: "waiting",
      start: 0,
      end: 0,
      asc: true,
    })
    expect(ascendingFirst.jobs[0]?.data).toEqual({ i: 0 })
  })

  it("getJobs() returns empty when no jobs in that state", async () => {
    const result = await muleta.queues.getJobs("emails", { state: "failed" })
    expect(result.jobs).toEqual([])
    expect(result.total).toBe(0)
  })
})
