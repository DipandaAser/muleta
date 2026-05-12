<script lang="ts">
	import { page } from "$app/state"
	import BrandIntro from "./BrandIntro.svelte"
	import { NAV } from "./nav"
	import RedisFooter from "./RedisFooter.svelte"

	function isActive(href: string | undefined): boolean {
		if (!href) return false
		if (href === "/") return page.url.pathname === "/"
		return page.url.pathname.startsWith(href)
	}
</script>

<aside
	class="flex h-screen w-58 flex-col overflow-hidden border-r"
	style:background="var(--color-sidebar-bg)"
	style:border-color="var(--color-sidebar-border)"
>
	<!-- brand -->
	<div class="flex h-12 items-center px-3 border-b border-base-300 shrink-0">
		<BrandIntro />
		<!-- Built at vite-config time from @muleta-dev/server's package.json + git. -->
		<span
			class="ml-auto font-mono-muleta text-[10px] px-1.5 py-0.5 rounded bg-base-300 text-base-content/55"
			title="muleta version"
		>
			{__MULETA_VERSION__}
		</span>
	</div>

	<!-- nav -->
	<div class="flex-1 overflow-y-auto py-3">
		{#each NAV as section (section.title)}
			<div class="px-3 mb-5">
				<div
					class="px-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/40"
				>
					{section.title}
				</div>
				{#each section.items as item (item.id)}
					{@const active = isActive(item.href)}
					{@const Ico = item.icon}
					{#if item.href}
						<a
							href={item.href}
							class="flex h-7 items-center gap-2.5 px-1.5 rounded-md text-[13px] relative
                {active
								? 'bg-base-300 text-base-content font-medium'
								: 'text-base-content/75 hover:bg-base-300/60 hover:text-base-content'}"
						>
							{#if active}
								<span class="absolute -left-1.5 top-1.5 bottom-1.5 w-0.5 rounded bg-primary"></span>
							{/if}
							<Ico
								size={14}
								class="{active ? 'text-primary' : 'text-base-content/50'} {item.iconClass ?? ''}"
							/>
							<span>{item.label}</span>
							{#if item.count}
								<span class="ml-auto font-mono-muleta text-[11px] text-base-content/50 tnum">
									{item.count}
								</span>
							{/if}
						</a>
					{:else}
						<div
							class="flex h-7 items-center gap-2.5 px-1.5 rounded-md text-[13px] text-base-content/40 cursor-not-allowed"
							title="Coming soon"
						>
							<Ico size={14} class="text-base-content/30 {item.iconClass ?? ''}" />
							<span>{item.label}</span>
						</div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>

	<RedisFooter />
</aside>
