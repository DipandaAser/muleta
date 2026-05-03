/**
 * One worker connection observed against a queue. Sourced from Redis
 * `CLIENT LIST` via BullMQ's `Queue.getWorkers()`. Fields here mirror
 * what BullMQ exposes — extra metadata (hostname, pid, BullMQ version)
 * isn't part of `CLIENT LIST` and would need worker-side opt-in to
 * surface, so v1 stays with what's actually available.
 */
export interface WorkerInfo {
  /** Redis client id — unique per connection. */
  id: string
  /** Worker name. If the user named the worker (`new Worker(queue, fn, { name })`),
   * that string ends up here; otherwise `null` for anonymous worker connections. */
  name: string | null
  /** Queue this worker is registered against. */
  queue: string
  /** Redis client address — typically `host:port`. */
  addr: string
  /** Seconds since the worker connected to Redis. UI formats as uptime. */
  ageSeconds: number
  /** Seconds since the worker last issued a Redis command. Used to derive
   * a "stale" indicator when the value crosses a threshold the UI picks. */
  idleSeconds: number
}
