<script lang="ts">
	import { invalidateAll } from "$app/navigation"
	import type { Worker } from "$lib/api/client"
	import WorkerRow from "$lib/components/WorkerRow.svelte"
	import { isStale } from "$lib/workers"
	import { RefreshCw, TriangleAlert } from "@lucide/svelte"
	import type { PageProps } from "./$types"

	type Filter = "all" | "online" | "stale"

	let { data }: PageProps = $props()

	let workers = $derived<Worker[]>(data.workers)
	let error = $derived<string | null>(data.error)
	let filter = $state<Filter>("all")
	let refreshing = $state(false)

	let counts = $derived.by(() => {
		let online = 0
		let stale = 0
		for (const w of workers) {
			if (isStale(w)) stale++
			else online++
		}
		return { online, stale, total: workers.length }
	})

	let hostCount = $derived.by(() => {
		const hosts = new Set<string>()
		for (const w of workers) {
			const host = w.addr.includes(":") ? w.addr.slice(0, w.addr.lastIndexOf(":")) : w.addr
			if (host) hosts.add(host)
		}
		return hosts.size
	})

	let filtered = $derived(
		workers.filter((w) => {
			const stale = isStale(w)
			if (filter === "online") return !stale
			if (filter === "stale") return stale
			return true
		}),
	)

	async function refresh() {
		refreshing = true
		try {
			await invalidateAll()
		} finally {
			refreshing = false
		}
	}

	const FILTERS: Array<{ id: Filter; label: string }> = [
		{ id: "all", label: "All" },
		{ id: "online", label: "Online" },
		{ id: "stale", label: "Stale" },
	]
</script>

<div class="pt-6 pb-12">
	<!-- Sub-header -->
	<div class="flex items-end gap-4 flex-wrap mb-4">
		<div class="text-base-content/55 text-[12px] font-mono-muleta flex items-center gap-2">
			<span class="text-base-content/80">{counts.online}</span>
			<span>online</span>
			{#if counts.stale > 0}
				<span class="text-base-content/30">·</span>
				<span class="text-error">{counts.stale}</span>
				<span>stale</span>
			{/if}
			{#if hostCount > 0}
				<span class="text-base-content/30">·</span>
				<span>across</span>
				<span class="text-base-content/80">{hostCount}</span>
				<span>{hostCount === 1 ? "host" : "hosts"}</span>
			{/if}
		</div>
		<div class="ml-auto flex items-center gap-2">
			<div class="join border border-base-300 rounded-field overflow-hidden">
				{#each FILTERS as f (f.id)}
					{@const active = filter === f.id}
					<button
						type="button"
						class="join-item px-3 py-1 text-[11px] uppercase tracking-wide transition-colors {active
							? 'bg-base-300 text-base-content'
							: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
						onclick={() => (filter = f.id)}
					>
						{f.label}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="btn btn-sm btn-ghost btn-square"
				class:animate-spin={refreshing}
				aria-label="Refresh workers"
				onclick={refresh}
			>
				<RefreshCw size={13} />
			</button>
		</div>
	</div>

	<!-- Error banner -->
	{#if error}
		<div
			class="flex items-center gap-2.5 px-4 py-2 mb-4 text-[12px] border rounded"
			style:background="oklch(0.64 0.2 18 / 0.12)"
			style:border-color="oklch(0.64 0.2 18 / 0.35)"
			style:color="oklch(72% 0.17 20)"
		>
			<TriangleAlert size={13} />
			<b class="text-base-content">Couldn't load workers.</b>
			<span class="font-mono-muleta text-base-content/60">{error}</span>
		</div>
	{/if}

	<!-- Worker list -->
	{#if filtered.length === 0}
		<div
			class="text-[12px] text-base-content/50 px-4 py-12 border border-base-300 border-dashed rounded text-center"
		>
			{#if workers.length === 0}
				No workers connected to this queue.
				<span class="font-mono-muleta text-base-content/40">
					Start a BullMQ Worker against this queue to see it here.
				</span>
			{:else}
				No workers match the
				<span class="font-mono-muleta text-base-content/70">{filter}</span>
				filter.
			{/if}
		</div>
	{:else}
		<div class="flex flex-col rounded border border-base-300 overflow-hidden">
			{#each filtered as w (w.id)}
				<WorkerRow worker={w} showQueue={false} />
			{/each}
		</div>
	{/if}
</div>
