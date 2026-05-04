<script lang="ts">
	import { createQueuesSubscription } from "$lib/api/queues.svelte"
	import { paths } from "$lib/paths"
	import { RefreshCw, Search, TriangleAlert } from "@lucide/svelte"
	import { onDestroy } from "svelte"
	import type { PageData } from "./$types"

	let { data }: { data: PageData } = $props()

	const JOB_STATES = [
		"waiting",
		"active",
		"completed",
		"failed",
		"delayed",
		"paused",
		"prioritized",
	] as const

	type State = (typeof JOB_STATES)[number]

	const STATE_COLOR: Record<State, string> = {
		waiting: "var(--color-state-waiting)",
		active: "var(--color-info)",
		completed: "var(--color-success)",
		failed: "var(--color-error)",
		delayed: "var(--color-warning)",
		paused: "var(--color-state-paused)",
		prioritized: "var(--color-state-prioritized)",
	}

	// Loader timestamp — used as `lastUpdated` until the first SSE frame arrives.
	const loadedAt = Date.now()

	const sub = createQueuesSubscription()
	onDestroy(() => sub.close())

	let now = $state(Date.now())
	$effect(() => {
		const interval = setInterval(() => {
			now = Date.now()
		}, 1000)
		return () => clearInterval(interval)
	})

	// Loader seeds the initial render; SSE takes over once the first frame lands.
	let queues = $derived(sub.lastFrameAt !== null ? sub.queues : data.queues)
	let lastUpdated = $derived(sub.lastFrameAt ?? (data.error ? null : loadedAt))

	let error = $derived(
		sub.connection === "closed"
			? "live stream disconnected"
			: sub.connection === "connecting" && sub.attempt > 0
				? `reconnecting (attempt ${sub.attempt}/${sub.maxAttempts})`
				: sub.lastFrameAt === null && data.error
					? data.error
					: null,
	)

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
			for (const s of JOB_STATES) t[s] += q.counts[s] ?? 0
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

<div class="flex flex-col min-h-full min-w-full">
	<!-- Error banner: matches design loading-JOB_STATES.html §02 (hard failure) -->
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
				onclick={() => sub.reconnect()}
			>
				Retry
			</button>
		</div>
	{/if}

	<div class="px-10 py-8 min-w-full" class:opacity-40={isStale}>
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
				<button type="button" class="btn btn-sm btn-ghost" onclick={() => sub.reconnect()}>
					<RefreshCw size={13} /> Refresh
				</button>
			</div>
		</div>

		<!-- summary strip: 7 state totals -->
		<div
			class="grid grid-cols-7 gap-px bg-base-300 border border-base-300 rounded-lg overflow-hidden mb-8"
		>
			{#each JOB_STATES as s (s)}
				<div class="bg-base-200 p-4 flex flex-col gap-1.5">
					<div class="flex items-center gap-1.5 text-[11px] text-base-content/60 tracking-wide">
						<span class="w-1.5 h-1.5 rounded-full" style:background={STATE_COLOR[s]}></span>
						{s}
					</div>
					<div class="font-mono-muleta tnum text-[22px] font-medium leading-none">
						{numStr(totals[s])}
					</div>
					<div class="font-mono-muleta text-[10.5px] text-base-content/50 tnum">—</div>
				</div>
			{/each}
		</div>

		<!-- queue table -->
		<div class="bg-base-200 border border-base-300 rounded-lg overflow-hidden">
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

			{#if sorted.length === 0 && !error}
				<div class="p-10 text-center text-base-content/60">
					No queues found in Redis yet. Discovery re-runs every 15 s — any BullMQ queue under the
					<code class="font-mono-muleta">bull:</code> prefix will appear here automatically.
				</div>
			{:else}
				{#each sorted as q (q.name)}
					<a
						href={paths.queue(q.name)}
						class="grid items-center px-6 h-12 text-[12.5px] border-b border-base-300 last:border-b-0 hover:bg-base-200/60"
						style="grid-template-columns: 2fr 56px repeat(6, 64px) 120px;"
					>
						<div class="flex flex-col gap-0.5 min-w-0">
							<div class="font-medium flex items-center gap-2">
								<span class={q.isPaused ? "text-base-content/60" : ""}>{q.displayName}</span>
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
							style:color={q.counts.active > 0 ? "var(--color-info)" : undefined}
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
							style:color={q.counts.failed > 0 ? "var(--color-error)" : undefined}
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
							class="font-mono-muleta tnum text-right {q.counts.prioritized === 0
								? 'text-base-content/30'
								: ''}"
						>
							{numStr(q.counts.prioritized)}
						</div>
						<div class="font-mono-muleta tnum text-right text-base-content/30">—</div>
					</a>
				{/each}
			{/if}
		</div>

		<p class="text-[11px] text-base-content/40 mt-4">
			Throughput columns are blank until the metrics-retention plugin is installed.
		</p>
	</div>
</div>
