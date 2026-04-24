import { browser } from "$app/environment"
import type { Queue } from "./client"

export interface QueuesSubscription {
  readonly queues: Queue[]
  readonly connection: "connecting" | "open" | "closed"
  readonly lastFrameAt: number | null
  readonly attempt: number
  readonly maxAttempts: number
  reconnect(): void
  close(): void
}

interface Options {
  pollMs?: number
  maxAttempts?: number
}

const DEFAULT_MAX_ATTEMPTS = 10

export function createQueuesSubscription(opts: Options = {}): QueuesSubscription {
  const pollMs = opts.pollMs ?? 2000
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  let queues = $state<Queue[]>([])
  let connection = $state<"connecting" | "open" | "closed">("connecting")
  let lastFrameAt = $state<number | null>(null)
  let attempt = $state(0)

  if (!browser) {
    return {
      get queues() {
        return queues
      },
      get connection() {
        return connection
      },
      get lastFrameAt() {
        return lastFrameAt
      },
      get attempt() {
        return attempt
      },
      get maxAttempts() {
        return maxAttempts
      },
      reconnect() {},
      close() {},
    }
  }

  let es: EventSource | null = null

  function open() {
    const url = new URL("/api/v1/queues/events", window.location.origin)
    url.searchParams.set("interval", String(pollMs))
    const next = new EventSource(url)
    es = next
    connection = "connecting"

    next.addEventListener("open", () => {
      connection = "open"
      attempt = 0
    })

    next.addEventListener("queues", (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data) as { queues: Queue[] }
        queues = parsed.queues
        lastFrameAt = Date.now()
      } catch {}
    })

    // EventSource fires `error` both during auto-retry (readyState CONNECTING)
    // and after giving up (readyState CLOSED) — only count the former.
    next.addEventListener("error", () => {
      if (next.readyState === EventSource.CLOSED) {
        connection = "closed"
        return
      }
      connection = "connecting"
      attempt++
      if (attempt >= maxAttempts) {
        next.close()
        connection = "closed"
      }
    })
  }

  open()

  return {
    get queues() {
      return queues
    },
    get connection() {
      return connection
    },
    get lastFrameAt() {
      return lastFrameAt
    },
    get attempt() {
      return attempt
    },
    get maxAttempts() {
      return maxAttempts
    },
    reconnect() {
      es?.close()
      es = null
      attempt = 0
      open()
    },
    close() {
      es?.close()
      es = null
      connection = "closed"
    },
  }
}
