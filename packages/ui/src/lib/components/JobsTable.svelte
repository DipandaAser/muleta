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
</script>

<div class="overflow-x-auto rounded-lg border border-base-300 bg-base-100">
  <table class="table table-sm">
    <thead>
      <tr class="text-base-content/60 text-[10.5px] uppercase tracking-wider">
        <th class="w-6"></th>
        <th class="w-24">State</th>
        <th>Name</th>
        <th>Data preview</th>
        <th class="text-right w-17.5">Attempts</th>
        <th class="text-right w-20">Duration</th>
        <th class="w-22.5">Progress</th>
        <th class="text-right w-19">Added</th>
        <th class="text-right w-24">ID</th>
        <th class="w-7"></th>
      </tr>
    </thead>
    <tbody>
      {#if loading && jobs.length === 0}
        {#each Array(5) as _, i (i)}
          <tr>
            <td><span class="skeleton h-3 w-3 block"></span></td>
            <td><span class="skeleton h-4 w-16 block"></span></td>
            <td><span class="skeleton h-3 w-32 block"></span></td>
            <td><span class="skeleton h-3 w-40 block"></span></td>
            <td><span class="skeleton h-3 w-8 ml-auto block"></span></td>
            <td><span class="skeleton h-3 w-12 ml-auto block"></span></td>
            <td><span class="skeleton h-1.5 w-full block"></span></td>
            <td><span class="skeleton h-3 w-10 ml-auto block"></span></td>
            <td><span class="skeleton h-3 w-14 ml-auto block"></span></td>
            <td></td>
          </tr>
        {/each}
      {:else if jobs.length === 0}
        <tr>
          <td colspan="10" class="p-10 text-center text-base-content/60 text-[13px]">
            No jobs in this state.
          </td>
        </tr>
      {:else}
        {#each jobs as j (j.id)}
          <tr class="hover:bg-base-200/60 group text-[12.5px]">
            <td>
              <input
                type="checkbox"
                class="checkbox checkbox-xs"
                disabled
                aria-label="Select job"
              />
            </td>
            <td><StateBadge state={j.state} /></td>
            <td class="font-medium truncate">{j.name}</td>
            <td class="font-mono-muleta text-[11px] text-base-content/70 truncate">
              {dataPreview(j.data)}
            </td>
            <td
              class="font-mono-muleta tnum text-right text-[11.5px] {j.attemptsMade >= j.attempts &&
              j.state === 'failed'
                ? 'text-error'
                : 'text-base-content/70'}"
            >
              {j.attemptsMade}/{j.attempts}
            </td>
            <td class="font-mono-muleta tnum text-right text-base-content/70 text-[11px]">
              {#if j.processedAt && j.finishedAt}
                {duration(j.processedAt, j.finishedAt)}
              {:else if j.state === "active" && j.processedAt}
                {duration(j.processedAt, Date.now())}
              {:else}
                <span class="text-base-content/30">—</span>
              {/if}
            </td>
            <td>
              <div class="flex items-center gap-2 min-w-0">
                {#if j.state === "active" || (typeof j.progress === "number" && j.progress > 0)}
                  <div class="relative h-1 flex-1 rounded-full bg-base-300 overflow-hidden">
                    <div
                      class="absolute inset-y-0 left-0 rounded-full"
                      style:width="{progressPct(j.progress)}%"
                      style:background={j.state === "active"
                        ? "var(--color-info)"
                        : "var(--color-success)"}
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
            </td>
            <td class="font-mono-muleta tnum text-right text-[11px] text-base-content/70">
              {age(j.addedAt)}
            </td>
            <td class="font-mono-muleta tnum text-right text-[11px] text-base-content/60 truncate">
              {j.id}
            </td>
            <td>
              <button
                type="button"
                class="btn btn-ghost btn-square btn-xs text-base-content/40 opacity-0 group-hover:opacity-100"
                aria-label="Job actions"
                disabled
              >
                <MoreHorizontal size={12} />
              </button>
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
