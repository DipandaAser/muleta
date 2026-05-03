/**
 * One BullMQ Job Scheduler. Schedulers are the v5+ replacement for
 * "repeatable jobs" — a single Redis-backed record per `id` that fires
 * jobs on either a cron `pattern` or a fixed `every` interval. Mirrors
 * BullMQ's `JobSchedulerJson` plus the queue tag the dashboard needs.
 *
 * Either `pattern` or `every` is set, never both. `next` is the next
 * scheduled fire time (Unix ms); `null` once `limit` is hit or `endDate`
 * has passed and BullMQ stops issuing it.
 */
export interface JobSchedulerInfo {
  /** Scheduler id — caller-supplied via `upsertJobScheduler`. Unique per queue. */
  id: string
  /** Queue this scheduler belongs to. */
  queue: string
  /** Job name BullMQ will use when firing. */
  jobName: string
  /** Cron pattern, when the schedule is cron-based. */
  pattern?: string
  /** Fixed interval in milliseconds, when the schedule is interval-based. */
  every?: number
  /** Olson timezone name (cron only). */
  tz?: string
  /** Cap on total iterations across the scheduler's lifetime. */
  limit?: number
  /** Number of times the scheduler has fired so far. */
  iterationCount?: number
  /** Earliest fire time (Unix ms). */
  startDate?: number
  /** Latest fire time (Unix ms). */
  endDate?: number
  /** Next scheduled fire (Unix ms), or `null` once exhausted. */
  next: number | null
  /** Job template — data payload + per-iteration options. */
  template?: { data?: unknown; opts?: Record<string, unknown> }
}
