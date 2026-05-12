import { FlowProducer, Queue } from "bullmq"
import type { Redis } from "ioredis"
import {
  randomBillingJob,
  randomEmailJob,
  randomId,
  randomImageJob,
  randomOrder,
  randomReportJob,
  randomWebhookJob,
} from "./data.js"

/**
 * Job-creation policy per queue. The producer loop weights jobs by
 * each queue's "weight" so the demo dashboard shows realistic relative
 * volumes — many emails/webhooks, fewer reports, occasional billing.
 */
interface QueueProducer {
  name: string
  weight: number
  /** Opts passed to `queue.add` to vary the demo's UX. */
  buildJob: () => {
    name: string
    data: unknown
    opts?: Parameters<Queue["add"]>[2]
  }
}

const PRODUCERS: readonly QueueProducer[] = [
  {
    name: "emails",
    weight: 6,
    buildJob: () => ({
      name: "send-email",
      data: randomEmailJob(),
      opts: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
    }),
  },
  {
    name: "webhooks",
    weight: 5,
    buildJob: () => ({
      name: "deliver-webhook",
      data: randomWebhookJob(),
      opts: { attempts: 5, backoff: { type: "exponential", delay: 1000 } },
    }),
  },
  {
    name: "image-resize",
    weight: 2,
    buildJob: () => ({
      name: "resize-image",
      data: randomImageJob(),
      opts: { attempts: 2 },
    }),
  },
  {
    name: "billing",
    weight: 1,
    buildJob: () => ({
      name: "charge-invoice",
      data: randomBillingJob(),
      opts: { attempts: 4, backoff: { type: "exponential", delay: 5000 } },
    }),
  },
  {
    name: "reports",
    weight: 1,
    buildJob: () => ({
      name: "build-report",
      data: randomReportJob(),
      // 30% of report jobs are scheduled — lights up the "delayed" state.
      opts:
        Math.random() < 0.3 ? { delay: 30_000 + Math.floor(Math.random() * 90_000) } : undefined,
    }),
  },
] as const

const TOTAL_WEIGHT = PRODUCERS.reduce((acc, p) => acc + p.weight, 0)

function pickWeighted(): QueueProducer {
  let r = Math.random() * TOTAL_WEIGHT
  for (const p of PRODUCERS) {
    r -= p.weight
    if (r <= 0) return p
  }
  return PRODUCERS[PRODUCERS.length - 1] as QueueProducer
}

/**
 * Common job options applied to every queue we create — keeps the
 * dashboard from drowning in completed-job rows over a long-lived
 * demo. Failures are kept longer so visitors can click into them.
 */
const SHARED_DEFAULTS = {
  removeOnComplete: { age: 30 * 60, count: 1000 },
  removeOnFail: { age: 2 * 60 * 60, count: 1000 },
}

export function createQueues(connection: Redis): Map<string, Queue> {
  const queues = new Map<string, Queue>()
  for (const p of PRODUCERS) {
    queues.set(p.name, new Queue(p.name, { connection, defaultJobOptions: SHARED_DEFAULTS }))
  }
  // Orders queue is added by the flow producer below, but workers.ts
  // expects it to exist as a queue too so the worker can drain children.
  queues.set("orders", new Queue("orders", { connection, defaultJobOptions: SHARED_DEFAULTS }))
  return queues
}

/**
 * Produce one job. Called by the producer loop on a steady cadence.
 */
async function produceOne(queues: Map<string, Queue>): Promise<void> {
  const producer = pickWeighted()
  const queue = queues.get(producer.name)
  if (!queue) return
  const job = producer.buildJob()
  await queue.add(job.name, job.data, job.opts)
}

/**
 * Start a producer loop that adds jobs at a steady rate. Slight
 * jitter so the dashboard's per-queue counts move organically rather
 * than locking to a metronome.
 */
export function startProducer(queues: Map<string, Queue>, opts: { intervalMs: number }) {
  const tick = async () => {
    try {
      await produceOne(queues)
    } catch (e) {
      console.error("[demo] producer error:", e)
    }
  }
  const id = setInterval(tick, opts.intervalMs + Math.random() * 100)
  return () => clearInterval(id)
}

/**
 * Register a small, recognizable set of job-schedulers — both pattern
 * (cron) and "every" — so the Schedulers tab is populated and the
 * timeline panel has data. Kept idempotent via `upsertJobScheduler` so
 * repeated boots don't pile up duplicates.
 */
export async function ensureSchedulers(queues: Map<string, Queue>): Promise<void> {
  const reports = queues.get("reports")
  const billing = queues.get("billing")
  const emails = queues.get("emails")
  if (!reports || !billing || !emails) return

  // Fast cadence so visitors see fresh runs within a minute or two.
  await emails.upsertJobScheduler(
    "demo-heartbeat",
    { every: 90_000 },
    { name: "heartbeat-email", data: { template: "demo-heartbeat", to: "ops@muleta.dev" } },
  )

  // Realistic pattern (Mon–Fri 09:00 UTC) — likely won't fire during a
  // visitor's session, but it's a realistic-looking entry.
  await reports.upsertJobScheduler(
    "weekday-revenue-report",
    { pattern: "0 9 * * 1-5", tz: "UTC" },
    { name: "build-report", data: { kind: "daily-revenue", scheduled: true } },
  )

  // Every-30-minutes cleanup — visible cadence for demos that stay
  // open for half an hour.
  await billing.upsertJobScheduler(
    "billing-reconcile",
    { every: 30 * 60 * 1000 },
    { name: "charge-invoice", data: { plan: "scheduled-reconcile" } },
  )
}

/**
 * Queue an order-processing flow. Parent fans out to validate-payment,
 * reserve-inventory, send-confirmation children — each in its own
 * queue, processed by the matching worker. Adds a recognizable tree
 * to the Flows tab.
 */
export async function queueOrderFlow(connection: Redis): Promise<void> {
  const flow = new FlowProducer({ connection })
  const order = randomOrder()

  await flow.add({
    name: "process-order",
    queueName: "orders",
    data: order,
    opts: SHARED_DEFAULTS,
    children: [
      {
        name: "validate-payment",
        queueName: "billing",
        data: { orderId: order.orderId, amount: order.amount, currency: order.currency },
        opts: SHARED_DEFAULTS,
      },
      {
        name: "reserve-inventory",
        queueName: "orders",
        data: { orderId: order.orderId, items: order.itemCount },
        opts: SHARED_DEFAULTS,
      },
      {
        name: "send-confirmation",
        queueName: "emails",
        data: { template: "order-confirmation", to: order.customer, orderId: order.orderId },
        opts: SHARED_DEFAULTS,
      },
    ],
  })

  await flow.close()
}

/**
 * Loop that queues a fresh order flow every couple of minutes —
 * keeps the Flows tab interesting for visitors who linger.
 */
export function startFlowLoop(connection: Redis, opts: { intervalMs: number }) {
  const tick = async () => {
    try {
      await queueOrderFlow(connection)
    } catch (e) {
      console.error("[demo] flow error:", e)
    }
  }
  // Kick once immediately so the dashboard has a flow on first load.
  void tick()
  const id = setInterval(tick, opts.intervalMs)
  return () => clearInterval(id)
}

export const SEEDED_QUEUES = [...PRODUCERS.map((p) => p.name), "orders"]

// Stable-ish job ID for orders so logs/output are recognizable.
export function fakeOrderJobId(): string {
  return `order_${randomId()}`
}
