<script lang="ts">
	import type { Worker } from "$lib/api/client"
	import { formatUptime, isStale } from "$lib/workers"

	interface Props {
		worker: Worker
		/** Hide the queue tag when the surrounding context already implies the queue. */
		showQueue?: boolean
	}

	let { worker, showQueue = true }: Props = $props()

	let stale = $derived(isStale(worker))
</script>

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
				{worker.name ?? "(anonymous)"}
			</span>
			{#if showQueue}
				<span
					class="text-[10px] px-1.5 py-px rounded font-mono-muleta bg-base-300 text-base-content/70"
				>
					{worker.queue}
				</span>
			{/if}
			{#if stale}
				<span
					class="text-[10px] px-1.5 py-px rounded font-mono-muleta"
					style:background="color-mix(in oklab, var(--color-error) 12%, transparent)"
					style:color="var(--color-error)"
				>
					stale · {Math.floor(worker.idleSeconds)}s
				</span>
			{/if}
		</div>
		<div class="text-[11px] text-base-content/50 mt-0.5 font-mono-muleta flex items-center gap-2">
			<span>{worker.addr}</span>
			{#if worker.id}
				<span class="text-base-content/30">·</span>
				<span>id {worker.id}</span>
			{/if}
		</div>
	</div>

	<div class="flex flex-col items-end shrink-0">
		<span
			class="font-mono-muleta tnum text-[12px] {stale
				? 'text-base-content/35'
				: 'text-base-content/80'}"
		>
			{formatUptime(worker.ageSeconds)}
		</span>
		<span class="text-[10px] text-base-content/40 uppercase tracking-wide mt-0.5">uptime</span>
	</div>
</div>
