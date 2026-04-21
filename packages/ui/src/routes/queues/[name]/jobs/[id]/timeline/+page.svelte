<script lang="ts">
	import { page } from "$app/state"
	import type { JobDetail } from "$lib/api/client"
	import LifecycleTimeline from "$lib/components/LifecycleTimeline.svelte"

	let job = $derived(page.data.job as JobDetail | null)

	let waitMs = $derived(job && job.processedAt !== undefined ? job.processedAt - job.addedAt : null)
	let processMs = $derived.by<number | null>(() => {
		if (!job) return null
		if (job.processedAt !== undefined && job.finishedAt !== undefined) {
			return job.finishedAt - job.processedAt
		}
		if (job.state === "active" && job.processedAt !== undefined) {
			return Date.now() - job.processedAt
		}
		return null
	})
	let maxBarMs = $derived(Math.max(waitMs ?? 0, processMs ?? 0, 1))
</script>

{#if job}
	<section class="mt-5">
		<div class="md:flex">
			<div>
				<h2 class="text-[14px] font-semibold m-0">Lifecycle</h2>
				<div class="mt-3">
					<LifecycleTimeline {job} showDateTime />
				</div>
			</div>

			<div class="grow">
				<h2 class="mt-6 lg:mt-0 text-[14px] font-semibold m-0">
					{job.state === "active" ? "Progress &" : ""} Time breakdown
				</h2>
				{#if job.state === "active"}
					<div class="mt-2 flex items-center gap-3">
						<dt class="w-28 text-base-content/55">Progress</dt>
						<div class="relative h-1.5 flex-1 rounded-full bg-base-300 overflow-hidden">
							<div
								class="absolute inset-y-0 left-0 rounded-full"
								style:width="{typeof job.progress === 'number'
									? Math.min(Math.max(job.progress, 0), 100)
									: 0}%"
								style:background={"var(--color-info)"}
							></div>
						</div>
						<span class="text-[11.5px] font-mono-muleta tnum text-base-content/60 w-10 text-right">
							{typeof job.progress === "number" ? Math.round(job.progress) : 0}%
						</span>
					</div>
				{/if}

				<dl class="mt-3 space-y-2 text-[12px]">
					<div class="flex items-center gap-3">
						<dt class="w-28 text-base-content/55">Wait in queue</dt>
						<dd class="flex-1 h-1.5 rounded bg-base-300 overflow-hidden">
							{#if waitMs !== null}
								<div
									class="h-full bg-base-content/40"
									style:width="{(waitMs / maxBarMs) * 100}%"
								></div>
							{/if}
						</dd>
						<dd class="w-24 text-right font-mono-muleta tnum text-base-content/60">
							{waitMs !== null ? `${waitMs}ms` : "—"}
						</dd>
					</div>
					<div class="flex items-center gap-3">
						<dt class="w-28 text-base-content/55">Processing</dt>
						<dd class="flex-1 h-1.5 rounded bg-base-300 overflow-hidden">
							{#if processMs !== null}
								<div
									class="h-full"
									style:width="{(processMs / maxBarMs) * 100}%"
									style:background="var(--color-info)"
								></div>
							{/if}
						</dd>
						<dd class="w-24 text-right font-mono-muleta tnum text-base-content/60">
							{processMs !== null ? `${processMs}ms` : "—"}
						</dd>
					</div>
				</dl>
			</div>
		</div>
	</section>
{/if}
