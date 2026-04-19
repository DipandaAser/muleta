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
})
