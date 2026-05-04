<script lang="ts">
	import { page } from "$app/state"
	import FlowPanel from "$lib/components/flows/FlowPanel.svelte"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()
	let queueName = $derived(page.params.name as string)
</script>

<!-- 180px ≈ shell topbar + queue header + tabs above this route. -->
<div class="py-5 h-[calc(100vh-180px)]">
	<FlowPanel
		flows={data.flows}
		error={data.error}
		headerLabel="Flows on {queueName}"
		showQueueTag={false}
	/>
</div>
