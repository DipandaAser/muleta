<script lang="ts">
	import FlowPanel from "$lib/components/flows/FlowPanel.svelte"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()
</script>

<div class="absolute inset-x-0 top-0 bottom-12 px-10 py-5 box-border overflow-hidden">
	<FlowPanel flows={data.flows} error={data.error} headerLabel="Flows" />
</div>
