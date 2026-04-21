<script lang="ts">
	import { page } from "$app/state"
	import type { JobDetail } from "$lib/api/client"
	import { logLevel } from "$lib/jobs/format"
	import { Copy, ExternalLink } from "@lucide/svelte"

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
			<h2 class="text-[14px] font-semibold m-0">Logs</h2>
			<div class="flex items-center gap-2 text-[11px] text-base-content/50">
				<div class="join font-mono-muleta">
					<button type="button" class="btn btn-xs btn-ghost join-item">All</button>
					<button type="button" class="btn btn-xs btn-ghost join-item" disabled>Info</button>
					<button type="button" class="btn btn-xs btn-ghost join-item" disabled>Warn</button>
					<button type="button" class="btn btn-xs btn-ghost join-item" disabled>Error</button>
				</div>
				<span class="inline-flex items-center gap-1.5 font-mono-muleta text-base-content/50">
					<span
						class="w-1.5 h-1.5 rounded-full"
						style:background="var(--color-base-content)"
						style:opacity="0.4"
					></span>
					streaming via /ws (soon)
				</span>
				<button
					type="button"
					class="btn btn-xs btn-ghost btn-square"
					onclick={() => copy(job?.logs.join("\n") ?? "")}
					aria-label="Copy logs"
				>
					<Copy size={11} />
				</button>
				<button type="button" class="btn btn-xs btn-ghost" disabled>
					<ExternalLink size={11} /> Open in console
				</button>
			</div>
		</div>
		<div class="mt-2 rounded-lg border border-base-300 bg-base-200 max-h-135 overflow-y-auto">
			{#if job.logs.length === 0}
				<p class="px-4 py-3 text-[12px] text-base-content/40 font-mono-muleta">
					no log entries for this job yet.
				</p>
			{:else}
				{#each job.logs as line, i (i)}
					{@const lvl = logLevel(line)}
					<pre
						class="px-4 py-1 text-[11.5px] font-mono-muleta overflow-x-auto text-base-content/80 {lvl ===
						'error'
							? 'text-error'
							: lvl === 'warn'
								? 'text-warning'
								: ''}"><code>{line}</code></pre>
				{/each}
			{/if}
		</div>
	</section>
{/if}
