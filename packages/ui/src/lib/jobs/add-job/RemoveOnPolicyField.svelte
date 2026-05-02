<script lang="ts">
	type AgeUnit = "s" | "m" | "h" | "d"

	interface Props {
		/** Field label, also used as the `aria-label` stem (e.g. "removeOnComplete"). */
		label: string
		/** Toggle on/off — when off, the field is omitted from the request entirely. */
		enabled: boolean
		/** Empty `null` = no count cap; positive number = keep last N. */
		count: number | null
		/** Empty `null` = no age cap; positive number (in `ageUnit`) = remove older. */
		age: number | null
		/** Unit for `age`: `s/m/h/d`. Multiplied to seconds at the call site. */
		ageUnit: AgeUnit
	}

	let {
		label,
		enabled = $bindable(),
		count = $bindable(),
		age = $bindable(),
		ageUnit = $bindable(),
	}: Props = $props()
</script>

<div class="flex flex-col gap-1.5">
	<label class="flex items-center gap-2.5 text-[12px] cursor-pointer w-fit">
		<input type="checkbox" bind:checked={enabled} class="toggle toggle-sm toggle-primary" />
		<span>{label}</span>
	</label>
	{#if enabled}
		<div class="ml-9 flex flex-col gap-1.5 text-[11px] text-base-content/55 font-mono-muleta">
			<div class="flex items-center gap-1.5">
				<span class="w-20 shrink-0">keep last</span>
				<input
					type="number"
					min="0"
					bind:value={count}
					placeholder="—"
					aria-label="Number of {label} jobs to keep"
					class="input input-xs font-mono-muleta w-20"
				/>
				<span>jobs</span>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="w-20 shrink-0">older than</span>
				<input
					type="number"
					min="0"
					bind:value={age}
					placeholder="—"
					aria-label="Maximum age of {label} jobs to keep"
					class="input input-xs font-mono-muleta w-20"
				/>
				<div class="join border border-base-300 rounded-field overflow-hidden">
					{#each ["s", "m", "h", "d"] as const as u (u)}
						{@const active = ageUnit === u}
						<button
							type="button"
							aria-label="Age unit: {u}"
							class="join-item px-2 py-0.5 text-[10px] transition-colors {active
								? 'bg-base-300 text-base-content'
								: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
							onclick={() => (ageUnit = u)}
						>
							{u}
						</button>
					{/each}
				</div>
			</div>
			<span class="text-base-content/35 text-[10.5px]">
				both empty → remove every job · either filled → narrows the keep rule
			</span>
		</div>
	{:else}
		<span class="ml-9 text-base-content/40 text-[11px] font-mono-muleta">
			keep all jobs forever
		</span>
	{/if}
</div>
