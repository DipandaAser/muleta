/**
 * Global, in-memory cache of every BullMQ job `name` muleta has ever seen
 * across every registered queue. Drives the "Add job" picker so the UI can
 * suggest names without scanning Redis on every page load.
 *
 * Scope is intentionally global, not per-queue: in AdonisJS / Laravel-style
 * queue libraries the same job is dispatched onto whichever queue makes
 * sense, and gating suggestions to "seen on this exact queue" would
 * overfit to the worker-per-name pattern.
 *
 * Names are kept in insertion order (Set semantics) so the most-recently
 * recorded name lands at the end — handy for the UI when it wants to show
 * "newest first".
 */
export interface JobNameIndex {
  /** Add a name to the index. No-op if already present. */
  record(jobName: string): void
  /** Snapshot of all known names, in insertion order (oldest → newest). */
  list(): string[]
  /** Number of unique names tracked. */
  size(): number
  /** Drop everything — used by tests and on registry close. */
  clear(): void
}

export function createJobNameIndex(): JobNameIndex {
  const names = new Set<string>()
  return {
    record(jobName) {
      if (jobName.length === 0) return
      names.add(jobName)
    },
    list() {
      return [...names]
    },
    size() {
      return names.size
    },
    clear() {
      names.clear()
    },
  }
}
