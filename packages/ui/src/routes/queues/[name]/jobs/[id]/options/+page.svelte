<script lang="ts">
	import { page } from "$app/state"
	import type { JobDetail } from "$lib/api/client"
	import { highlightJson, prettyJson, summarizeBackoff, summarizeRemoveOn } from "$lib/jobs/format"
	import { Copy } from "@lucide/svelte"

	let job = $derived(page.data.job as JobDetail | null)

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text)
		} catch {
			// clipboard perms vary by browser; swallow silently
		}
	}
</script>

{#if job}
	<section class="mt-5">
		<div class="flex items-center justify-between">
			<h2 class="text-[14px] font-semibold m-0">Options</h2>
			<div class="flex items-center gap-2 text-[11px] text-base-content/50">
				<button
					type="button"
					class="btn btn-xs btn-ghost"
					onclick={() => copy(prettyJson(job?.opts ?? {}))}
				>
					<Copy size={11} /> Copy
				</button>
				<button type="button" class="btn btn-xs btn-ghost" disabled>Edit</button>
			</div>
		</div>
		<pre
			class="mt-2 rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-[12px] font-mono-muleta overflow-x-auto"><code
				>{@html highlightJson(job.opts)}</code
			></pre>

		<h2 class="mt-6 text-[14px] font-semibold m-0">Effective behavior</h2>
		<dl
			class="mt-2 text-[12.5px] divide-y divide-base-300 rounded-lg border border-base-300 bg-base-200"
		>
			<div class="px-4 py-2 grid grid-cols-[10rem_1fr] gap-4">
				<dt class="text-base-content/60">attempts</dt>
				<dd class="font-mono-muleta tnum">{job.attemptsMade} used of {job.attempts}</dd>
			</div>
			<div class="px-4 py-2 grid grid-cols-[10rem_1fr] gap-4">
				<dt class="text-base-content/60">backoff</dt>
				<dd class="font-mono-muleta">{summarizeBackoff(job.opts)}</dd>
			</div>
			<div class="px-4 py-2 grid grid-cols-[10rem_1fr] gap-4">
				<dt class="text-base-content/60">priority</dt>
				<dd class="font-mono-muleta tnum">
					{job.priority}
					<span class="text-base-content/40">(lower is higher)</span>
				</dd>
			</div>
			<div class="px-4 py-2 grid grid-cols-[10rem_1fr] gap-4">
				<dt class="text-base-content/60">delay</dt>
				<dd class="font-mono-muleta tnum">{job.delay}ms</dd>
			</div>
			<div class="px-4 py-2 grid grid-cols-[10rem_1fr] gap-4">
				<dt class="text-base-content/60">removeOn</dt>
				<dd class="font-mono-muleta">{summarizeRemoveOn(job.opts)}</dd>
			</div>
		</dl>
	</section>
{/if}
