<script lang="ts">
	import { page } from "$app/state"
	import { Bell, Moon, Search, Sun } from "@lucide/svelte"
	import { buildCrumbs } from "./crumb-registry"
	import { theme } from "./theme.svelte"

	/**
	 * Crumbs come from the build-time registry: each `+layout.ts` /
	 * `+page.ts` exports a `_crumb` function, the registry walks the
	 * current route ID prefix-by-prefix and asks each registered fn for
	 * its crumb. Sync, no async, no segment-string heuristics.
	 *
	 * See `./crumb-registry.ts` for the discovery + walk logic.
	 */
	let crumbs = $derived(buildCrumbs(page.route.id, page.params, page.data))
</script>

<header
	id="top-bar"
	class="flex h-12 items-center gap-3 px-5 border-b border-base-300 bg-base-100 shrink-0"
>
	<div class="breadcrumbs text-sm min-w-0">
		<ul>
			{#each crumbs as c, i (c.href)}
				{@const isLast = i === crumbs.length - 1}
				<li>
					{#if isLast}
						<span class="inline-flex gap-2 items-center">
							{#if c.icon}
								{@const Ico = c.icon}
								<Ico size={14} class="text-base-content/60 {c.iconClass ?? ''}" />
							{/if}
							{c.label}
						</span>
					{:else}
						<a href={c.href} class="inline-flex gap-2 items-center">
							{#if c.icon}
								{@const Ico = c.icon}
								<Ico size={14} class="text-base-content/60 {c.iconClass ?? ''}" />
							{/if}
							{c.label}
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<!-- search (placeholder only) -->
	<div
		class="ml-auto flex items-center gap-2 w-72 h-7 px-3 rounded-md bg-base-200 border border-base-300 text-base-content/50"
	>
		<Search size={12} />
		<input
			type="text"
			placeholder="Jump to queue, job #id, worker…"
			class="flex-1 bg-transparent border-0 outline-0 text-xs text-base-content"
			disabled
		/>
		<kbd
			class="font-mono-muleta text-[10px] px-1 py-px rounded bg-base-300 text-base-content/60 border border-base-300"
		>
			⌘K
		</kbd>
	</div>

	<!-- actions -->
	<div class="flex items-center gap-1">
		<button
			type="button"
			class="btn btn-ghost btn-square btn-sm text-base-content/70"
			aria-label="Toggle theme"
			onclick={() => theme.toggle()}
		>
			{#if theme.value === "muleta-dark"}
				<Sun size={14} />
			{:else}
				<Moon size={14} />
			{/if}
		</button>
		<button
			type="button"
			class="btn btn-ghost btn-square btn-sm text-base-content/70"
			aria-label="Notifications"
		>
			<Bell size={14} />
		</button>
	</div>
</header>
