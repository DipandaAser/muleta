<script lang="ts">
	import { page } from "$app/state"
	import { api, JOB_STATES, type Job, type JobState, type Queue } from "$lib/api/client"
	import JobsTable from "$lib/components/JobsTable.svelte"
	import { Search } from "@lucide/svelte"

	// The parent layout's `load` populated $page.data.queue; we re-derive here
	// to render the filter pill counts without another round-trip.
	let queue = $derived(page.data.queue as Queue | null)
	let name = $derived(page.params.name as string)

	// Filter pills are multi-select: click toggles membership. At least one
	// must stay selected, otherwise there's nothing to query.
	let activeStates = $state<Set<JobState>>(new Set<JobState>(["failed"]))
	let jobs = $state<Job[]>([])
	let jobsTotal = $state(0)
	let jobsLoading = $state(true)
	let jobsError = $state<string | null>(null)

	// Derived stable key for the $effect + query CSV — iterating the Set directly
	// each render would give a new object identity and re-fire needlessly.
	let statesCsv = $derived(JOB_STATES.filter((s) => activeStates.has(s)).join(","))

	function toggleState(s: JobState): void {
		const next = new Set(activeStates)
		if (next.has(s)) {
			if (next.size === 1) return // keep at least one state selected
			next.delete(s)
		} else {
			next.add(s)
		}
		activeStates = next
	}

	async function loadJobs() {
		jobsLoading = true
		jobsError = null
		try {
			const res = await api.api.v1.queues[":name"].jobs.$get({
				param: { name },
				query: { state: statesCsv, limit: 20 },
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
		void statesCsv
		void name
		loadJobs()
	})

	function countFor(state: JobState): number {
		if (!queue) return 0
		return queue.counts[state as keyof typeof queue.counts] ?? 0
	}

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

	function formatTotal(n: number): string {
		if (n < 1000) return String(n)
		if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
		return `${(n / 1_000_000).toFixed(1)}M`
	}
</script>

<!-- state filter pills + search -->
<div class="flex items-center gap-1.5 flex-wrap mt-5 mb-4">
	{#each JOB_STATES as s (s)}
		{@const count = countFor(s)}
		{@const isActive = activeStates.has(s)}
		{@const isLast = isActive && activeStates.size === 1}
		<button
			type="button"
			class="badge badge-md font-mono-muleta gap-1.5
        {isActive ? 'badge-neutral' : 'badge-ghost'}
        {isLast ? 'cursor-default' : 'cursor-pointer'}"
			title={isLast ? "At least one state must stay selected" : undefined}
			onclick={() => toggleState(s)}
		>
			<span class="w-1.5 h-1.5 rounded-full shrink-0" style:background={DOT[s]}></span>
			{s}
			<span class="tnum opacity-60">{formatTotal(count)}</span>
		</button>
	{/each}

	<div
		class="ml-auto flex items-center gap-2 h-7 px-3 rounded-md bg-base-200 border border-base-300 text-base-content/50 w-72"
	>
		<Search size={12} />
		<input
			type="text"
			placeholder="Search data… data.to:@muleta.dev"
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
		<b>Couldn't load jobs:</b>
		{jobsError}
	</div>
{/if}

<JobsTable {jobs} loading={jobsLoading} queueName={name} />

{#if !jobsLoading && jobs.length > 0 && jobsTotal > jobs.length}
	<p class="text-[11px] text-base-content/50 mt-3 font-mono-muleta pb-8">
		Showing {jobs.length} of {formatTotal(jobsTotal)} · pagination arrives in a later PR.
	</p>
{:else}
	<div class="pb-8"></div>
{/if}
