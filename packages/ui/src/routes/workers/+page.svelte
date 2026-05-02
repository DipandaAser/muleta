<script lang="ts">
	import { invalidateAll } from "$app/navigation"
	import type { Worker } from "$lib/api/client"
	import { RefreshCw, Server, TriangleAlert } from "@lucide/svelte"
	import type { PageProps } from "./$types"

	/**
	 * Threshold in seconds after which a worker that hasn't issued a Redis
	 * command counts as "stale". 30 s sits comfortably above BullMQ's
	 * default heartbeat (5 s) so a momentarily-busy worker doesn't flicker
	 * in and out of the stale list.
	 */
	const STALE_AFTER_SECONDS = 30

	type Filter = "all" | "online" | "stale"

	let { data }: PageProps = $props()

	// Read workers and error directly off `data` — SvelteKit invalidations
	// rerun the loader and update `data` reactively, so a derived view
	// stays in sync without an extra `$state` mirror.
	let workers = $derived<Worker[]>(data.workers)
	let error = $derived<string | null>(data.error)
	let filter = $state<Filter>("all")
	let refreshing = $state(false)

	let counts = $derived.by(() => {
		let online = 0
		let stale = 0
		for (const w of workers) {
			if (w.idleSeconds >= STALE_AFTER_SECONDS) stale++
			else online++
		}
		return { online, stale, total: workers.length }
	})

	let hostCount = $derived.by(() => {
		// `addr` looks like `host:port`; strip the port to count distinct
		// hosts. BullMQ's CLIENT LIST gives one row per worker connection,
		// so multiple workers on one host collapse here.
		const hosts = new Set<string>()
		for (const w of workers) {
			const host = w.addr.includes(":") ? w.addr.slice(0, w.addr.lastIndexOf(":")) : w.addr
			if (host) hosts.add(host)
		}
		return hosts.size
	})

	let filtered = $derived(
		workers.filter((w) => {
			const stale = w.idleSeconds >= STALE_AFTER_SECONDS
			if (filter === "online") return !stale
			if (filter === "stale") return stale
			return true
		}),
	)

	function isStale(w: Worker): boolean {
		return w.idleSeconds >= STALE_AFTER_SECONDS
	}

	/**
	 * Compact `Xh Ym` / `Ym Zs` / `Zs` rendering. Mirrors the design's
	 * uptime field — second precision feels noisy at hour scale, minute
	 * precision feels coarse at sub-minute scale.
	 */
	function formatUptime(seconds: number): string {
		if (seconds < 60) return `${Math.floor(seconds)}s`
		const m = Math.floor(seconds / 60)
		if (m < 60) return `${m}m ${Math.floor(seconds % 60)}s`
		const h = Math.floor(m / 60)
		const remM = m % 60
		if (h < 24) return `${h}h ${remM}m`
		const d = Math.floor(h / 24)
		return `${d}d ${h % 24}h`
	}

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

<div class="px-10 pt-8 pb-12 w-full">
	<!-- Header -->
	<div class="flex items-end gap-4 flex-wrap mb-6">
		<div>
			<h1 class="m-0 text-[22px] font-semibold tracking-tight flex items-center gap-2.5">
				<span class="text-base-content/80 flex">
					<Server size={20} />
				</span>
				Workers
			</h1>
			<div class="text-base-content/55 text-[12px] mt-1 font-mono-muleta flex items-center gap-2">
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
				No workers connected.
				<span class="font-mono-muleta text-base-content/40">
					Start a BullMQ Worker against any registered queue to see it here.
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
				{@const stale = isStale(w)}
				<div
					class="flex items-center gap-3 px-4 py-3 border-b border-base-300 last:border-b-0 hover:bg-base-200/50 transition-colors"
				>
					<span
						class="size-2 rounded-full shrink-0"
						style:background={stale ? "var(--color-error)" : "var(--color-success)"}
						aria-label={stale ? "stale" : "online"}
					></span>

					<div class="flex flex-col min-w-0 flex-1">
						<div class="flex items-center gap-2 text-[13px]">
							<span class="font-mono-muleta">
								{w.name ?? "(anonymous)"}
							</span>
							<span
								class="text-[10px] px-1.5 py-px rounded font-mono-muleta bg-base-300 text-base-content/70"
							>
								{w.queue}
							</span>
							{#if stale}
								<span
									class="text-[10px] px-1.5 py-px rounded font-mono-muleta"
									style:background="color-mix(in oklab, var(--color-error) 12%, transparent)"
									style:color="var(--color-error)"
								>
									stale · {Math.floor(w.idleSeconds)}s
								</span>
							{/if}
						</div>
						<div
							class="text-[11px] text-base-content/50 mt-0.5 font-mono-muleta flex items-center gap-2"
						>
							<span>{w.addr}</span>
							{#if w.id}
								<span class="text-base-content/30">·</span>
								<span>id {w.id}</span>
							{/if}
						</div>
					</div>

					<div class="flex flex-col items-end shrink-0">
						<span
							class="font-mono-muleta tnum text-[12px] {stale
								? 'text-base-content/35'
								: 'text-base-content/80'}"
						>
							{formatUptime(w.ageSeconds)}
						</span>
						<span class="text-[10px] text-base-content/40 uppercase tracking-wide mt-0.5">
							uptime
						</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
