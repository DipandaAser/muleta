<script lang="ts">
	import type { Queue } from "$lib/api/client"
	import Code from "$lib/components/code/Code.svelte"
	import { Pause } from "@lucide/svelte"

	interface Props {
		/** Rendered `await queue.add(...)` snippet — already stringified by parent. */
		preview: string
		queue: Queue | null
		queueName: string
		serverError: string | null
	}

	let { preview, queue, queueName, serverError }: Props = $props()
</script>

<aside
	id="preview-column"
	class="lg:w-90 lg:shrink-0 flex flex-col gap-3 pt-5 pr-10 pl-5 pb-24 bg-base-200 overflow-y-auto"
>
	<div
		class="text-[11px] uppercase tracking-wide text-base-content/50 font-medium flex items-center gap-2"
	>
		Preview
		<span class="text-base-content/40 normal-case font-normal tracking-normal">
			what will execute
		</span>
	</div>
	<Code code={preview} lang="ts" />

	<dl class="flex flex-col gap-1.5 text-[12px] mt-2">
		<div class="flex items-baseline gap-3">
			<dt class="text-base-content/50">queue</dt>
			<dd class="font-mono-muleta truncate ml-auto">{queueName}</dd>
		</div>
		<div class="flex items-baseline gap-3">
			<dt class="text-base-content/50">waiting</dt>
			<dd class="font-mono-muleta tnum ml-auto">
				{queue?.counts.waiting?.toLocaleString() ?? "—"}
			</dd>
		</div>
		<div class="flex items-baseline gap-3">
			<dt class="text-base-content/50">paused</dt>
			<dd class="font-mono-muleta ml-auto">{queue?.isPaused ? "yes" : "no"}</dd>
		</div>
	</dl>

	{#if queue?.isPaused}
		<div
			class="flex items-start gap-2 text-[11.5px] p-2.5 rounded border"
			style:background="var(--color-state-paused-bg)"
			style:color="var(--color-state-paused)"
			style:border-color="color-mix(in oklab, var(--color-state-paused) 30%, transparent)"
		>
			<Pause size={12} class="mt-0.5 shrink-0" />
			<span>
				Queue is paused. The job will be enqueued but won't run until the queue is resumed.
			</span>
		</div>
	{/if}

	{#if serverError}
		<div
			class="text-[12px] p-2.5 rounded border"
			style:background="color-mix(in oklab, var(--color-error) 12%, transparent)"
			style:color="var(--color-error)"
			style:border-color="color-mix(in oklab, var(--color-error) 30%, transparent)"
		>
			{serverError}
		</div>
	{/if}
</aside>
