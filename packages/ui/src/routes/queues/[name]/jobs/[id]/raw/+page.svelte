<script lang="ts">
	import { page } from "$app/state"
	import type { JobDetail } from "$lib/api/client"
	import Code from "$lib/components/code/Code.svelte"
	import { prettyJson } from "$lib/jobs/format"

	let job = $derived(page.data.job as JobDetail | null)
</script>

{#if job}
	<section class="mt-5">
		<div class="flex items-center justify-between">
			<h2 class="text-[14px] font-semibold m-0">Raw</h2>
		</div>
		<Code code={prettyJson(job)} lang="json" showCopy={true} />
	</section>
{/if}
