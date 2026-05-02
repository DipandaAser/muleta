import type { Worker } from "$lib/api/client"

/**
 * Threshold in seconds after which a worker that hasn't issued a Redis
 * command counts as "stale". 30 s sits comfortably above BullMQ's default
 * heartbeat (5 s) so a momentarily-busy worker doesn't flicker in and
 * out of the stale list.
 */
export const STALE_AFTER_SECONDS = 30

export function isStale(w: Worker): boolean {
  return w.idleSeconds >= STALE_AFTER_SECONDS
}

/**
 * Compact `Xh Ym` / `Ym Zs` / `Zs` rendering. Mirrors the worker design's
 * uptime field — second precision feels noisy at hour scale, minute
 * precision feels coarse at sub-minute scale.
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`
  const h = Math.floor(m / 60)
  const remM = m % 60
  if (h < 24) return `${h}h ${remM}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}
