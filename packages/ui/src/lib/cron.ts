import { CronExpressionParser } from "cron-parser"
import cronstrue from "cronstrue"

export type CronExplanation = { ok: true; text: string } | { ok: false; error: string }

/**
 * Plain-English summary of a cron expression — same vibe as
 * crontab.guru. Returns `null` for an empty input so callers can
 * suppress the hint until the user has typed something. Otherwise the
 * tagged result lets the UI render a green/muted explanation on parse
 * success and a red error message on failure.
 */
export function explainCron(pattern: string): CronExplanation | null {
  const p = pattern.trim()
  if (!p) return null
  try {
    const text = cronstrue.toString(p, {
      throwExceptionOnParseError: true,
      use24HourTimeFormat: true,
    })
    return { ok: true, text }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid cron" }
  }
}

/**
 * Compute the next `count` fire times for a cron pattern. Returns the
 * empty array if the pattern is invalid or empty so the UI can suppress
 * the preview block — exceptions would ripple into a render error.
 *
 * `tz` is optional but useful: BullMQ stores `tz` on the scheduler and
 * we want the preview to match the actual fire times, not the user's
 * browser locale.
 */
export function nextRunsForCron(
  pattern: string,
  count: number,
  opts?: { tz?: string; from?: Date },
): Date[] {
  const p = pattern.trim()
  if (!p) return []
  try {
    const interval = CronExpressionParser.parse(p, {
      ...(opts?.tz !== undefined ? { tz: opts.tz } : {}),
      ...(opts?.from !== undefined ? { currentDate: opts.from } : {}),
    })
    const out: Date[] = []
    for (let i = 0; i < count; i++) out.push(interval.next().toDate())
    return out
  } catch {
    return []
  }
}

/**
 * `YYYY-MM-DD HH:mm:ss` — same shape crontab.guru uses, locale-free
 * so timezone differences don't make scheduler previews visually
 * inconsistent across users on the same team. UTC-based by default
 * since BullMQ schedulers store an explicit `tz` and we want the
 * rendered string to align with that.
 */
export function formatRunDate(d: Date, tz?: string): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  if (tz) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .reduce<Record<string, string>>((acc, p) => {
        acc[p.type] = p.value
        return acc
      }, {})
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * Compact "in 42m" / "in 2h" / "3d ago" rendering for relative time
 * deltas. Used in the schedulers list and detail next-runs preview to
 * give a quick "soon" / "stale" sense without requiring the reader to
 * mentally diff the absolute timestamp.
 */
export function formatRelative(toEpochMs: number, fromEpochMs: number = Date.now()): string {
  const deltaSec = Math.round((toEpochMs - fromEpochMs) / 1000)
  const ago = deltaSec < 0
  const abs = Math.abs(deltaSec)
  const suffix = ago ? "ago" : ""
  const prefix = ago ? "" : "in "
  if (abs < 60) return `${prefix}${abs}s${suffix ? ` ${suffix}` : ""}`
  if (abs < 3600) return `${prefix}${Math.floor(abs / 60)}m${suffix ? ` ${suffix}` : ""}`
  if (abs < 86_400) return `${prefix}${Math.floor(abs / 3600)}h${suffix ? ` ${suffix}` : ""}`
  return `${prefix}${Math.floor(abs / 86_400)}d${suffix ? ` ${suffix}` : ""}`
}
