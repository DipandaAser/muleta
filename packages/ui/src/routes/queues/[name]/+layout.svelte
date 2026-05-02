<script lang="ts">
	import { invalidateAll } from "$app/navigation"
	import { page } from "$app/state"
	import {
		MoreHorizontal,
		MoreHorizontalIcon,
		Pause,
		Plus,
		RefreshCw,
		Rows4,
		TriangleAlert,
	} from "@lucide/svelte"
	import type { Snippet } from "svelte"
	import type { LayoutData } from "./$types"

	interface Props {
		data: LayoutData
		children: Snippet
	}

	let { data, children }: Props = $props()

	let queue = $derived(data.queue)
	let name = $derived(data.name)
	let queueError = $derived(data.error)

	// Tab ids map to subroutes under /queues/[name]/<id>. `overview` is the
	// bare /queues/[name] path (no sub-segment); "Coming soon" ones have no
	// matching route file yet.
	const TABS: Array<{
		id: string
		label: string
		disabled: boolean
		count?: () => number
	}> = [
		{ id: "overview", label: "Overview", disabled: false },
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

	function hrefFor(tabId: string): string {
		return `/queues/${name}/${tabId}`
	}

	function isActive(tabId: string): boolean {
		const path = page.url.pathname
		return path.startsWith(`/queues/${name}/${tabId}`)
	}

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
				onclick={() => invalidateAll()}
			>
				Retry
			</button>
		</div>
	{/if}

	<div class="px-10 pt-8 min-w-full">
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
				<div class="text-base-content/50 text-[12px] mt-1 font-mono-muleta flex items-center gap-2">
					<span>{queue?.prefix ? `${queue.prefix}:${name}:*` : `${name}:*`}</span>
				</div>
			</div>
			<div class="ml-auto flex items-center gap-2">
				<a href="/queues/{name}/add-job" class="btn btn-sm btn-ghost">
					<Plus size={13} /> Add job
				</a>
				<button type="button" class="btn btn-sm btn-ghost" disabled>
					<Pause size={13} /> Pause
				</button>
				<button
					type="button"
					class="btn btn-sm btn-ghost btn-square"
					onclick={() => invalidateAll()}
					aria-label="Refresh"
				>
					<RefreshCw size={13} />
				</button>
				<button type="button" class="btn btn-sm btn-ghost btn-square" disabled aria-label="More">
					<MoreHorizontal size={14} />
				</button>
			</div>
		</div>

		<!-- tabs — real routes now -->
		<div class="flex items-center gap-5 border-b border-base-300 mt-6 -mx-10 px-10">
			{#each TABS as t (t.id)}
				{@const active = isActive(t.id)}
				{@const n = t.count?.() ?? 0}
				{#if t.disabled}
					<span
						class="relative py-2 text-[13px] flex items-center gap-1.5 -mb-px border-b-2 border-transparent text-base-content/40 cursor-not-allowed"
						title="Coming soon"
					>
						{t.label}
					</span>
				{:else}
					<a
						href={hrefFor(t.id)}
						class="relative py-2 text-[13px] flex items-center gap-1.5 -mb-px border-b-2 transition-colors
              {active
							? 'border-primary text-base-content font-medium'
							: 'border-transparent text-base-content/60 hover:text-base-content'}"
					>
						{t.label}
						{#if t.count && n > 0}
							<span
								class="font-mono-muleta text-[10.5px] px-1.5 py-0.5 rounded bg-base-300 text-base-content/60 tnum"
							>
								{formatTotal(n)}
							</span>
						{/if}
					</a>
				{/if}
			{/each}
		</div>

		{@render children()}
	</div>
</div>
