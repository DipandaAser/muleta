<script lang="ts">
	import { invalidateAll } from "$app/navigation"
	import { page } from "$app/state"
	import { api, type FlowJobNode, type FlowSummary } from "$lib/api/client"
	import FlowGraph from "$lib/components/flows/FlowGraph.svelte"
	import StateBadge from "$lib/components/StateBadge.svelte"
	import { age } from "$lib/jobs/format"
	import {
		GitFork,
		ListTree,
		Network,
		RefreshCw,
		RotateCcw,
		TriangleAlert,
		Zap,
	} from "@lucide/svelte"
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

	let view = $state<"graph" | "tree">("graph")

	// Fetch the tree whenever the selected flow changes. Cancellation
	// keeps a slow earlier fetch from clobbering a faster newer one when
	// the user clicks rapidly.
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

	/** Walk a tree and collect nodes whose state matches the predicate. */
	function collect(node: FlowJobNode, pred: (n: FlowJobNode) => boolean): FlowJobNode[] {
		const out: FlowJobNode[] = []
		const stack: FlowJobNode[] = [node]
		while (stack.length > 0) {
			const n = stack.pop()!
			if (pred(n)) out.push(n)
			for (const c of n.children) stack.push(c)
		}
		return out
	}

	let counts = $derived.by(() => {
		if (!tree) return { active: 0, completed: 0, waiting: 0, failed: 0, delayed: 0, total: 0 }
		let active = 0,
			completed = 0,
			waiting = 0,
			failed = 0,
			delayed = 0
		const stack: FlowJobNode[] = [tree]
		while (stack.length > 0) {
			const n = stack.pop()!
			if (n.state === "active") active++
			else if (n.state === "completed") completed++
			else if (n.state === "failed") failed++
			else if (n.state === "delayed") delayed++
			else if (n.state === "waiting" || n.state === "waiting-children") waiting++
			for (const c of n.children) stack.push(c)
		}
		return { active, completed, waiting, failed, delayed, total: 1 + totalDescendants(tree) }
	})

	let actionBusy = $state<"retry" | "promote" | null>(null)
	let actionError = $state<string | null>(null)

	/**
	 * Walk the tree, find every job in `states`, and call `endpoint` on
	 * each. Bounded to 5 in flight so a 200-node flow doesn't open 200
	 * sockets at once. Errors per-job are aggregated into `actionError`
	 * — partial success is still useful, so we don't bail on the first
	 * failure.
	 */
	async function bulkAction(
		kind: "retry" | "promote",
		states: FlowJobNode["state"][],
		callOne: (queue: string, id: string) => Promise<Response>,
	) {
		if (!tree) return
		const targets = collect(tree, (n) => states.includes(n.state))
		if (targets.length === 0) return
		actionBusy = kind
		actionError = null
		const failures: string[] = []
		const limit = 5
		let cursor = 0
		const runners = Array.from({ length: Math.min(limit, targets.length) }, async () => {
			while (cursor < targets.length) {
				const t = targets[cursor++]!
				try {
					const res = await callOne(t.queue, t.id)
					if (!res.ok) failures.push(`#${t.id}: HTTP ${res.status}`)
				} catch (e) {
					failures.push(`#${t.id}: ${e instanceof Error ? e.message : "request failed"}`)
				}
			}
		})
		await Promise.all(runners)
		if (failures.length > 0) {
			actionError = `${failures.length}/${targets.length} ${kind}s failed: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""}`
		}
		actionBusy = null
		await invalidateAll()
	}

	async function retryFailed() {
		await bulkAction("retry", ["failed"], (queue, id) =>
			api.api.v1.queues[":name"].jobs[":id"].retry.$post({ param: { name: queue, id } }),
		)
	}

	async function promoteAllDelayed() {
		await bulkAction("promote", ["delayed"], (queue, id) =>
			api.api.v1.queues[":name"].jobs[":id"].promote.$post({ param: { name: queue, id } }),
		)
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

		<!-- RIGHT: detail (graph or tree) -->
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
					</div>

					{#if tree}
						<!-- per-state counts mirror the design's badge strip -->
						<div class="flex items-center gap-2 text-[11px] font-mono-muleta">
							{#if counts.active > 0}
								<span class="text-info"
									>● <span class="text-base-content/80">{counts.active}</span> active</span
								>
							{/if}
							{#if counts.completed > 0}
								<span class="text-success"
									>● <span class="text-base-content/80">{counts.completed}</span> completed</span
								>
							{/if}
							{#if counts.waiting > 0}
								<span class="text-base-content/70"
									>● <span class="text-base-content/80">{counts.waiting}</span> waiting</span
								>
							{/if}
							{#if counts.delayed > 0}
								<span class="text-warning"
									>● <span class="text-base-content/80">{counts.delayed}</span> delayed</span
								>
							{/if}
							{#if counts.failed > 0}
								<span class="text-error"
									>● <span class="text-base-content/80">{counts.failed}</span> failed</span
								>
							{/if}
						</div>
					{/if}

					<div class="ml-auto flex items-center gap-2">
						<button
							type="button"
							class="btn btn-xs btn-ghost gap-1"
							onclick={retryFailed}
							disabled={actionBusy !== null || counts.failed === 0}
							title={counts.failed === 0
								? "No failed jobs to retry"
								: `Retry ${counts.failed} failed`}
						>
							{#if actionBusy === "retry"}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<RotateCcw size={11} />
							{/if}
							Retry failed
						</button>
						<button
							type="button"
							class="btn btn-xs btn-ghost gap-1"
							onclick={promoteAllDelayed}
							disabled={actionBusy !== null || counts.delayed === 0}
							title={counts.delayed === 0
								? "No delayed jobs to promote"
								: `Promote ${counts.delayed} delayed`}
						>
							{#if actionBusy === "promote"}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<Zap size={11} />
							{/if}
							Promote all delayed
						</button>
						<!-- view toggle -->
						<div class="join border border-base-300 rounded-field overflow-hidden">
							<button
								type="button"
								class="join-item px-2 py-1 text-[10.5px] uppercase tracking-wide flex items-center gap-1
									{view === 'graph' ? 'bg-base-300 text-base-content' : 'text-base-content/55 hover:bg-base-200'}"
								onclick={() => (view = "graph")}
								aria-pressed={view === "graph"}
							>
								<Network size={10} /> Graph
							</button>
							<button
								type="button"
								class="join-item px-2 py-1 text-[10.5px] uppercase tracking-wide flex items-center gap-1
									{view === 'tree' ? 'bg-base-300 text-base-content' : 'text-base-content/55 hover:bg-base-200'}"
								onclick={() => (view = "tree")}
								aria-pressed={view === "tree"}
							>
								<ListTree size={10} /> Tree
							</button>
						</div>
					</div>
				</header>

				{#if actionError}
					<div
						class="mx-6 mt-3 flex items-center gap-2 px-3 py-1.5 text-[12px] border rounded"
						style:color="oklch(72% 0.17 20)"
						style:border-color="oklch(0.64 0.2 18 / 0.35)"
						style:background="oklch(0.64 0.2 18 / 0.08)"
					>
						<TriangleAlert size={12} />
						<span class="font-mono-muleta">{actionError}</span>
					</div>
				{/if}

				<div class="flex-1 min-h-0 overflow-hidden">
					{#if treeError}
						<div
							class="mx-6 my-4 flex items-center gap-2 px-3 py-2 text-[12px] border rounded"
							style:color="oklch(72% 0.17 20)"
							style:border-color="oklch(0.64 0.2 18 / 0.35)"
							style:background="oklch(0.64 0.2 18 / 0.08)"
						>
							<TriangleAlert size={13} />
							<span>{treeError}</span>
						</div>
					{:else if treeLoading && !tree}
						<div class="px-6 py-4 text-[12px] text-base-content/50 font-mono-muleta">
							Loading tree…
						</div>
					{:else if tree}
						{#if view === "graph"}
							{#key tree.id}
								<FlowGraph root={tree} {queueName} />
							{/key}
						{:else}
							<div class="px-6 py-4 h-full overflow-auto">
								{@render treeNode(tree, 0)}
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>

{#snippet treeNode(node: FlowJobNode, depth: number)}
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
		{@render treeNode(c, depth + 1)}
	{/each}
{/snippet}
