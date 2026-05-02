<script lang="ts">
	import { page } from "$app/state"
	import type { JobDetail } from "$lib/api/client"
	import Code from "$lib/components/code/Code.svelte"
	import { byteSize, highlightJson, prettyJson } from "$lib/jobs/format"

	let job = $derived(page.data.job as JobDetail | null)
</script>

{#if job}
	<section class="mt-5">
		<div class="flex items-center justify-between">
			<h2 class="text-[14px] font-semibold m-0">Job data</h2>
			<div class="flex items-center gap-2 text-[11px] text-base-content/50 font-mono-muleta">
				<span>Size: {byteSize(job.data)}</span>
			</div>
		</div>
		<Code code={prettyJson(job.data)} lang="json" />

		<h2 class="mt-6 text-[14px] font-semibold m-0 flex items-center justify-between">
			Return value
			{#if job.state !== "completed"}
				<span class="text-[11px] text-base-content/40 font-mono-muleta font-normal">
					n/a — job not yet completed
				</span>
			{:else}
				<span class="text-[11px] text-base-content/50 font-mono-muleta font-normal">
					{byteSize(job.returnvalue)}
				</span>
			{/if}
		</h2>
		{#if job.state === "completed"}
			<Code code={prettyJson(job.returnvalue)} lang="json" showCopy={true} />
		{:else}
			<div
				class="mt-2 rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-[12px] text-base-content/40 font-mono-muleta"
			>
				Return value will appear here when this job completes.
			</div>
		{/if}

		{#if job.state === "failed" && job.failedReason}
			<h2 class="mt-6 text-[14px] font-semibold m-0 text-error">Failed reason</h2>
			<pre
				class="mt-2 rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-[12px] font-mono-muleta whitespace-pre-wrap text-error"><code
					>{job.failedReason}</code
				></pre>
		{/if}

		{#if job.stacktrace.length > 0}
			<h2 class="mt-6 text-[14px] font-semibold m-0">Stacktrace</h2>
			<div class="mt-2 rounded-lg border border-base-300 bg-base-200 divide-y divide-base-300">
				{#each job.stacktrace as frame, i (i)}
					<pre
						class="px-4 py-2 text-[11.5px] font-mono-muleta overflow-x-auto text-base-content/80"><code
							>{frame}</code
						></pre>
				{/each}
			</div>
		{/if}
	</section>
{/if}
