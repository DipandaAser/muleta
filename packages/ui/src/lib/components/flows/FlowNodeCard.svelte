<script lang="ts">
	import type { FlowJobNode } from "$lib/api/client"
	import StateBadge from "$lib/components/StateBadge.svelte"
	import { paths } from "$lib/paths"
	import { Handle, Position, type NodeProps } from "@xyflow/svelte"

	type Data = { node: FlowJobNode; queueName: string }
	let { data }: NodeProps & { data: Data } = $props()

	let n = $derived(data.node)

	// BullMQ's `progress` can be any JSON value; we only render a bar
	// when it's a number, and only for active jobs.
	let progressPct = $derived.by<number | null>(() => {
		if (n.state !== "active") return null
		const v = typeof n.progress === "number" ? n.progress : NaN
		if (!Number.isFinite(v)) return null
		return Math.max(0, Math.min(100, Math.round(v)))
	})
</script>

<a
	href={paths.jobData(n.queue, n.id)}
	class="flow-node block rounded border border-base-300 bg-base-100 px-3 py-2 text-left no-underline hover:bg-base-200/40 transition-colors min-w-55 max-w-65"
	title="Open job #{n.id} in a new tab"
>
	<div class="flex items-center justify-between gap-2 mb-1">
		<span
			class="text-[9.5px] uppercase tracking-wide px-1.5 py-px rounded font-mono-muleta bg-base-300 text-base-content/70 truncate"
		>
			{n.queue}
		</span>
		<StateBadge state={n.state} size="sm" />
	</div>

	<div class="flex flex-col gap-px">
		<span class="font-mono-muleta text-[12px] truncate">{n.name}</span>
		<span class="text-[10px] text-base-content/45 font-mono-muleta tnum">#{n.id}</span>
	</div>

	{#if progressPct !== null}
		<div class="mt-2 flex items-center gap-2">
			<div class="flex-1 h-1.5 rounded bg-base-300 overflow-hidden">
				<div
					class="h-full"
					style:width="{progressPct}%"
					style:background="var(--color-state-active, var(--color-info))"
				></div>
			</div>
			<span class="text-[10px] text-base-content/55 font-mono-muleta tnum shrink-0">
				{progressPct}%
			</span>
		</div>
	{/if}

	{#if n.failedReason}
		<div class="mt-1 text-[10.5px] text-error font-mono-muleta truncate">
			{n.failedReason}
		</div>
	{/if}

	<Handle type="target" position={Position.Left} class="opacity-0!" />
	<Handle type="source" position={Position.Right} class="opacity-0!" />
</a>
