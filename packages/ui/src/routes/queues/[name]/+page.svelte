<script lang="ts">
import { page } from "$app/state"
import { api, JOB_STATES, type Job, type JobState, type Queue } from "$lib/api/client"
import JobsTable from "$lib/components/JobsTable.svelte"
import {
  MoreHorizontal,
  Pause,
  Plus,
  RefreshCw,
  Rows4,
  Search,
  TriangleAlert,
} from "@lucide/svelte"

let name = $derived(page.params.name as string)

// Queue header / counts
let queue = $state<Queue | null>(null)
let queueError = $state<string | null>(null)

// Jobs tab state
let activeState = $state<JobState>("failed")
let jobs = $state<Job[]>([])
let jobsTotal = $state(0)
let jobsLoading = $state(true)
let jobsError = $state<string | null>(null)

async function loadQueue() {
  queueError = null
  try {
    const res = await api.api.v1.queues[":name"].$get({ param: { name } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    queue = await res.json()
  } catch (e) {
    queueError = e instanceof Error ? e.message : "failed to load queue"
  }
}

async function loadJobs() {
  jobsLoading = true
  jobsError = null
  try {
    const res = await api.api.v1.queues[":name"].jobs.$get({
      param: { name },
      query: { state: activeState, limit: 20 },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    jobs = body.jobs
    jobsTotal = body.total
  } catch (e) {
    jobsError = e instanceof Error ? e.message : "failed to load jobs"
  } finally {
    jobsLoading = false
  }
}

$effect(() => {
  loadQueue()
})

$effect(() => {
  void activeState
  loadJobs()
})

function countFor(state: JobState): number {
  if (!queue) return 0
  return queue.counts[state as keyof typeof queue.counts] ?? 0
}

function refreshAll() {
  loadQueue()
  loadJobs()
}

// state → dot color. Mirrors StateBadge's palette without the background pill.
const DOT: Record<JobState, string> = {
  waiting: "var(--color-state-waiting)",
  active: "var(--color-info)",
  completed: "var(--color-success)",
  failed: "var(--color-error)",
  delayed: "var(--color-warning)",
  paused: "var(--color-state-paused)",
  prioritized: "var(--color-state-prioritized)",
  "waiting-children": "var(--color-state-waiting)",
}

// Upcoming tabs — only "jobs" is active this PR.
const TABS: Array<{ id: string; label: string; count?: () => number; disabled: boolean }> = [
  { id: "overview", label: "Overview", disabled: true },
  {
    id: "jobs",
    label: "Jobs",
    disabled: false,
    count: () => {
      if (!queue) return 0
      const { waiting, active, failed, delayed, prioritized } = queue.counts
      return waiting + active + failed + delayed + prioritized
    },
  },
  { id: "schedulers", label: "Schedulers", disabled: true },
  { id: "workers", label: "Workers", disabled: true },
  { id: "flows", label: "Flows", disabled: true },
  { id: "metrics", label: "Metrics", disabled: true },
]

let activeTab = $state("jobs")

function formatTotal(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
</script>

<div class="flex flex-col min-h-full">
  {#if queueError}
    <div
      class="flex items-center gap-2.5 px-6 py-2 text-[12px] border-b"
      style:background="oklch(0.64 0.2 18 / 0.12)"
      style:border-color="oklch(0.64 0.2 18 / 0.35)"
      style:color="oklch(72% 0.17 20)"
    >
      <TriangleAlert size={13} />
      <span>
        <b class="text-base-content">Couldn't load queue.</b>
        <span class="font-mono-muleta ml-1 text-base-content/60">{queueError}</span>
      </span>
      <button
        type="button"
        class="ml-auto px-2 py-0.5 rounded text-[11px] border cursor-pointer hover:bg-base-300/20"
        style:border-color="oklch(0.64 0.2 18 / 0.35)"
        style:color="oklch(72% 0.17 20)"
        onclick={refreshAll}
      >
        Retry
      </button>
    </div>
  {/if}

  <div class="px-10 pt-8 pb-8 max-w-400">
    <!-- header -->
    <div class="flex items-start gap-4">
      <div>
        <h1 class="m-0 text-[22px] font-semibold tracking-tight flex items-center gap-2.5">
          <span class="text-base-content/80 flex">
            <Rows4 size={20} />
          </span>
          {queue?.displayName ?? name}
          {#if queue?.isPaused}
            <span
              class="font-mono-muleta text-[11px] px-1.5 py-0.5 rounded"
              style:background="var(--color-state-paused-bg)"
              style:color="var(--color-state-paused)"
            >
              paused
            </span>
          {/if}
        </h1>
        <div
          class="text-base-content/50 text-[12px] mt-1 font-mono-muleta flex items-center gap-2"
        >
          <span>{queue?.prefix ? `${queue.prefix}:${name}:*` : `${name}:*`}</span>
        </div>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <button type="button" class="btn btn-sm btn-ghost" disabled>
          <Plus size={13} /> Add job
        </button>
        <button type="button" class="btn btn-sm btn-ghost" disabled>
          <Pause size={13} /> Pause
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost btn-square"
          onclick={refreshAll}
          disabled={jobsLoading}
          aria-label="Refresh"
        >
          <RefreshCw size={13} />
        </button>
        <button type="button" class="btn btn-sm btn-ghost btn-square" disabled aria-label="More">
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>

    <!-- tabs -->
    <div class="flex items-center gap-5 border-b border-base-300 mt-6 -mx-10 px-10">
      {#each TABS as t (t.id)}
        {@const isActive = activeTab === t.id}
        {@const n = t.count?.() ?? 0}
        <button
          type="button"
          class="relative py-2 text-[13px] flex items-center gap-1.5 -mb-px border-b-2 transition-colors
            {isActive
            ? 'border-primary text-base-content font-medium'
            : 'border-transparent text-base-content/60'}
            {t.disabled ? 'cursor-not-allowed' : 'hover:text-base-content cursor-pointer'}"
          disabled={t.disabled}
          title={t.disabled ? "Coming soon" : undefined}
          onclick={() => !t.disabled && (activeTab = t.id)}
        >
          {t.label}
          {#if t.count && n > 0}
            <span
              class="font-mono-muleta text-[10.5px] px-1.5 py-0.5 rounded bg-base-300 text-base-content/60 tnum"
            >
              {formatTotal(n)}
            </span>
          {/if}
        </button>
      {/each}
    </div>

    {#if activeTab === "jobs"}
      <!-- state filter pills + search -->
      <div class="flex items-center gap-1.5 flex-wrap mt-5 mb-4">
        {#each JOB_STATES as s (s)}
          {@const count = countFor(s)}
          {@const isActive = activeState === s}
          <button
            type="button"
            class="font-mono-muleta text-[11px] px-2 py-1 rounded border cursor-pointer inline-flex items-center gap-1.5
              {isActive
              ? 'bg-base-300 border-base-300 text-base-content'
              : 'bg-base-200 border-base-300 text-base-content/70 hover:bg-base-300/60'}"
            onclick={() => (activeState = s)}
          >
            <span class="w-1.5 h-1.5 rounded-full" style:background={DOT[s]}></span>
            {s}
            <span class="tnum text-base-content/50">
              {formatTotal(count)}
            </span>
          </button>
        {/each}

        <div
          class="ml-auto flex items-center gap-2 h-7 px-3 rounded-md bg-base-200 border border-base-300 text-base-content/50 w-72"
        >
          <Search size={12} />
          <input
            type="text"
            placeholder="Search data… data.to:@parsel.co"
            class="flex-1 bg-transparent border-0 outline-0 text-[11.5px] text-base-content"
            disabled
          />
        </div>

        <span class="font-mono-muleta text-[11px] text-base-content/50 tnum">
          {jobs.length} job{jobs.length === 1 ? "" : "s"}
        </span>
      </div>

      {#if jobsError}
        <div
          class="text-[12px] px-3 py-2 rounded border mb-4"
          style:color="oklch(72% 0.17 20)"
          style:border-color="oklch(0.64 0.2 18 / 0.35)"
          style:background="oklch(0.64 0.2 18 / 0.08)"
        >
          <b>Couldn't load jobs:</b> {jobsError}
        </div>
      {/if}

      <JobsTable {jobs} loading={jobsLoading} />

      {#if !jobsLoading && jobs.length > 0 && jobsTotal > jobs.length}
        <p class="text-[11px] text-base-content/50 mt-3 font-mono-muleta">
          Showing {jobs.length} of {formatTotal(jobsTotal)} · pagination arrives in a later PR.
        </p>
      {/if}
    {/if}
  </div>
</div>
