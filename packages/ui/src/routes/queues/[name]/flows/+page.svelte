<script lang="ts">
	import { invalidateAll } from "$app/navigation"
	import { page } from "$app/state"
	import { api, type FlowJobNode, type FlowSummary } from "$lib/api/client"
	import StateBadge from "$lib/components/StateBadge.svelte"
	import { age } from "$lib/jobs/format"
	import { GitFork, RefreshCw, TriangleAlert } from "@lucide/svelte"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()

	let flows = $derived<FlowSummary[]>(data.flows)
	let error = $derived<string | null>(data.error)
	let queueName = $derived(page.params.name as string)

	let selectedId = $state<string | null>(null)
	let selected = $derived<FlowSummary | null>(
		(selectedId !== null && flows.find((f) => f.id === selectedId)) || flows[0] || null,
	)

	let tree = $state<FlowJobNode | null>(null)
	let treeLoading = $state(false)
	let treeError = $state<string | null>(null)

	// Fetch the tree whenever the selected flow changes. The graph view
	// (stage 2) will replace the nested-card placeholder below; the load
	// itself stays the same.
	$effect(() => {
		const id = selected?.id
		if (!id) {
			tree = null
			return
		}
		let cancelled = false
		treeLoading = true
		treeError = null
		;(async () => {
			try {
				const res = await api.api.v1.queues[":name"].flows[":id"].$get({
					param: { name: queueName, id },
					query: {},
				})
				if (!res.ok) throw new Error(`HTTP ${res.status}`)
				const body = await res.json()
				if (!cancelled) tree = body
			} catch (e) {
				if (!cancelled) treeError = e instanceof Error ? e.message : "failed to load flow tree"
			} finally {
				if (!cancelled) treeLoading = false
			}
		})()
		return () => {
			cancelled = true
		}
	})

	function totalDescendants(node: FlowJobNode): number {
		let n = 0
		for (const c of node.children) n += 1 + totalDescendants(c)
		return n
	}
</script>

<div class="pt-6 pb-12 -mx-10">
	{#if error}
		<div
			class="flex items-center gap-2.5 mx-10 px-4 py-2 mb-4 text-[12px] border rounded"
			style:background="oklch(0.64 0.2 18 / 0.12)"
			style:border-color="oklch(0.64 0.2 18 / 0.35)"
			style:color="oklch(72% 0.17 20)"
		>
			<TriangleAlert size={13} />
			<b class="text-base-content">Couldn't load flows.</b>
			<span class="font-mono-muleta text-base-content/60">{error}</span>
		</div>
	{/if}

	<div class="flex border-y border-base-300 min-h-130">
		<!-- LEFT: flow list -->
		<aside class="w-[320px] shrink-0 border-r border-base-300 flex flex-col">
			<header class="flex items-center justify-between px-4 py-3 border-b border-base-300">
				<h2 class="text-[14px] font-semibold tracking-tight flex items-center gap-1.5">
					<GitFork size={13} class="rotate-180" />
					Flows on {queueName}
				</h2>
				<button
					type="button"
					class="btn btn-xs btn-ghost btn-square"
					onclick={() => invalidateAll()}
					aria-label="Refresh flows"
				>
					<RefreshCw size={11} />
				</button>
			</header>

			{#if flows.length === 0}
				<div class="text-[12px] text-base-content/50 px-4 py-12 text-center font-mono-muleta">
					No flows on this queue.
					<br />
					<span class="text-base-content/40">
						A "flow" is a parent job that has at least one child via FlowProducer.
					</span>
				</div>
			{:else}
				<ul class="flex-1 overflow-auto">
					{#each flows as f (f.id)}
						{@const active = (selected?.id ?? null) === f.id}
						<li>
							<button
								type="button"
								class="w-full text-left flex flex-col gap-1 px-4 py-3 border-b border-base-300 cursor-pointer transition-colors
									{active ? 'bg-base-200' : 'hover:bg-base-200/50'}"
								onclick={() => (selectedId = f.id)}
							>
								<div class="flex items-center justify-between gap-2">
									<span class="font-mono-muleta text-[13px] truncate">#{f.id}</span>
									<StateBadge state={f.state} />
								</div>
								<div class="flex items-center justify-between text-[11px] text-base-content/55">
									<span class="font-mono-muleta truncate">{f.name}</span>
									<span class="font-mono-muleta tnum shrink-0 ml-2">
										{f.childrenCount} child{f.childrenCount === 1 ? "" : "ren"} · {age(f.addedAt)}
									</span>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</aside>

		<!-- RIGHT: tree placeholder (SvelteFlow lands in stage 2) -->
		<section class="flex-1 min-w-0 flex flex-col">
			{#if !selected}
				<div class="flex-1 flex items-center justify-center text-[12px] text-base-content/50">
					Select a flow.
				</div>
			{:else}
				<header class="flex items-center gap-3 px-6 py-3 border-b border-base-300 flex-wrap">
					<h3 class="font-mono-muleta text-[14px]">#{selected.id}</h3>
					<div class="text-[11px] text-base-content/55 font-mono-muleta flex items-center gap-2">
						<span>queue: <span class="text-base-content/80">{selected.queue}</span></span>
						<span class="text-base-content/30">·</span>
						<span>job: <span class="text-base-content/80">{selected.name}</span></span>
						{#if tree}
							<span class="text-base-content/30">·</span>
							<span>
								{1 + totalDescendants(tree)} jobs total
							</span>
						{/if}
					</div>
					<a
						href="/queues/{selected.queue}/jobs/{selected.id}/data"
						class="ml-auto text-[11px] hover:underline text-base-content/70"
					>
						Open root job →
					</a>
				</header>

				<div class="px-6 py-4 flex-1 overflow-auto">
					{#if treeError}
						<div
							class="flex items-center gap-2 px-3 py-2 text-[12px] border rounded"
							style:color="oklch(72% 0.17 20)"
							style:border-color="oklch(0.64 0.2 18 / 0.35)"
							style:background="oklch(0.64 0.2 18 / 0.08)"
						>
							<TriangleAlert size={13} />
							<span>{treeError}</span>
						</div>
					{:else if treeLoading && !tree}
						<div class="text-[12px] text-base-content/50 font-mono-muleta">Loading tree…</div>
					{:else if tree}
						{@render flowNode(tree, 0)}
					{/if}
				</div>

				<!-- Stage 1 placeholder note -->
				<div class="border-t border-base-300 px-6 py-2 text-[11px] text-base-content/40">
					Stage 1: list + tree loaded. Graph view (SvelteFlow) ships next.
				</div>
			{/if}
		</section>
	</div>
</div>

{#snippet flowNode(node: FlowJobNode, depth: number)}
	<div
		class="rounded border border-base-300 px-3 py-2 mb-2 flex items-center gap-3 hover:bg-base-200/50 transition-colors"
		style:margin-left="{depth * 24}px"
	>
		<StateBadge state={node.state} />
		<div class="flex flex-col min-w-0 flex-1">
			<div class="flex items-center gap-2 text-[12px]">
				<span class="font-mono-muleta truncate">{node.name}</span>
				<span class="text-base-content/40 font-mono-muleta text-[11px]">#{node.id}</span>
				<span
					class="text-[10px] px-1.5 py-px rounded font-mono-muleta bg-base-300 text-base-content/70"
				>
					{node.queue}
				</span>
			</div>
			{#if node.failedReason}
				<div class="text-[11px] text-error font-mono-muleta truncate">{node.failedReason}</div>
			{/if}
		</div>
		<a
			href="/queues/{node.queue}/jobs/{node.id}/data"
			class="text-[11px] hover:underline text-base-content/55 shrink-0"
		>
			open →
		</a>
	</div>
	{#each node.children as c (c.id)}
		{@render flowNode(c, depth + 1)}
	{/each}
{/snippet}
