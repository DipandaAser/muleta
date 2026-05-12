<script lang="ts">
	import { getHealthContext } from "$lib/api/health.svelte"
	import { CircleQuestionMark } from "@lucide/svelte"
	import HelpPopover from "./HelpPopover.svelte"

	const sub = getHealthContext()
	let helpOpen = $state(false)

	let redis = $derived(sub.status?.redis)
	let host = $derived(redis?.address ?? "connecting…")
	let connected = $derived(redis?.connected ?? false)
	let ping = $derived(redis?.pingMs)

	let streamOffline = $derived(sub.connection !== "open")
	let exhausted = $derived(sub.connection === "closed" || sub.attempt >= sub.maxAttempts)

	let severity = $derived<"ok" | "warning" | "error">(
		exhausted ? "error" : !connected || streamOffline ? "warning" : "ok",
	)

	let statusClass = $derived(
		severity === "ok"
			? "status-success"
			: severity === "warning"
				? "status-warning"
				: "status-error",
	)

	let label = $derived(
		severity === "ok" ? "Redis" : severity === "error" ? "Disconnected" : "Reconnecting",
	)

	let labelClass = $derived(
		severity === "warning" ? "text-warning" : severity === "error" ? "text-error" : "",
	)
</script>

<div class="flex items-center gap-2 px-3 py-2 border-t border-base-300 shrink-0">
	<div class="flex-1 min-w-0 flex flex-col gap-px text-[11px]">
		<div class="flex items-center gap-1.5 text-base-content/60">
			<span class="inline-grid *:[grid-area:1/1]" aria-hidden="true">
				{#if severity === "ok"}
					<span class="status {statusClass} animate-ping"></span>
				{/if}
				<span class="status {statusClass}"></span>
			</span>
			<span class={labelClass}>{label}</span>
			{#if severity === "ok" && ping != null}
				<span class="font-mono-muleta text-base-content/40 tnum">ping {ping}ms</span>
			{:else if severity === "warning"}
				<span class="font-mono-muleta text-base-content/40 tnum">
					attempt {sub.attempt}/{sub.maxAttempts}
				</span>
			{:else if severity === "error"}
				<span class="font-mono-muleta text-base-content/40 tnum">
					{sub.attempt}/{sub.maxAttempts}
				</span>
			{/if}
		</div>
		<div class="font-mono-muleta text-base-content overflow-hidden text-ellipsis whitespace-nowrap">
			{host}
		</div>
	</div>
	<button
		type="button"
		class="btn btn-ghost btn-square btn-xs text-base-content/60"
		aria-label="Help"
		aria-expanded={helpOpen}
		data-help-trigger
		onclick={() => (helpOpen = !helpOpen)}
	>
		<CircleQuestionMark size={14} />
	</button>
</div>

<HelpPopover bind:open={helpOpen} />
