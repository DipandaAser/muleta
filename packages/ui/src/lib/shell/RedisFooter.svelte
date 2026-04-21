<script lang="ts">
	import { CircleQuestionMark } from "@lucide/svelte"

	// v0: hardcoded. Wired up when we expose Redis status through /api/v1/health.
	const REDIS_HOST = "prod-redis.internal:6379"
	const CONNECTED = true
</script>

<div class="flex items-center gap-2 px-3 py-2 border-t border-base-300 shrink-0">
	<div class="flex-1 min-w-0 flex flex-col gap-px text-[11px]">
		<div class="flex items-center gap-1.5 text-base-content/60">
			<span
				class="w-1.5 h-1.5 rounded-full {CONNECTED ? 'bg-success' : 'bg-error'}"
				style={CONNECTED
					? "box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-success) 20%, transparent);"
					: ""}
			></span>
			<span>Redis</span>
		</div>
		<div class="font-mono-muleta text-base-content overflow-hidden text-ellipsis whitespace-nowrap">
			{REDIS_HOST}
		</div>
	</div>
	<button
		type="button"
		class="btn btn-ghost btn-square btn-xs text-base-content/60"
		aria-label="Help"
	>
		<CircleQuestionMark size={14} />
	</button>
</div>
