<script lang="ts">
	import "../app.css"
	import Shell from "$lib/shell/Shell.svelte"
	import Favicon from "$lib/assets/favicon.svg"
	import { createHealthSubscription, setHealthContext } from "$lib/api/health.svelte"
	import { onDestroy } from "svelte"

	let { children } = $props()

	const health = createHealthSubscription()
	setHealthContext(health)
	onDestroy(() => health.close())
</script>

<svelte:head>
	<title>Muleta - A Redis Queue Manager</title>
	<link rel="icon" type="image/svg+xml" href={Favicon} />
</svelte:head>

<Shell>
	{@render children()}
</Shell>
