<script lang="ts">
	import { page } from "$app/state"
	import type { JobDetail } from "$lib/api/client"
	import { highlightJson, prettyJson } from "$lib/jobs/format"
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
			<h2 class="text-[14px] font-semibold m-0">Raw</h2>
			<button type="button" class="btn btn-xs btn-ghost" onclick={() => copy(prettyJson(job))}>
				<Copy size={11} /> Copy
			</button>
		</div>
		<pre
			class="mt-2 rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-[11.5px] font-mono-muleta overflow-x-auto"><code
				>{@html highlightJson(job)}</code
			></pre>
	</section>
{/if}
