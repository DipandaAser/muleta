<script lang="ts">
import type { Job } from "$lib/api/client"
import { MoreHorizontal } from "@lucide/svelte"
import StateBadge from "./StateBadge.svelte"

interface Props {
  jobs: Job[]
  loading: boolean
}

let { jobs, loading }: Props = $props()

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function age(ts: number): string {
  const d = Date.now() - ts
  if (d < 10_000) return `${Math.floor(d / 1000)}s ago`
  if (d < MINUTE) return `${Math.floor(d / 1000)}s ago`
  if (d < HOUR) return `${Math.floor(d / MINUTE)}m ago`
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  return `${Math.floor(d / DAY)}d ago`
}

function duration(start: number, end: number): string {
  const d = end - start
  if (d < 1000) return `${d}ms`
  if (d < MINUTE) return `${(d / 1000).toFixed(1)}s`
  return `${Math.floor(d / MINUTE)}m ${Math.floor((d % MINUTE) / 1000)}s`
}

/** First human-meaningful scalar in the job's data object, for the preview column. */
function dataPreview(data: unknown): string {
  if (data == null) return "—"
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return String(data)
  }
  if (Array.isArray(data)) return `[${data.length} item${data.length === 1 ? "" : "s"}]`
  if (typeof data !== "object") return "—"
  const obj = data as Record<string, unknown>
  const parts: string[] = []
  // Prefer common identifier-ish keys first, then everything else.
  const preferred = ["to", "email", "subject", "id", "name", "url"]
  for (const k of preferred) {
    if (typeof obj[k] === "string") parts.push(obj[k] as string)
  }
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" || typeof v === "number") {
        parts.push(`${k}: ${v}`)
        if (parts.length >= 2) break
      }
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "—"
}

function progressStr(p: Job["progress"]): string | null {
  if (typeof p === "number") {
    if (p <= 0) return null
    if (p <= 1) return `${Math.round(p * 100)}%`
    return `${Math.round(p)}%`
  }
  return null
}

function progressPct(p: Job["progress"]): number {
  if (typeof p !== "number") return 0
  if (p <= 0) return 0
  if (p <= 1) return p * 100
  return Math.min(100, p)
}

const COLS = "24px 96px minmax(140px, 1fr) minmax(160px, 2fr) 70px 80px 90px 76px 96px 28px"
</script>

<div class="bg-base-100 border border-base-300 rounded-lg overflow-hidden">
  <div
    class="grid items-center px-4 h-8 text-base-content/60 text-[10.5px] font-medium uppercase tracking-wider border-b border-base-300"
    style:grid-template-columns={COLS}
  >
    <div></div>
    <div>State</div>
    <div>Name</div>
    <div>Data preview</div>
    <div class="text-right">Attempts</div>
    <div class="text-right">Duration</div>
    <div>Progress</div>
    <div class="text-right">Added</div>
    <div class="text-right">ID</div>
    <div></div>
  </div>

  {#if loading && jobs.length === 0}
    {#each Array(5) as _, i (i)}
      <div
        class="grid items-center px-4 h-10 border-b border-base-300 last:border-b-0"
        style:grid-template-columns={COLS}
      >
        <span class="skeleton h-3 w-3"></span>
        <span class="skeleton h-4 w-16"></span>
        <span class="skeleton h-3 w-32"></span>
        <span class="skeleton h-3 w-40"></span>
        <span class="skeleton h-3 w-8 ml-auto"></span>
        <span class="skeleton h-3 w-12 ml-auto"></span>
        <span class="skeleton h-1.5 w-full"></span>
        <span class="skeleton h-3 w-10 ml-auto"></span>
        <span class="skeleton h-3 w-14 ml-auto"></span>
        <span></span>
      </div>
    {/each}
  {:else if jobs.length === 0}
    <div class="p-10 text-center text-base-content/60 text-[13px]">No jobs in this state.</div>
  {:else}
    {#each jobs as j (j.id)}
      <div
        class="grid items-center px-4 h-10 text-[12.5px] border-b border-base-300 last:border-b-0 hover:bg-base-200/60 group"
        style:grid-template-columns={COLS}
      >
        <!-- bulk-select checkbox; disabled until we have bulk actions -->
        <input
          type="checkbox"
          class="checkbox checkbox-xs"
          disabled
          aria-label="Select job"
        />

        <StateBadge state={j.state} />

        <div class="font-medium truncate">{j.name}</div>

        <div class="font-mono-muleta text-[11px] text-base-content/70 truncate">
          {dataPreview(j.data)}
        </div>

        <div
          class="font-mono-muleta tnum text-right text-[11.5px] {j.attemptsMade >= j.attempts &&
          j.state === 'failed'
            ? 'text-error'
            : 'text-base-content/70'}"
        >
          {j.attemptsMade}/{j.attempts}
        </div>

        <div class="font-mono-muleta tnum text-right text-base-content/70 text-[11px]">
          {#if j.processedAt && j.finishedAt}
            {duration(j.processedAt, j.finishedAt)}
          {:else if j.state === "active" && j.processedAt}
            {duration(j.processedAt, Date.now())}
          {:else}
            <span class="text-base-content/30">—</span>
          {/if}
        </div>

        <div class="flex items-center gap-2 min-w-0">
          {#if j.state === "active" || (typeof j.progress === "number" && j.progress > 0)}
            <div class="relative h-1 flex-1 rounded-full bg-base-300 overflow-hidden">
              <div
                class="absolute inset-y-0 left-0 rounded-full"
                style:width="{progressPct(j.progress)}%"
                style:background={j.state === "active" ? "var(--color-info)" : "var(--color-success)"}
              ></div>
            </div>
            {#if progressStr(j.progress)}
              <span
                class="font-mono-muleta tnum text-[10.5px] text-base-content/60 shrink-0 w-7 text-right"
              >
                {progressStr(j.progress)}
              </span>
            {/if}
          {:else}
            <span class="text-base-content/30">—</span>
          {/if}
        </div>

        <div class="font-mono-muleta tnum text-right text-[11px] text-base-content/70">
          {age(j.addedAt)}
        </div>

        <div class="font-mono-muleta tnum text-right text-[11px] text-base-content/60 truncate">
          {j.id}
        </div>

        <button
          type="button"
          class="btn btn-ghost btn-square btn-xs text-base-content/40 opacity-0 group-hover:opacity-100"
          aria-label="Job actions"
          disabled
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
    {/each}
  {/if}
</div>
