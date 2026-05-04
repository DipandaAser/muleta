<script lang="ts">
	import { page } from "$app/state"
	import type { Queue } from "$lib/api/client"
	import { age } from "$lib/jobs/format"
	import { paths } from "$lib/paths"
	import { ChartBar, ChevronRight, TriangleAlert } from "@lucide/svelte"
	import type { PageProps } from "./$types"

	let { data }: PageProps = $props()
	let queue = $derived(page.data.queue as Queue | null)
	let name = $derived(page.params.name as string)

	const JOB_STATES = [
		"waiting",
		"active",
		"completed",
		"failed",
		"delayed",
		"paused",
		"prioritized",
	] as const

	type State = (typeof JOB_STATES)[number]

	const STATE_COLOR: Record<State, string> = {
		waiting: "var(--color-state-waiting)",
		active: "var(--color-info)",
		completed: "var(--color-success)",
		failed: "var(--color-error)",
		delayed: "var(--color-warning)",
		paused: "var(--color-state-paused)",
		prioritized: "var(--color-state-prioritized)",
	}

	function numStr(n: number): string {
		return n.toLocaleString()
	}

	function truncate(s: string | undefined, n: number): string {
		if (!s) return ""
		if (s.length <= n) return s
		return `${s.slice(0, n - 1)}…`
	}
</script>

<div class="mt-8 pb-10">
	<!-- counts strip: 2 cols (default) → 3 cols (md) → 7 cols (lg, one line) -->
	<div
		class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-px bg-base-300 border border-base-300 rounded-lg overflow-hidden"
	>
		{#each JOB_STATES as s (s)}
			<div class="bg-base-200 p-4 flex flex-col gap-1.5">
				<div class="flex items-center gap-1.5 text-[11px] text-base-content/60 tracking-wide">
					<span class="w-1.5 h-1.5 rounded-full" style:background={STATE_COLOR[s]}></span>
					{s}
				</div>
				<div class="font-mono-muleta tnum text-[22px] font-medium leading-none">
					{numStr(queue?.counts[s] ?? 0)}
				</div>
				<div class="font-mono-muleta text-[10.5px] text-base-content/50 tnum">—</div>
			</div>
		{/each}
	</div>

	<!-- recent activity: failed + active side by side -->
	<div class="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Recently failed -->
		<section class="bg-base-200 border border-base-300 rounded-lg overflow-hidden">
			<div
				class="flex items-center justify-between px-5 h-10 border-b border-base-300 text-[11px] uppercase tracking-wider text-base-content/60"
			>
				<span class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full" style:background={STATE_COLOR.failed}></span>
					Recently failed
					{#if data.recentFailed.total > 0}
						<span class="font-mono-muleta text-[10.5px] text-base-content/50 tnum">
							· {numStr(data.recentFailed.total)} total
						</span>
					{/if}
				</span>
				{#if data.recentFailed.total > 0}
					<a
						href={paths.queueJobs(name)}
						class="text-[11px] normal-case tracking-normal text-base-content/60 hover:text-base-content flex items-center gap-0.5"
					>
						View all <ChevronRight size={12} />
					</a>
				{/if}
			</div>

			{#if data.recentFailed.error}
				<div class="px-5 py-6 text-[12px] text-base-content/60 flex items-center gap-2">
					<TriangleAlert size={13} style="color: var(--color-error)" />
					<span class="font-mono-muleta">{data.recentFailed.error}</span>
				</div>
			{:else if data.recentFailed.jobs.length === 0}
				<div class="px-5 py-10 text-center text-[13px] text-base-content/50">
					No failed jobs — nice.
				</div>
			{:else}
				{#each data.recentFailed.jobs as job (job.id)}
					<a
						href={paths.jobData(name, job.id)}
						class="flex items-center gap-3 px-5 h-14 border-b border-base-300 last:border-b-0 hover:bg-base-200/60 text-[12.5px]"
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 min-w-0">
								<span class="font-medium truncate">{job.name}</span>
								<span class="font-mono-muleta text-[10.5px] text-base-content/40 shrink-0">
									#{job.id}
								</span>
							</div>
							{#if job.failedReason}
								<div
									class="mt-0.5 font-mono-muleta text-[11px] truncate"
									style:color="oklch(72% 0.17 20)"
								>
									{truncate(job.failedReason, 80)}
								</div>
							{/if}
						</div>
						<div class="shrink-0 text-right">
							<div class="font-mono-muleta text-[11px] text-base-content/60 tnum">
								{age(job.finishedAt ?? job.processedAt ?? job.addedAt)}
							</div>
							<div class="font-mono-muleta text-[10.5px] text-base-content/40 tnum">
								{job.attemptsMade}/{job.attempts}
							</div>
						</div>
					</a>
				{/each}
			{/if}
		</section>

		<!-- Recently active -->
		<section class="bg-base-200 border border-base-300 rounded-lg overflow-hidden">
			<div
				class="flex items-center justify-between px-5 h-10 border-b border-base-300 text-[11px] uppercase tracking-wider text-base-content/60"
			>
				<span class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full" style:background={STATE_COLOR.active}></span>
					Currently active
					{#if data.recentActive.total > 0}
						<span class="font-mono-muleta text-[10.5px] text-base-content/50 tnum">
							· {numStr(data.recentActive.total)} total
						</span>
					{/if}
				</span>
				{#if data.recentActive.total > 0}
					<a
						href={paths.queueJobs(name)}
						class="text-[11px] normal-case tracking-normal text-base-content/60 hover:text-base-content flex items-center gap-0.5"
					>
						View all <ChevronRight size={12} />
					</a>
				{/if}
			</div>

			{#if data.recentActive.error}
				<div class="px-5 py-6 text-[12px] text-base-content/60 flex items-center gap-2">
					<TriangleAlert size={13} style="color: var(--color-error)" />
					<span class="font-mono-muleta">{data.recentActive.error}</span>
				</div>
			{:else if data.recentActive.jobs.length === 0}
				<div class="px-5 py-10 text-center text-[13px] text-base-content/50">
					No jobs processing right now.
				</div>
			{:else}
				{#each data.recentActive.jobs as job (job.id)}
					<a
						href={paths.jobData(name, job.id)}
						class="flex items-center gap-3 px-5 h-14 border-b border-base-300 last:border-b-0 hover:bg-base-200/60 text-[12.5px]"
					>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2 min-w-0">
								<span class="font-medium truncate">{job.name}</span>
								<span class="font-mono-muleta text-[10.5px] text-base-content/40 shrink-0">
									#{job.id}
								</span>
							</div>
							<div class="mt-1 flex items-center gap-2">
								<div
									class="h-1 rounded-full bg-base-300 flex-1 overflow-hidden"
									role="progressbar"
									aria-valuenow={typeof job.progress === "number" ? job.progress : 0}
									aria-valuemin={0}
									aria-valuemax={100}
								>
									{#if typeof job.progress === "number"}
										<div
											class="h-full"
											style:width="{Math.max(0, Math.min(100, job.progress))}%"
											style:background={STATE_COLOR.active}
										></div>
									{/if}
								</div>
								{#if typeof job.progress === "number"}
									<span class="font-mono-muleta text-[10.5px] text-base-content/50 tnum w-10">
										{Math.round(job.progress)}%
									</span>
								{/if}
							</div>
						</div>
						<div class="shrink-0 text-right">
							<div class="font-mono-muleta text-[11px] text-base-content/60 tnum">
								{age(job.processedAt ?? job.addedAt)}
							</div>
							<div class="font-mono-muleta text-[10.5px] text-base-content/40 tnum">
								{job.attemptsMade}/{job.attempts}
							</div>
						</div>
					</a>
				{/each}
			{/if}
		</section>
	</div>

	<!-- throughput placeholder — hero card wired for the future metrics plugin -->
	<section class="mt-8 bg-base-200 border border-base-300 rounded-lg p-8">
		<div class="flex items-center gap-2 text-[11px] uppercase tracking-wider text-base-content/60">
			<ChartBar size={13} />
			Throughput
		</div>
		<div class="mt-2 h-32 flex items-center justify-center text-[13px] text-base-content/40"></div>
	</section>
</div>
