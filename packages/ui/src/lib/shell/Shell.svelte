<script lang="ts">
	import type { Snippet } from "svelte"
	import Sidebar from "./Sidebar.svelte"
	import Topbar from "./Topbar.svelte"
	import { theme } from "./theme.svelte"

	interface Props {
		children: Snippet
	}

	let { children }: Props = $props()

	// Apply the persisted theme on mount (attribute is set by the store's setter;
	// this $effect re-applies on client after hydration).
	$effect(() => {
		document.documentElement.setAttribute("data-theme", theme.value)
	})
</script>

<div class="flex h-screen w-screen overflow-hidden">
	<Sidebar />
	<div class="flex flex-col flex-1 min-w-0 overflow-hidden">
		<Topbar />
		<main class="flex-1 overflow-auto relative">
			{@render children()}
		</main>
	</div>
</div>
