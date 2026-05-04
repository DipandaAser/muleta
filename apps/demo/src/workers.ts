import type { Job, Processor } from "bullmq"
import { Worker } from "bullmq"
import type { Redis } from "ioredis"
import { PERMANENT_FAILURES, pick, TRANSIENT_FAILURES } from "./data.js"

/**
 * Sleep for `min`–`max` milliseconds. The demo workers spend most of
 * their time here so the dashboard shows realistic active-state
 * durations and progress bars.
 */
function sleep(min: number, max?: number): Promise<void> {
  const ms = max === undefined ? min : min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * `chance(0.1)` returns true ~10% of the time. Used for failure
 * simulation and progress reporting cadence.
 */
function chance(p: number): boolean {
  return Math.random() < p
}

interface WorkerProfile {
  queueName: string
  concurrency: number
  /** Realistic processing time range, milliseconds. */
  duration: [number, number]
  /** Probability the job emits intermediate progress updates. */
  progressChance: number
  /** Probability the job throws a transient error (retried). */
  transientFailureRate: number
  /** Probability the job throws a permanent error (no retry). */
  permanentFailureRate: number
}

const PROFILES: readonly WorkerProfile[] = [
  {
    queueName: "emails",
    concurrency: 4,
    duration: [200, 1500],
    progressChance: 0,
    transientFailureRate: 0.05,
    permanentFailureRate: 0.02,
  },
  {
    queueName: "webhooks",
    concurrency: 6,
    duration: [150, 800],
    progressChance: 0,
    transientFailureRate: 0.12,
    permanentFailureRate: 0.03,
  },
  {
    queueName: "image-resize",
    concurrency: 2,
    duration: [4000, 18000],
    progressChance: 1, // every active job reports progress — fills the UI
    transientFailureRate: 0.04,
    permanentFailureRate: 0.02,
  },
  {
    queueName: "billing",
    concurrency: 2,
    duration: [800, 3500],
    progressChance: 0,
    transientFailureRate: 0.08,
    permanentFailureRate: 0.03,
  },
  {
    queueName: "reports",
    concurrency: 1,
    duration: [2500, 8000],
    progressChance: 0.4,
    transientFailureRate: 0.02,
    permanentFailureRate: 0.01,
  },
  {
    queueName: "orders",
    concurrency: 3,
    duration: [400, 2000],
    progressChance: 0.2,
    transientFailureRate: 0.05,
    permanentFailureRate: 0.02,
  },
] as const

function processorFor(profile: WorkerProfile): Processor {
  return async (job: Job) => {
    const [minMs, maxMs] = profile.duration
    const total = minMs + Math.random() * (maxMs - minMs)
    const steps = profile.progressChance > 0 && chance(profile.progressChance) ? 5 : 1
    const stepMs = total / steps

    for (let i = 1; i <= steps; i++) {
      await sleep(stepMs * 0.6, stepMs * 1.4)
      if (steps > 1) {
        const pct = Math.round((i / steps) * 100)
        await job.updateProgress(pct).catch(() => {})
      }
    }

    if (chance(profile.permanentFailureRate)) {
      throw new Error(pick(PERMANENT_FAILURES))
    }
    if (chance(profile.transientFailureRate)) {
      throw new Error(pick(TRANSIENT_FAILURES))
    }

    return { processed: true, durationMs: Math.round(total), workerNote: "ok" }
  }
}

/**
 * Spin up one BullMQ Worker per queue. Each runs in this process,
 * polling Redis for the queue it's bound to. Returned so callers can
 * await `.close()` on shutdown.
 */
export function startWorkers(connection: Redis): Worker[] {
  return PROFILES.map(
    (profile) =>
      new Worker(profile.queueName, processorFor(profile), {
        connection,
        concurrency: profile.concurrency,
      }),
  )
}

export const QUEUE_NAMES = PROFILES.map((p) => p.queueName)
