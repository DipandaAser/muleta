<script lang="ts">
	import SchedulerPanel from "$lib/components/SchedulerPanel.svelte"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()
</script>

<div class="py-5">
	<SchedulerPanel
		schedulers={data.schedulers}
		error={data.error}
		showQueueTag={false}
		ovverideQueue={data.queue?.name}
	/>
</div>
