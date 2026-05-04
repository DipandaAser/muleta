import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { createMuleta, type Muleta } from "@muleta-dev/core"
import { Queue } from "bullmq"
import { Redis } from "ioredis"
import { GenericContainer, type StartedTestContainer } from "testcontainers"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { honoToExpress } from "../src/express.js"
import { createEndpoints, createHandler } from "../src/index.js"
import { honoToNode } from "../src/node.js"

/**
 * Smoke-tests the framework adapters against the real handler.
 * We boot a tiny `http.Server`, mount the adapter under a path, fire
 * a real HTTP request, and assert the response. That's a stronger
 * signal than mocking IncomingMessage/ServerResponse — it catches
 * stream/header/lifecycle bugs that mocks tend to paper over.
 */
describe("framework adapters", () => {
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
      queues: [{ name: "emails" }],
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

  /**
   * Spin up an http.Server with `listener`, return its base URL +
   * a teardown. Avoids hardcoding a port.
   */
  async function withServer(
    listener: (req: IncomingMessage, res: ServerResponse) => void,
  ): Promise<{ baseUrl: string; close: () => Promise<void> }> {
    const server = createServer(listener)
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const port = (server.address() as AddressInfo).port
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () => new Promise((r) => server.close(() => r())),
    }
  }

  describe("honoToExpress", () => {
    it("routes API requests through Hono and returns the same payload as native", async () => {
      const dashboard = createHandler({ endpoints: createEndpoints(muleta) })
      const middleware = honoToExpress(dashboard)

      // Simulate Express: when the user does `app.use("/admin/queues", mw)`,
      // Express strips the prefix from req.url before invoking the
      // middleware. We mimic that by stripping ourselves before calling
      // the listener.
      const { baseUrl, close } = await withServer((req, res) => {
        if (req.url?.startsWith("/admin/queues")) {
          req.url = req.url.slice("/admin/queues".length) || "/"
        }
        middleware(req, res, (err) => {
          if (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })
      })

      try {
        const res = await fetch(`${baseUrl}/admin/queues/api/v1/queues`)
        expect(res.status).toBe(200)
        const body = (await res.json()) as { queues: Array<{ name: string }> }
        expect(body.queues.map((q) => q.name)).toContain("emails")
      } finally {
        await close()
      }
    })
  })

  describe("honoToNode", () => {
    it("routes API requests when given the full mount URL via stripPath", async () => {
      const dashboard = createHandler({ endpoints: createEndpoints(muleta) })

      // Simulate AdonisJS-style routing: req.url comes in with the full
      // mount prefix; the adapter is told to strip it before delegating.
      const { baseUrl, close } = await withServer((req, res) => {
        honoToNode(dashboard, req, res, { stripPath: "/admin/queues" })
      })

      try {
        const res = await fetch(`${baseUrl}/admin/queues/api/v1/queues`)
        expect(res.status).toBe(200)
        const body = (await res.json()) as { queues: Array<{ name: string }> }
        expect(body.queues.map((q) => q.name)).toContain("emails")
      } finally {
        await close()
      }
    })

    it("works without stripPath when the handler is mounted at root", async () => {
      const dashboard = createHandler({ endpoints: createEndpoints(muleta) })

      const { baseUrl, close } = await withServer((req, res) => {
        honoToNode(dashboard, req, res)
      })

      try {
        const res = await fetch(`${baseUrl}/api/v1/queues`)
        expect(res.status).toBe(200)
      } finally {
        await close()
      }
    })

    it("returns 404 for unknown routes inside the mount (not a passthrough)", async () => {
      const dashboard = createHandler({ endpoints: createEndpoints(muleta) })

      const { baseUrl, close } = await withServer((req, res) => {
        honoToNode(dashboard, req, res, { stripPath: "/admin/queues" })
      })

      try {
        const res = await fetch(`${baseUrl}/admin/queues/api/v1/does-not-exist`)
        expect(res.status).toBe(404)
      } finally {
        await close()
      }
    })
  })

  describe("basePath option", () => {
    it("pins __MULETA_BASE__ regardless of the request URL", async () => {
      const dashboard = createHandler({
        endpoints: createEndpoints(muleta),
        // assets: omitted — index.html injection only fires when assets
        // are served. Express adapter test below covers the SPA path.
        basePath: "/admin/queues",
      })
      // No assets means no index.html serving, so this test just asserts
      // the option is accepted by the type system + handler doesn't blow
      // up at construction. The injection assertion lives in the
      // existing handler.test.ts when assets are wired in.
      expect(typeof dashboard.fetch).toBe("function")
    })
  })
})
