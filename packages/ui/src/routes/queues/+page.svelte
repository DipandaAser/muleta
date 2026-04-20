<script lang="ts">
import { api, type Queue } from "$lib/api/client"
import { RefreshCw, Search, TriangleAlert } from "@lucide/svelte"

const STATES = [
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "prioritized",
] as const

type State = (typeof STATES)[number]

const STATE_COLOR: Record<State, string> = {
  waiting: "var(--color-state-waiting)",
  active: "var(--color-info)",
  completed: "var(--color-success)",
  failed: "var(--color-error)",
  delayed: "var(--color-warning)",
  paused: "var(--color-state-paused)",
  prioritized: "var(--color-state-prioritized)",
}

let queues = $state<Queue[]>([])
let loading = $state(true)
let error = $state<string | null>(null)
let lastUpdated = $state<number | null>(null)
let now = $state(Date.now())

async function load() {
  loading = true
  error = null
  try {
    const res = await api.api.v1.queues.$get()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    queues = body.queues
    lastUpdated = Date.now()
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load queues"
  } finally {
    loading = false
  }
}

$effect(() => {
  load()
  const interval = setInterval(() => {
    now = Date.now()
  }, 1000)
  return () => clearInterval(interval)
})

let totals = $derived.by(() => {
  const t: Record<State, number> = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
    prioritized: 0,
  }
  for (const q of queues) {
    for (const s of STATES) t[s] += q.counts[s] ?? 0
  }
  return t
})

let sorted = $derived(
  [...queues].sort(
    (a, b) => b.counts.active + b.counts.waiting - (a.counts.active + a.counts.waiting),
  ),
)

function numStr(n: number): string {
  return n.toLocaleString()
}

function agoStr(ts: number, ref: number): string {
  const s = Math.max(0, Math.floor((ref - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}

let isStale = $derived(error !== null && queues.length > 0)
</script>

<div class="flex flex-col min-h-full">
  <!-- Error banner: matches design loading-states.html §02 (hard failure) -->
  {#if error}
    <div
      class="flex items-center gap-2.5 px-6 py-2 text-[12px] border-b"
      style:background="oklch(0.64 0.2 18 / 0.12)"
      style:border-color="oklch(0.64 0.2 18 / 0.35)"
      style:color="oklch(72% 0.17 20)"
    >
      <TriangleAlert size={13} />
      <span>
        <b class="text-base-content">Can't reach muleta API.</b>
        <span class="font-mono-muleta ml-1 text-base-content/60">{error}</span>
      </span>
      <button
        type="button"
        class="ml-auto px-2 py-0.5 rounded text-[11px] border cursor-pointer hover:bg-base-300/20"
        style:border-color="oklch(0.64 0.2 18 / 0.35)"
        style:color="oklch(72% 0.17 20)"
        onclick={load}
      >
        Retry
      </button>
    </div>
  {/if}

  <div class="px-10 py-8 max-w-400" class:opacity-40={isStale}>
    <!-- header -->
    <div class="flex items-end gap-6 mb-8">
      <div>
        <h1 class="m-0 text-[22px] font-semibold tracking-tight">Queues</h1>
        <div class="text-base-content/60 text-[13px] mt-1">
          {#if isStale && lastUpdated}
            <span style:color="oklch(72% 0.17 20)">
              stale · last updated {agoStr(lastUpdated, now)}
            </span>
          {:else}
            <span class="font-mono-muleta tnum">{queues.length}</span> queues
            {#if lastUpdated}
              · updated {agoStr(lastUpdated, now)}
            {/if}
          {/if}
        </div>
      </div>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn btn-sm btn-ghost" disabled>
          <Search size={13} /> Filter
        </button>
        <button
          type="button"
          class="btn btn-sm btn-ghost"
          onclick={load}
          disabled={loading}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
    </div>

    <!-- summary strip: 7 state totals -->
    <div
      class="grid grid-cols-7 gap-px bg-base-300 border border-base-300 rounded-lg overflow-hidden mb-8"
    >
      {#each STATES as s (s)}
        <div class="bg-base-100 p-4 flex flex-col gap-1.5">
          <div
            class="flex items-center gap-1.5 text-[11px] text-base-content/60 tracking-wide"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              style:background={STATE_COLOR[s]}
            ></span>
            {s}
          </div>
          <div
            class="font-mono-muleta tnum text-[22px] font-medium leading-none"
          >
            {#if loading && !isStale}
              <span class="skeleton h-5 w-10"></span>
            {:else}
              {numStr(totals[s])}
            {/if}
          </div>
          <div class="font-mono-muleta text-[10.5px] text-base-content/50 tnum">
            —
          </div>
        </div>
      {/each}
    </div>

    <!-- queue table -->
    <div class="bg-base-100 border border-base-300 rounded-lg overflow-hidden">
      <div
        class="grid items-center px-6 h-8 text-base-content/60 text-[10.5px] font-medium uppercase tracking-wider border-b border-base-300"
        style="grid-template-columns: 2fr 56px repeat(6, 64px) 120px;"
      >
        <div>Queue</div>
        <div class="text-right">W</div>
        <div class="text-right">Wait</div>
        <div class="text-right">Active</div>
        <div class="text-right">Delayed</div>
        <div class="text-right">Fail</div>
        <div class="text-right">Paused</div>
        <div class="text-right">Prio</div>
        <div class="text-right">Throughput</div>
      </div>

      {#if loading && !isStale}
        {#each Array(3) as _, i (i)}
          <div
            class="grid items-center px-6 h-12 border-b border-base-300 last:border-b-0"
            style="grid-template-columns: 2fr 56px repeat(6, 64px) 120px;"
          >
            <span class="skeleton h-3 w-40"></span>
            {#each Array(8) as _, j (j)}
              <span class="skeleton h-3 w-8 ml-auto"></span>
            {/each}
          </div>
        {/each}
      {:else if sorted.length === 0 && !error}
        <div class="p-10 text-center text-base-content/60">
          No queues registered. Set <code class="font-mono-muleta"
            >MULETA_QUEUES</code
          > on the server.
        </div>
      {:else}
        {#each sorted as q (q.name)}
          <div
            class="grid items-center px-6 h-12 text-[12.5px] border-b border-base-300 last:border-b-0 hover:bg-base-200/60"
            style="grid-template-columns: 2fr 56px repeat(6, 64px) 120px;"
          >
            <div class="flex flex-col gap-0.5 min-w-0">
              <div class="font-medium flex items-center gap-2">
                <span class={q.isPaused ? "text-base-content/60" : ""}
                  >{q.displayName}</span
                >
                {#if q.isPaused}
                  <span
                    class="badge badge-sm"
                    style:background="var(--color-state-paused-bg)"
                    style:color="var(--color-state-paused)"
                  >
                    paused
                  </span>
                {/if}
              </div>
              <div class="font-mono-muleta text-[10.5px] text-base-content/40">
                {q.prefix ? `${q.prefix}:${q.name}` : q.name}
              </div>
            </div>
            <div class="font-mono-muleta tnum text-right">—</div>
            <div
              class="font-mono-muleta tnum text-right {q.counts.waiting === 0
                ? 'text-base-content/30'
                : ''}"
            >
              {numStr(q.counts.waiting)}
            </div>
            <div
              class="font-mono-muleta tnum text-right {q.counts.active === 0
                ? 'text-base-content/30'
                : ''}"
              style:color={q.counts.active > 0
                ? "var(--color-info)"
                : undefined}
            >
              {numStr(q.counts.active)}
            </div>
            <div
              class="font-mono-muleta tnum text-right {q.counts.delayed === 0
                ? 'text-base-content/30'
                : ''}"
            >
              {numStr(q.counts.delayed)}
            </div>
            <div
              class="font-mono-muleta tnum text-right {q.counts.failed === 0
                ? 'text-base-content/30'
                : ''}"
              style:color={q.counts.failed > 0
                ? "var(--color-error)"
                : undefined}
            >
              {numStr(q.counts.failed)}
            </div>
            <div
              class="font-mono-muleta tnum text-right {q.counts.paused === 0
                ? 'text-base-content/30'
                : ''}"
            >
              {numStr(q.counts.paused)}
            </div>
            <div
              class="font-mono-muleta tnum text-right {q.counts.prioritized ===
              0
                ? 'text-base-content/30'
                : ''}"
            >
              {numStr(q.counts.prioritized)}
            </div>
            <div class="font-mono-muleta tnum text-right text-base-content/30">
              —
            </div>
          </div>
        {/each}
      {/if}
    </div>

    <p class="text-[11px] text-base-content/40 mt-4">
      Throughput columns are blank until the metrics-retention plugin is
      installed.
    </p>
  </div>
</div>
