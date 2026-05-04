<script lang="ts">
	import { invalidateAll } from "$app/navigation"
	import { api, type JobScheduler } from "$lib/api/client"
	import { explainCron, formatRelative, formatRunDate, nextRunsForCron } from "$lib/cron"
	import { paths } from "$lib/paths"
	import { Clock, Plus, Trash2, TriangleAlert } from "@lucide/svelte"

	interface Props {
		schedulers: JobScheduler[]
		/** Optional queue name to scope all actions to.
		 * This is used in the per-queue schedulers tab where the queue context is implicit,
		 * so we can redirect to the appropriate queue tab without having to check the selected scheduler in the list */
		ovverideQueue?: string
		error: string | null
		/** Show the queue tag in the list rows.
		 * Hide it when the surrounding context already filters to one queue (per-queue tab). */
		showQueueTag?: boolean
	}

	let { schedulers, error, showQueueTag = true, ovverideQueue }: Props = $props()

	let selectedId = $state<string | null>(null)
	let selected = $derived<JobScheduler | null>(
		(selectedId !== null && schedulers.find((s) => s.id === selectedId)) || schedulers[0] || null,
	)
	let newSchedulerHref = $derived.by(() => {
		if (ovverideQueue) return paths.addJob(ovverideQueue)
		if (selected) return paths.addJob(selected.queue, { scheduler: selected.id })
		return undefined
	})

	function strategyOf(s: JobScheduler | null): "pattern" | "every" | null {
		if (!s) return null
		if (s.pattern) return "pattern"
		if (s.every !== undefined) return "every"
		return null
	}

	function isOff(s: JobScheduler): boolean {
		// BullMQ has no explicit "disabled" flag — a scheduler is effectively
		// off when its `endDate` is in the past or its `limit` has been hit.
		const now = Date.now()
		if (s.endDate !== undefined && s.endDate <= now) return true
		if (s.limit !== undefined && s.iterationCount !== undefined && s.iterationCount >= s.limit) {
			return true
		}
		return false
	}

	function patternFields(pattern: string): [string, string, string, string, string] {
		// 5-field cron: minute hour day month weekday. Pad/truncate so the
		// breakdown view is robust against malformed input rather than crashing.
		const parts = pattern.trim().split(/\s+/)
		while (parts.length < 5) parts.push("*")
		return [parts[0]!, parts[1]!, parts[2]!, parts[3]!, parts[4]!]
	}

	function formatEvery(ms: number): string {
		if (ms < 1000) return `${ms}ms`
		if (ms < 60_000) return `every ${Math.round(ms / 1000)}s`
		if (ms < 3_600_000) return `every ${Math.round(ms / 60_000)}m`
		if (ms < 86_400_000) return `every ${Math.round(ms / 3_600_000)}h`
		return `every ${Math.round(ms / 86_400_000)}d`
	}

	function summary(s: JobScheduler): string {
		if (s.pattern) return s.pattern
		if (s.every !== undefined) return formatEvery(s.every)
		return "—"
	}

	const CRON_FIELD_LABELS = ["minute", "hour", "day", "month", "weekday"] as const
	const STRATEGY_TABS = [
		{ id: "pattern", label: "CRON" },
		{ id: "every", label: "EVERY" },
		// RRULE is not natively supported by BullMQ — keep the slot to flag the
		// design intent but the tab is permanently inactive for now.
		{ id: "rrule", label: "RRULE" },
	] as const

	let nextRuns = $derived.by<Date[]>(() => {
		if (!selected) return []
		if (selected.pattern) {
			return nextRunsForCron(selected.pattern, 5, {
				...(selected.tz !== undefined ? { tz: selected.tz } : {}),
				...(selected.next !== null ? { from: new Date(selected.next - 1) } : {}),
			})
		}
		if (selected.every !== undefined && selected.next !== null) {
			const out: Date[] = []
			for (let i = 0; i < 5; i++) out.push(new Date(selected.next + selected.every * i))
			return out
		}
		return []
	})

	let cronExplanation = $derived(selected?.pattern ? explainCron(selected.pattern) : null)

	function everyDigits(ms: number): { value: number; unit: string } {
		if (ms < 1000) return { value: ms, unit: "ms" }
		if (ms < 60_000) return { value: Math.round(ms / 1000), unit: "seconds" }
		if (ms < 3_600_000) return { value: Math.round(ms / 60_000), unit: "minutes" }
		return { value: Math.round(ms / 3_600_000), unit: "hours" }
	}

	let removing = $state(false)
	let removeError = $state<string | null>(null)

	async function removeSelected() {
		if (!selected) return
		const ok = window.confirm(
			`Remove scheduler "${selected.id}" from queue "${selected.queue}"? This stops future fires immediately.`,
		)
		if (!ok) return
		removing = true
		removeError = null
		try {
			const res = await api.api.v1.queues[":name"].schedulers[":id"].$delete({
				param: { name: selected.queue, id: selected.id },
			})
			if (!res.ok) throw new Error(`HTTP ${res.status}`)
			// Drop the local selection so the panel doesn't render a row that's
			// about to disappear from the next load.
			selectedId = null
			await invalidateAll()
		} catch (e) {
			removeError = e instanceof Error ? e.message : "failed to remove scheduler"
		} finally {
			removing = false
		}
	}
</script>

{#if error}
	<div
		class="flex items-center gap-2.5 mx-10 px-4 py-2 mb-4 text-[12px] border rounded"
		style:background="oklch(0.64 0.2 18 / 0.12)"
		style:border-color="oklch(0.64 0.2 18 / 0.35)"
		style:color="oklch(72% 0.17 20)"
	>
		<TriangleAlert size={13} />
		<b class="text-base-content">Couldn't load schedulers.</b>
		<span class="font-mono-muleta text-base-content/60">{error}</span>
	</div>
{/if}

<div class="flex h-full space-x-6">
	<!-- LEFT: list -->
	<aside class="w-[320px] shrink-0 flex flex-col">
		<header class="flex items-center justify-between pb-3">
			<h2 class="text-[14px] font-semibold tracking-tight">Schedulers</h2>
			{#if newSchedulerHref}
				<a type="button" class="btn btn-xs btn-primary gap-1" href={newSchedulerHref}>
					<Plus size={11} /> New
				</a>
			{/if}
		</header>

		{#if schedulers.length === 0}
			<div class="text-[12px] text-base-content/50 px-4 py-12 text-center font-mono-muleta">
				No schedulers registered.
			</div>
		{:else}
			<ul class="flex-1 max-h-fit overflow-auto border border-base-300 rounded-lg">
				{#each schedulers as s (`${s.queue}/${s.id}`)}
					{@const active = (selected?.id ?? null) === s.id && selected?.queue === s.queue}
					{@const off = isOff(s)}
					<li class="border-b border-base-300 last:border-b-0">
						<button
							type="button"
							class="w-full text-left flex flex-col gap-1 px-4 py-3 cursor-pointer transition-colors
								{active ? 'bg-base-200' : 'hover:bg-base-200/50'}"
							onclick={() => (selectedId = s.id)}
						>
							<div class="flex items-center justify-between gap-2">
								<span class="font-mono-muleta text-[13px] truncate flex items-center gap-1.5">
									{s.id}
									{#if off}
										<span
											class="text-[9.5px] uppercase tracking-wide px-1 py-px rounded font-mono-muleta bg-base-300 text-base-content/70"
										>
											off
										</span>
									{/if}
								</span>
								{#if showQueueTag}
									<span
										class="text-[10px] px-1.5 py-px rounded font-mono-muleta bg-base-300 text-base-content/70 shrink-0"
									>
										{s.queue}
									</span>
								{/if}
							</div>
							<div class="flex items-center justify-between text-[11px] text-base-content/55">
								<span class="font-mono-muleta truncate">{summary(s)}</span>
								<span class="font-mono-muleta tnum shrink-0 ml-2">
									{#if s.next !== null}
										next {formatRelative(s.next)}
									{:else}
										—
									{/if}
								</span>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>

	<!-- RIGHT: detail -->
	<section
		class="flex-1 min-w-0 flex flex-col border border-base-300 rounded-lg overflow-hidden max-h-fit"
	>
		{#if selected}
			{@const strategy = strategyOf(selected)}
			{@const fields = selected.pattern ? patternFields(selected.pattern) : null}
			{@const everyDisplay = selected.every !== undefined ? everyDigits(selected.every) : null}
			<header class="flex items-center gap-3 px-6 py-3 border-b border-base-300 flex-wrap">
				<h3 class="font-mono-muleta text-[14px]">{selected.id}</h3>
				<div class="text-[11px] text-base-content/55 font-mono-muleta flex items-center gap-2">
					<span>queue: <span class="text-base-content/80">{selected.queue}</span></span>
					<span class="text-base-content/30">·</span>
					<span>job: <span class="text-base-content/80">{selected.jobName}</span></span>
				</div>
				<button
					type="button"
					class="ml-auto btn btn-xs btn-ghost gap-1 text-error hover:bg-error/10"
					onclick={removeSelected}
					disabled={removing}
					title="Remove this scheduler"
				>
					<Trash2 size={12} />
					{removing ? "Removing…" : "Remove"}
				</button>
			</header>

			{#if removeError}
				<div
					class="mx-6 mt-3 flex items-center gap-2 px-3 py-1.5 text-[12px] border rounded"
					style:background="oklch(0.64 0.2 18 / 0.12)"
					style:border-color="oklch(0.64 0.2 18 / 0.35)"
					style:color="oklch(72% 0.17 20)"
				>
					<TriangleAlert size={12} />
					<span class="font-mono-muleta">{removeError}</span>
				</div>
			{/if}

			<!-- Strategy tabs + tz -->
			<div class="flex items-center gap-2 px-6 pt-4 pb-3 flex-wrap">
				<div class="join border border-base-300 rounded-field overflow-hidden">
					{#each STRATEGY_TABS as t (t.id)}
						{@const active = strategy === t.id}
						{@const inactive = t.id === "rrule" || t.id !== strategy}
						<span
							class="join-item px-3 py-1 text-[11px] uppercase tracking-wide
								{active
								? 'bg-base-300 text-base-content'
								: inactive
									? 'text-base-content/35'
									: 'text-base-content/55'}"
							title={t.id === "rrule"
								? "RRULE not supported by BullMQ"
								: inactive
									? "Different strategy in use"
									: ""}
						>
							{t.label}
						</span>
					{/each}
				</div>
				{#if selected.pattern}
					<span class="ml-auto text-[11px] text-base-content/55 font-mono-muleta">
						tz: <span class="text-base-content/80">{selected.tz ?? "UTC"}</span>
					</span>
				{/if}
			</div>

			<!-- Strategy body -->
			<div class="px-6 pb-4">
				{#if strategy === "pattern" && fields}
					<div class="grid grid-cols-5 gap-2">
						{#each fields as f, i}
							<div
								class="rounded border border-base-300 px-3 py-4 flex flex-col items-center gap-1 bg-base-300"
							>
								<span class="text-[22px] font-mono-muleta tnum">{f}</span>
								<span
									class="text-[9.5px] uppercase tracking-wide text-base-content/55 font-mono-muleta"
								>
									{CRON_FIELD_LABELS[i]}
								</span>
							</div>
						{/each}
					</div>

					{#if cronExplanation}
						<div class="mt-3 flex items-center gap-1.5 text-[12px]">
							<Clock size={11} class="text-base-content/55" />
							{#if cronExplanation.ok}
								<span class="text-base-content/70">
									Matches: <span class="text-base-content">{cronExplanation.text}</span>
									{#if selected.tz}
										<span class="font-mono-muleta">{selected.tz}</span>
									{/if}
								</span>
							{:else}
								<span class="text-error font-mono-muleta">{cronExplanation.error}</span>
							{/if}
						</div>
					{/if}
				{:else if strategy === "every" && everyDisplay && selected.every !== undefined}
					<div
						class="rounded border border-base-300 px-4 py-5 flex items-baseline gap-3 bg-base-300"
					>
						<span class="text-[26px] font-mono-muleta tnum">{everyDisplay.value}</span>
						<span class="text-[11px] uppercase tracking-wide text-base-content/55">
							{everyDisplay.unit} between runs
						</span>
						<span class="ml-auto text-[11px] text-base-content/40 font-mono-muleta tnum">
							= {selected.every.toLocaleString()} ms
						</span>
					</div>
				{:else}
					<div class="text-[12px] text-base-content/50 font-mono-muleta">
						No supported strategy on this scheduler.
					</div>
				{/if}
			</div>

			<!-- Next runs -->
			{#if nextRuns.length > 0}
				<div class="px-6 pb-6">
					<h4 class="text-[13px] font-semibold mb-2">Next 5 runs</h4>
					<ol class="flex flex-col gap-1">
						{#each nextRuns as d, i}
							<li
								class="flex items-center justify-between text-[12px] px-1 py-1.5 border-b border-base-300 last:border-b-0"
							>
								<span class="font-mono-muleta text-base-content/70 tnum">
									<span class="text-base-content/40 mr-2">{i + 1}.</span>
									{formatRunDate(d, selected.tz)}
								</span>
								<span class="text-[11px] text-base-content/45 font-mono-muleta tnum">
									{formatRelative(d.getTime())}
								</span>
							</li>
						{/each}
					</ol>
				</div>
			{/if}
		{:else}
			<div class="flex-1 flex items-center justify-center text-[12px] text-base-content/50">
				Select a scheduler.
			</div>
		{/if}
	</section>
</div>
