<script lang="ts">
	import type { JobDetail } from "$lib/api/client"
	import { formatTime, lifecycleSteps, stepDotColor } from "$lib/jobs/format"

	interface Props {
		job: JobDetail
		/**
		 * When true, render each row with a `timeline-start` cell containing the
		 * event's timestamp (e.g. "14:02:32.842"). When false (sidebar usage),
		 * timestamps are omitted and only the label + meta appear on the end side.
		 */
		showDateTime?: boolean
	}

	let { job, showDateTime = false }: Props = $props()

	function timestampFor(label: string): number | undefined {
		if (label === "added") return job.addedAt
		if (label === "picked up") return job.processedAt
		if (label === "completed" || label === "failed") return job.finishedAt
		return undefined
	}
</script>

<ul class="timeline timeline-vertical timeline-snap-icon {showDateTime ? '' : 'timeline-compact'}">
	{#each lifecycleSteps(job) as step, i (i)}
		{@const isFirst = i === 0}
		{@const isLast = i === lifecycleSteps(job).length - 1}
		{@const ts = timestampFor(step.label)}
		<li>
			{#if !isFirst}
				<hr />
			{/if}

			{#if showDateTime}
				<div
					class="timeline-start text-[11.5px] text-base-content/50 font-mono-muleta tnum self-center"
				>
					{ts !== undefined ? formatTime(ts) : ""}
				</div>
			{/if}

			<div class="timeline-middle">
				<span class="block w-2 h-2 rounded-full" style:background={stepDotColor(step, job.state)}
				></span>
			</div>

			<div class="timeline-end pb-2">
				<div class="leading-tight">{step.label}</div>
				{#if step.meta}
					<div class="text-[11px] text-base-content/50 font-mono-muleta mt-0.5">
						{step.meta}
					</div>
				{/if}
			</div>

			{#if !isLast}
				<hr />
			{/if}
		</li>
	{/each}
</ul>
