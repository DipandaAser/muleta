import type { JobDetail } from "$lib/api/client"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatTime(ts: number | undefined): string {
  if (ts === undefined) return "—"
  const d = new Date(ts)
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`
}

export function age(ts: number | undefined): string {
  if (ts === undefined) return "—"
  const d = Date.now() - ts
  if (d < MINUTE) return `${Math.floor(d / 1000)}s ago`
  if (d < HOUR) return `${Math.floor(d / MINUTE)}m ago`
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  return `${Math.floor(d / DAY)}d ago`
}

export function duration(start: number, end: number): string {
  const d = end - start
  if (d < 1000) return `${d}ms`
  if (d < MINUTE) return `${(d / 1000).toFixed(1)}s`
  return `${Math.floor(d / MINUTE)}m ${Math.floor((d % MINUTE) / 1000)}s`
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function byteSize(value: unknown): string {
  if (value === null || value === undefined) return "—"
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value)
    const bytes = new TextEncoder().encode(s).length
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  } catch {
    return "—"
  }
}

/**
 * Apply light token coloring to a JSON string so it reads as code rather
 * than a wall of text. Returns HTML intended to be used with {@html}.
 * CSS classes json-key / json-str / json-num / json-bool are defined in the
 * detail layout's scoped styles.
 */
export function highlightJson(value: unknown): string {
  const raw = prettyJson(value)
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return escaped.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|\b(-?\d+(?:\.\d+)?)\b/g,
    (_m, stringLit, colon, boolNull, num) => {
      if (colon) return `<span class="json-key">${stringLit}</span>${colon}`
      if (stringLit) return `<span class="json-str">${stringLit}</span>`
      if (boolNull) return `<span class="json-bool">${boolNull}</span>`
      if (num) return `<span class="json-num">${num}</span>`
      return ""
    },
  )
}

/**
 * BullMQ logs are free-form strings, but many apps emit them prefixed with
 * a level keyword. Detect that so the UI can color-code.
 */
export function logLevel(line: string): "info" | "warn" | "error" | "debug" | null {
  const m = line.match(/\b(INFO|WARN|WARNING|ERROR|DEBUG)\b/i)
  if (!m) return null
  const kw = m[1]?.toUpperCase() ?? ""
  if (kw.startsWith("WARN")) return "warn"
  if (kw === "ERROR") return "error"
  if (kw === "DEBUG") return "debug"
  return "info"
}

/** BullMQ's backoff option can be a plain number (ms) or a strategy object. */
export function summarizeBackoff(opts: Record<string, unknown>): string {
  const b = opts.backoff
  if (b === undefined || b === null) return "none"
  if (typeof b === "number") return `${b}ms`
  if (typeof b === "object") {
    const o = b as { type?: string; delay?: number }
    return `${o.type ?? "fixed"} · ${o.delay ?? 0}ms`
  }
  return "—"
}

export function summarizeRemoveOn(opts: Record<string, unknown>): string {
  const done = opts.removeOnComplete
  const fail = opts.removeOnFail
  const fmt = (v: unknown): string => {
    if (v === undefined) return "—"
    if (v === true) return "always"
    if (v === false) return "never"
    if (typeof v === "number") return `keep ${v}`
    return "custom"
  }
  return `done=${fmt(done)} · fail=${fmt(fail)}`
}

export type LifecycleStep = {
  label: string
  meta: string
  status: "done" | "current" | "idle"
}

export function lifecycleSteps(j: JobDetail): LifecycleStep[] {
  const steps: LifecycleStep[] = [{ label: "added", meta: age(j.addedAt), status: "done" }]

  const isTerminal = j.state === "completed" || j.state === "failed"
  const hasProcessed = j.processedAt !== undefined

  if (j.state === "waiting" || j.state === "delayed" || j.state === "prioritized") {
    steps.push({ label: j.state, meta: "queued", status: "current" })
  } else {
    steps.push({ label: "waiting", meta: "", status: "done" })
  }

  // BullMQ doesn't expose a `processedBy` (worker name) in its public API, so
  // the meta for "picked up" is blank — the design's "worker-98df" comes from
  // the worker name which we'd need to surface separately. Leaving blank is
  // closer to the design than a raw timestamp.
  steps.push({
    label: "picked up",
    meta: "",
    status: hasProcessed ? "done" : "idle",
  })

  if (j.state === "active") {
    const pct = typeof j.progress === "number" ? ` ${Math.round(Math.min(j.progress, 100))}%` : ""
    steps.push({ label: "active", meta: `progress${pct}`, status: "current" })
  } else if (isTerminal) {
    // Match the design: "completed 613" — duration in ms, not a timestamp.
    const durationMs =
      j.processedAt !== undefined && j.finishedAt !== undefined
        ? `${j.finishedAt - j.processedAt}`
        : ""
    steps.push({
      label: j.state,
      meta: durationMs,
      status: "current",
    })
  } else if (j.state === "paused") {
    steps.push({ label: "paused", meta: "", status: "current" })
  }

  return steps
}

export function stepDotColor(step: LifecycleStep, state: JobDetail["state"]): string {
  if (step.status === "idle") return "var(--color-base-300)"
  if (step.status === "done") return "var(--color-success)"
  if (state === "failed") return "var(--color-error)"
  if (state === "completed") return "var(--color-success)"
  if (state === "active") return "var(--color-info)"
  return "var(--color-state-waiting, var(--color-base-content))"
}
