<script lang="ts">
	import type { Snippet } from "svelte"
	import ConnectionBanner from "./ConnectionBanner.svelte"
	import Sidebar from "./Sidebar.svelte"
	import { theme } from "./theme.svelte"
	import Topbar from "./Topbar.svelte"

	interface Props {
		children: Snippet
	}

	let { children }: Props = $props()

	$effect(() => {
		document.documentElement.setAttribute("data-theme", theme.value)
	})
</script>

<div class="flex h-screen w-screen overflow-hidden">
	<Sidebar />
	<div class="flex flex-col flex-1 min-w-0 overflow-hidden">
		<Topbar />
		<ConnectionBanner />
		<main class="flex-1 overflow-auto relative">
			{@render children()}
		</main>
	</div>
</div>
