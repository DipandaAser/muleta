<script lang="ts">
	type DelayUnit = "ms" | "s" | "m"
	type BackoffType = "fixed" | "exponential"

	interface Props {
		priority: number
		attempts: number
		delay: number
		delayUnit: DelayUnit
		backoffType: BackoffType
		backoffDelay: number
	}

	let {
		priority = $bindable(),
		attempts = $bindable(),
		delay = $bindable(),
		delayUnit = $bindable(),
		backoffType = $bindable(),
		backoffDelay = $bindable(),
	}: Props = $props()
</script>

<div class="flex flex-col gap-3">
	<div class="text-[11px] uppercase tracking-wide text-base-content/50 font-medium">Options</div>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col sm:flex-row gap-4">
			<div class="flex-1 min-w-0 flex flex-col gap-1.5">
				<label for="opt-priority" class="text-[12px] text-base-content/70">
					Priority <span class="text-base-content/40 text-[11px]">0 = default</span>
				</label>
				<input
					id="opt-priority"
					type="number"
					min="0"
					bind:value={priority}
					class="input input-sm font-mono-muleta w-full"
				/>
			</div>
			<div class="flex-1 min-w-0 flex flex-col gap-1.5">
				<label for="opt-attempts" class="text-[12px] text-base-content/70">Attempts</label>
				<input
					id="opt-attempts"
					type="number"
					min="1"
					max="50"
					bind:value={attempts}
					class="input input-sm font-mono-muleta w-full"
				/>
			</div>
		</div>
		<div class="flex flex-col sm:flex-row gap-4">
			<div class="flex-1 min-w-0 flex flex-col gap-1.5">
				<label for="opt-delay" class="text-[12px] text-base-content/70">Delay</label>
				<div class="flex items-center gap-2">
					<input
						id="opt-delay"
						type="number"
						min="0"
						bind:value={delay}
						class="input input-sm font-mono-muleta flex-1 min-w-0"
					/>
					<div class="join shrink-0 border border-base-300 rounded-field overflow-hidden">
						{#each ["ms", "s", "m"] as const as u (u)}
							{@const active = delayUnit === u}
							<button
								type="button"
								class="join-item px-2.5 py-1 text-[11px] font-mono-muleta transition-colors {active
									? 'bg-base-300 text-base-content'
									: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
								onclick={() => (delayUnit = u)}
							>
								{u}
							</button>
						{/each}
					</div>
				</div>
			</div>
			<div class="flex-1 min-w-0 flex flex-col gap-1.5">
				<label for="opt-backoff" class="text-[12px] text-base-content/70">Backoff</label>
				<div class="flex items-center gap-2">
					<div class="join shrink-0 border border-base-300 rounded-field overflow-hidden">
						{#each ["fixed", "exponential"] as const as t (t)}
							{@const active = backoffType === t}
							<button
								type="button"
								class="join-item px-2.5 py-1 text-[11px] font-mono-muleta transition-colors {active
									? 'bg-base-300 text-base-content'
									: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
								onclick={() => (backoffType = t)}
							>
								{t}
							</button>
						{/each}
					</div>
					<input
						id="opt-backoff"
						type="number"
						min="0"
						bind:value={backoffDelay}
						class="input input-sm font-mono-muleta w-20"
					/>
					<span class="text-[11px] text-base-content/50 font-mono-muleta">ms</span>
				</div>
			</div>
		</div>
	</div>
</div>
