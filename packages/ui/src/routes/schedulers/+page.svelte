<script lang="ts">
	import SchedulerPanel from "$lib/components/SchedulerPanel.svelte"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()
</script>

<div class="px-10 pt-3">
	<SchedulerPanel schedulers={data.schedulers} error={data.error} />
</div>
