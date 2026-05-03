import type { JobState } from "./types.js"

/**
 * Thrown by `retryJob`/`promoteJob` when the current state doesn't allow the
 * transition (e.g. retrying a completed job, promoting an active one).
 * Distinct class so the HTTP layer can map it to 400 without inspecting
 * message strings.
 */
export class InvalidJobStateError extends Error {
  readonly current: JobState
  readonly expected: JobState[]
  constructor(action: string, current: JobState, expected: JobState[]) {
    super(`Cannot ${action} a job in state "${current}" — must be one of: ${expected.join(", ")}`)
    this.name = "InvalidJobStateError"
    this.current = current
    this.expected = expected
  }
}

/** Thrown by job-scoped methods when the job doesn't exist in Redis. */
export class JobNotFoundError extends Error {
  readonly queueName: string
  readonly jobId: string
  constructor(queueName: string, jobId: string) {
    super(`Job "${jobId}" not found in queue "${queueName}"`)
    this.name = "JobNotFoundError"
    this.queueName = queueName
    this.jobId = jobId
  }
}
