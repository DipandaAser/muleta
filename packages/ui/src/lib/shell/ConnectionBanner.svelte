<script lang="ts">
	import { getHealthContext } from "$lib/api/health.svelte"
	import { RotateCw, X } from "@lucide/svelte"
	import { onDestroy } from "svelte"

	const sub = getHealthContext()

	// Ticks "Xs ago" forward between SSE frames.
	let now = $state(Date.now())
	const tick = setInterval(() => {
		now = Date.now()
	}, 1000)
	onDestroy(() => clearInterval(tick))

	let streamOffline = $derived(sub.connection !== "open")
	let redisOffline = $derived(sub.status != null && !sub.status.redis.connected)
	let exhausted = $derived(sub.connection === "closed" || sub.attempt >= sub.maxAttempts)

	// Suppress on first paint so the banner doesn't flash during initial handshake.
	let show = $derived(exhausted || (sub.lastFrameAt != null && (streamOffline || redisOffline)))

	let agoSec = $derived(
		sub.lastFrameAt != null ? Math.max(0, Math.floor((now - sub.lastFrameAt) / 1000)) : null,
	)
	let address = $derived(sub.status?.redis.address ?? null)
</script>

{#if show}
	{#if exhausted}
		<div class="connection-banner connection-banner--error" role="alert" aria-live="assertive">
			<X size={14} class="shrink-0" aria-hidden="true" />
			<span class="font-medium">Can't reach Redis.</span>
			{#if address}
				<span class="font-mono-muleta opacity-80">{address}</span>
			{/if}
			<span class="font-mono-muleta text-[11px] opacity-70 tnum">
				· {sub.attempt}/{sub.maxAttempts}
			</span>
			<button
				type="button"
				onclick={() => sub.reconnect()}
				class="ml-auto btn btn-xs btn-outline border-error/50 text-error hover:bg-error hover:text-error-content hover:border-error"
			>
				<RotateCw size={12} aria-hidden="true" />
				Retry
			</button>
		</div>
	{:else}
		<div class="connection-banner connection-banner--warning" role="status" aria-live="polite">
			<span class="inline-grid *:[grid-area:1/1] shrink-0" aria-hidden="true">
				<span class="status status-warning animate-ping"></span>
				<span class="status status-warning"></span>
			</span>
			<span class="font-medium">Reconnecting to Redis.</span>
			{#if agoSec != null}
				<span class="opacity-80">
					Showing last-known values from {agoSec}s ago.
				</span>
			{/if}
			{#if sub.attempt > 0}
				<span class="ml-auto font-mono-muleta text-[11px] opacity-70 tnum">
					attempt {sub.attempt}/{sub.maxAttempts}
				</span>
			{/if}
		</div>
	{/if}
{/if}

<style>
	.connection-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 1rem;
		font-size: 12px;
		border-bottom: 1px solid;
		flex-shrink: 0;
	}
	.connection-banner--warning {
		background: color-mix(in oklab, var(--color-warning) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-warning) 30%, transparent);
		color: var(--color-warning);
	}
	.connection-banner--error {
		background: color-mix(in oklab, var(--color-error) 12%, transparent);
		border-color: color-mix(in oklab, var(--color-error) 30%, transparent);
		color: var(--color-error);
	}
</style>
