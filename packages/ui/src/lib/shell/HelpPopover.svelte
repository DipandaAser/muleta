<script lang="ts">
	import { getHealthContext } from "$lib/api/health.svelte"
	import { BookOpen, Bug, Code, ExternalLink, Sparkles, X } from "@lucide/svelte"
	import type { Component } from "svelte"

	// Controlled via parent (the trigger button lives in RedisFooter and
	// is marked with `data-help-trigger` so the outside-click handler
	// below ignores it otherwise the document listener would close on
	// the same click the toggle is opening with).
	let { open = $bindable(false) }: { open?: boolean } = $props()

	const sub = getHealthContext()
	let redisVersion = $derived(sub.status?.redis.info?.version ?? null)

	let dialog = $state<HTMLDivElement | null>(null)

	function close() {
		open = false
	}

	$effect(() => {
		if (!open) return
		function onDoc(e: MouseEvent) {
			if (!(e.target instanceof Element)) return
			if (dialog?.contains(e.target)) return
			if (e.target.closest("[data-help-trigger]")) return
			close()
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") close()
		}
		document.addEventListener("mousedown", onDoc)
		document.addEventListener("keydown", onKey)
		return () => {
			document.removeEventListener("mousedown", onDoc)
			document.removeEventListener("keydown", onKey)
		}
	})

	interface ResourceLink {
		label: string
		href: string
		icon: Component
	}

	const RESOURCES: ResourceLink[] = [
		{ label: "Documentation", href: "https://muleta.dev", icon: BookOpen },
		{ label: "GitHub repository", href: "https://github.com/DipandaAser/muleta", icon: Code },
		{
			label: "Report an issue",
			href: "https://github.com/DipandaAser/muleta/issues/new",
			icon: Bug,
		},
		{
			label: "What's new",
			href: "https://github.com/DipandaAser/muleta/releases",
			icon: Sparkles,
		},
	]
</script>

{#if open}
	<div
		bind:this={dialog}
		role="dialog"
		aria-modal="false"
		aria-labelledby="help-popover-title"
		class="fixed bottom-12 left-3 z-40 w-80 rounded-lg border border-base-300 bg-base-100 shadow-xl"
	>
		<header class="flex items-center justify-between px-4 py-3 border-b border-base-300">
			<h3 id="help-popover-title" class="text-[13px] font-semibold">Help</h3>
			<button
				type="button"
				class="text-base-content/55 hover:text-base-content"
				onclick={close}
				aria-label="Close help"
			>
				<X size={14} />
			</button>
		</header>

		<section class="px-3 pt-3 pb-2">
			<div
				class="px-1.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-base-content/40"
			>
				Resources
			</div>
			<ul class="flex flex-col">
				{#each RESOURCES as r (r.href)}
					{@const Ico = r.icon}
					<li>
						<a
							href={r.href}
							target="_blank"
							rel="noopener noreferrer"
							class="flex h-8 items-center gap-2.5 px-1.5 rounded-md text-[13px] text-base-content/75 hover:bg-base-300/60 hover:text-base-content"
						>
							<Ico size={14} class="text-base-content/50" />
							<span>{r.label}</span>
							<ExternalLink size={12} class="ml-auto text-base-content/35" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		</section>

		<footer class="px-4 py-3 border-t border-base-300 flex flex-col gap-1 text-[11px]">
			<div class="flex items-center justify-between">
				<span class="text-base-content/55">muleta</span>
				<span class="font-mono-muleta tnum text-base-content/80">
					{__MULETA_VERSION__}
				</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/55">redis</span>
				<span class="font-mono-muleta tnum text-base-content/80">
					{redisVersion ? `v${redisVersion}` : "—"}
				</span>
			</div>
		</footer>
	</div>
{/if}
