<script lang="ts">
	import { explainCron, formatRunDate, nextRunsForCron } from "$lib/cron"

	type AgeUnit = "s" | "m" | "h" | "d"
	type RepeatStrategy = "pattern" | "every"

	/** Same units as the age selector but pre-multiplied to milliseconds —
	 * BullMQ's `every` field is ms, not seconds. */
	const EVERY_UNIT_MS: Record<AgeUnit, number> = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
	}

	interface Props {
		enabled: boolean
		strategy: RepeatStrategy
		pattern: string
		every: number | null
		everyUnit: AgeUnit
		limit: number | null
		immediately: boolean
		startDate: string
		endDate: string
		/** Show the "BullMQ ignores Job ID for repeating jobs" hint —
		 * relevant only when the parent's job-id input is non-empty. */
		showJobIdHint?: boolean
	}

	let {
		enabled = $bindable(),
		strategy = $bindable(),
		pattern = $bindable(),
		every = $bindable(),
		everyUnit = $bindable(),
		limit = $bindable(),
		immediately = $bindable(),
		startDate = $bindable(),
		endDate = $bindable(),
		showJobIdHint = false,
	}: Props = $props()

	let cronExplanation = $derived(enabled && strategy === "pattern" ? explainCron(pattern) : null)

	let cronNextRun = $derived.by<Date | null>(() => {
		if (!enabled || strategy !== "pattern") return null
		return nextRunsForCron(pattern, 1)[0] ?? null
	})

	let everyMs = $derived.by<number | null>(() => {
		if (!enabled || strategy !== "every") return null
		if (every === null || !Number.isFinite(every)) return null
		const ms = Math.max(0, Math.floor(every * EVERY_UNIT_MS[everyUnit]))
		return ms > 0 ? ms : null
	})
</script>

<div class="flex flex-col gap-1.5">
	<label class="flex items-center gap-2.5 text-[12px] cursor-pointer w-fit">
		<input type="checkbox" bind:checked={enabled} class="toggle toggle-sm toggle-primary" />
		<span>Repeat</span>
	</label>
	{#if enabled}
		<div class="ml-9 flex flex-col gap-2.5">
			<!--
				BullMQ's two repeat strategies are mutually exclusive — `pattern`
				and `every` can't both be set. The segmented control swaps the
				body underneath while keeping the parent layout stable.
				See https://docs.bullmq.io/guide/job-schedulers/repeat-strategies.
			-->
			<div class="flex items-center gap-2">
				<span class="text-[11px] text-base-content/55 font-mono-muleta">strategy</span>
				<div class="join border border-base-300 rounded-field overflow-hidden">
					{#each [{ id: "pattern" as const, label: "cron pattern" }, { id: "every" as const, label: "every interval" }] as opt (opt.id)}
						{@const active = strategy === opt.id}
						<button
							type="button"
							class="join-item px-2.5 py-0.5 text-[11px] transition-colors {active
								? 'bg-base-300 text-base-content'
								: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
							onclick={() => (strategy = opt.id)}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			{#if strategy === "pattern"}
				<div class="flex flex-col gap-1.5">
					<input
						type="text"
						bind:value={pattern}
						placeholder="0 */15 * * * *"
						aria-label="Cron pattern (5- or 6-field)"
						aria-describedby="cron-explanation"
						class="input input-sm font-mono-muleta max-w-xs"
						class:border-error={cronExplanation?.ok === false}
						spellcheck="false"
					/>
					<!--
						Mirrors crontab.guru's at-a-glance plain-English summary.
						We render the message regardless of validity — green/muted
						when cronstrue parses the pattern, red when it can't —
						so the user never has to click "validate" to know whether
						they got the syntax right.
					-->
					{#if cronExplanation}
						<div
							id="cron-explanation"
							class="text-[12px] flex items-start gap-1.5 max-w-md"
							class:text-base-content={cronExplanation.ok}
							class:text-error={!cronExplanation.ok}
						>
							{#if cronExplanation.ok}
								<span class="text-base-content/40">→</span>
								<span class="italic">"{cronExplanation.text}"</span>
							{:else}
								<span>⚠</span>
								<span class="font-mono-muleta text-[11px]">{cronExplanation.error}</span>
							{/if}
						</div>
					{/if}
					{#if cronNextRun}
						<div class="text-[11px] flex items-center gap-1.5 text-base-content/55">
							<span>next at</span>
							<span class="font-mono-muleta tnum text-base-content/80">
								{formatRunDate(cronNextRun)}
							</span>
						</div>
					{/if}
					<label class="flex items-center gap-2 text-[11px] cursor-pointer w-fit">
						<input
							type="checkbox"
							bind:checked={immediately}
							class="toggle toggle-xs toggle-primary"
						/>
						<span class="text-base-content/55 font-mono-muleta">fire immediately on add</span>
					</label>
				</div>
			{:else}
				<!--
					Fixed-interval strategy — `every` is in milliseconds when
					it lands in BullMQ's RepeatOptions; the unit selector
					just multiplies for convenience.
				-->
				<div class="flex flex-col gap-1.5 text-[11px] text-base-content/55 font-mono-muleta">
					<div class="flex items-center gap-1.5">
						<span class="w-16 shrink-0">every</span>
						<input
							type="number"
							min="1"
							bind:value={every}
							placeholder="—"
							aria-label="Repeat interval"
							class="input input-xs font-mono-muleta w-20"
						/>
						<div class="join border border-base-300 rounded-field overflow-hidden">
							{#each ["s", "m", "h", "d"] as const as u (u)}
								{@const active = everyUnit === u}
								<button
									type="button"
									aria-label="Interval unit: {u}"
									class="join-item px-2 py-0.5 text-[10px] transition-colors {active
										? 'bg-base-300 text-base-content'
										: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
									onclick={() => (everyUnit = u)}
								>
									{u}
								</button>
							{/each}
						</div>
					</div>
					{#if everyMs !== null}
						<span class="text-base-content/40 ml-17">
							= {everyMs.toLocaleString()} ms
						</span>
					{/if}
					<!--
						BullMQ runs `every` jobs immediately on add and only
						waits the interval before subsequent fires
						(job-scheduler.js warns if you set `immediately: true`
						here). That's why this strategy doesn't get a "fire
						immediately" toggle — it's already on by definition.
					-->
					<span class="text-base-content/40 ml-17">
						fires immediately, then waits the interval between subsequent runs
					</span>
				</div>
			{/if}

			<!--
				Common to both strategies — `limit` caps total executions
				and the date pair bounds the schedule. `startDate` /
				`endDate` come from cron-parser via BullMQ's RepeatOptions
				and apply to both `pattern` and `every`.
			-->
			<div class="flex flex-col gap-1.5 text-[11px] text-base-content/55 font-mono-muleta">
				<div class="flex items-center gap-1.5">
					<span class="w-16 shrink-0">max runs</span>
					<input
						type="number"
						min="1"
						bind:value={limit}
						placeholder="∞"
						aria-label="Maximum number of executions"
						class="input input-xs font-mono-muleta w-20"
					/>
					<span class="text-base-content/40">empty = unlimited</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="w-16 shrink-0">start at</span>
					<input
						type="datetime-local"
						bind:value={startDate}
						aria-label="Schedule start date — empty to start now"
						class="input input-xs font-mono-muleta"
					/>
					<span class="text-base-content/40">empty = now</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span class="w-16 shrink-0">end at</span>
					<input
						type="datetime-local"
						bind:value={endDate}
						aria-label="Schedule end date — empty for no end"
						class="input input-xs font-mono-muleta"
					/>
					<span class="text-base-content/40">empty = no end</span>
				</div>
			</div>

			{#if showJobIdHint}
				<span class="text-[11px] text-base-content/50">
					BullMQ ignores Job ID for repeating jobs — it derives a deterministic id from the
					schedule.
				</span>
			{/if}
		</div>
	{/if}
</div>
