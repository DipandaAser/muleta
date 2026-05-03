<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation"
	import { page } from "$app/state"
	import { type AddJobOptions, type JobDetail, api } from "$lib/api/client"
	import LifecycleTimeline from "$lib/components/LifecycleTimeline.svelte"
	import StateBadge from "$lib/components/StateBadge.svelte"
	import { age, byteSize, duration, summarizeBackoff, summarizeRemoveOn } from "$lib/jobs/format"
	import {
		Check,
		Clipboard,
		Copy,
		Download,
		GitBranch,
		Pencil,
		Play,
		RefreshCw,
		RotateCcw,
		Rows4,
		Server,
		Trash2,
		TriangleAlert,
		Zap,
	} from "@lucide/svelte"
	import type { Snippet } from "svelte"
	import type { LayoutData } from "./$types"

	interface Props {
		data: LayoutData
		children: Snippet
	}

	let { data, children }: Props = $props()

	let job = $derived(data.job as JobDetail | null)
	let name = $derived(data.name)
	let id = $derived(data.id)

	type TabId = "data" | "logs" | "timeline" | "options" | "trace" | "preview" | "raw"

	const TABS: Array<{
		id: TabId
		label: string
		badge?: string
		badgeClass?: string
		disabled?: boolean
		dot?: boolean
	}> = [
		{ id: "data", label: "Data" },
		{ id: "logs", label: "Logs", dot: true },
		{ id: "timeline", label: "Timeline" },
		{ id: "options", label: "Options" },

		{ id: "raw", label: "Raw" },
	]

	function hrefFor(tab: TabId): string {
		return `/queues/${name}/jobs/${id}/${tab}`
	}

	function isTabActive(tab: TabId): boolean {
		return page.url.pathname.startsWith(`/queues/${name}/jobs/${id}/${tab}`)
	}

	let actionBusy = $state<"retry" | "remove" | "promote" | "duplicate" | null>(null)
	let actionError = $state<string | null>(null)
	let confirmRemoveOpen = $state(false)

	async function runAction(
		kind: "retry" | "remove" | "promote" | "duplicate",
		fn: () => Promise<Response>,
	): Promise<Response | null> {
		actionBusy = kind
		actionError = null
		try {
			const res = await fn()
			if (!res.ok) {
				let message = `HTTP ${res.status}`
				try {
					const body = (await res.clone().json()) as { error?: string }
					if (body?.error) message = body.error
				} catch {
					// non-JSON error body; keep the HTTP fallback
				}
				actionError = message
				return null
			}
			return res
		} catch (e) {
			actionError = e instanceof Error ? e.message : `${kind} failed`
			return null
		} finally {
			actionBusy = null
		}
	}

	async function onRetry() {
		const ok = await runAction("retry", () =>
			api.api.v1.queues[":name"].jobs[":id"].retry.$post({ param: { name, id } }),
		)
		if (ok) await invalidateAll()
	}

	async function onPromote() {
		const ok = await runAction("promote", () =>
			api.api.v1.queues[":name"].jobs[":id"].promote.$post({ param: { name, id } }),
		)
		if (ok) await invalidateAll()
	}

	async function onConfirmRemove() {
		confirmRemoveOpen = false
		const ok = await runAction("remove", () =>
			api.api.v1.queues[":name"].jobs[":id"].$delete({ param: { name, id } }),
		)
		if (ok) await goto(`/queues/${name}/jobs`)
	}

	/**
	 * Build the AddJob payload for a clone. Behavioral opts (priority,
	 * attempts, backoff, removeOn*) carry over so the new job runs the
	 * same retry/cleanup policy. We deliberately drop:
	 *
	 *   - `jobId`   — would collide with the source job's deterministic id
	 *   - `delay`   — was relative to the original add time; copying makes
	 *                 the duplicate fire in the past or far future
	 *   - `repeat`  — duplicating a scheduler creates a parallel one,
	 *                 almost never what the operator wants
	 */
	function buildDuplicateOpts(src: Record<string, unknown>): AddJobOptions {
		const opts: AddJobOptions = {}
		if (typeof src.priority === "number") opts.priority = src.priority
		if (typeof src.attempts === "number") opts.attempts = src.attempts
		if (
			src.backoff &&
			typeof src.backoff === "object" &&
			"type" in src.backoff &&
			"delay" in src.backoff
		) {
			const b = src.backoff as { type: unknown; delay: unknown }
			if ((b.type === "fixed" || b.type === "exponential") && typeof b.delay === "number") {
				opts.backoff = { type: b.type, delay: b.delay }
			}
		}
		if (src.removeOnComplete !== undefined) {
			opts.removeOnComplete = src.removeOnComplete as AddJobOptions["removeOnComplete"]
		}
		if (src.removeOnFail !== undefined) {
			opts.removeOnFail = src.removeOnFail as AddJobOptions["removeOnFail"]
		}
		return opts
	}

	async function onDuplicate() {
		if (!job) return
		actionBusy = "duplicate"
		actionError = null
		try {
			const opts = buildDuplicateOpts(job.opts)
			const res = await api.api.v1.queues[":name"].jobs.$post({
				param: { name },
				json: {
					name: job.name,
					data: job.data,
					...(Object.keys(opts).length > 0 ? { opts } : {}),
				},
			})
			if (!res.ok) {
				let message = `HTTP ${res.status}`
				try {
					const body = (await res.json()) as { error?: string }
					if (body?.error) message = body.error
				} catch {
					// non-JSON error body; keep the HTTP fallback
				}
				actionError = message
				return
			}
			const body = await res.json()
			await goto(`/queues/${name}/jobs/${body.id}/data`)
		} catch (e) {
			actionError = e instanceof Error ? e.message : "duplicate failed"
		} finally {
			actionBusy = null
		}
	}

	let exportMenu = $state<HTMLDetailsElement | null>(null)
	let duplicateMenu = $state<HTMLDetailsElement | null>(null)
	// Tri-state UI feedback for the clipboard action — flips to "copied" for
	// a beat after success so the operator knows the click registered before
	// they paste somewhere else.
	let copyState = $state<"idle" | "copied" | "error">("idle")

	// Native <details> doesn't close on outside click — only on summary
	// toggle. This single doc-level listener closes any open dropdown
	// when the click lands outside it, so adding a third menu later is
	// just one more entry in the array.
	$effect(() => {
		function onDocClick(e: MouseEvent) {
			if (!(e.target instanceof Node)) return
			for (const m of [exportMenu, duplicateMenu]) {
				if (m?.open && !m.contains(e.target)) m.removeAttribute("open")
			}
		}
		document.addEventListener("mousedown", onDocClick)
		return () => document.removeEventListener("mousedown", onDocClick)
	})

	function jobAsJson(): string {
		// Two-space indent matches the design's monospace blocks elsewhere
		// and is the conventional shape for sharing a job dump in tickets.
		return JSON.stringify(job, null, 2)
	}

	function downloadJson() {
		if (!job) return
		const blob = new Blob([jobAsJson()], { type: "application/json" })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement("a")
		anchor.href = url
		anchor.download = `${name}-${job.id}.json`
		document.body.appendChild(anchor)
		anchor.click()
		document.body.removeChild(anchor)
		URL.revokeObjectURL(url)
		exportMenu?.removeAttribute("open")
	}

	async function copyJsonToClipboard() {
		if (!job) return
		try {
			await navigator.clipboard.writeText(jobAsJson())
			copyState = "copied"
			setTimeout(() => {
				copyState = "idle"
			}, 1500)
		} catch {
			copyState = "error"
			setTimeout(() => {
				copyState = "idle"
			}, 2000)
		}
		exportMenu?.removeAttribute("open")
	}
</script>

<div class="flex flex-col h-full overflow-hidden">
	{#if data.notFound}
		<div class="mt-8 mx-10 rounded-lg border border-base-300 bg-base-200 p-10 text-center">
			<TriangleAlert class="mx-auto text-base-content/40" size={24} />
			<p class="mt-3 text-[13px] text-base-content/70">
				Job <code class="font-mono-muleta">{id}</code> was not found in queue
				<code class="font-mono-muleta">{name}</code>.
			</p>
		</div>
	{:else if data.error}
		<div
			class="mt-4 mx-10 rounded border px-3 py-2 text-[12px]"
			style:color="oklch(72% 0.17 20)"
			style:border-color="oklch(0.64 0.2 18 / 0.35)"
			style:background="oklch(0.64 0.2 18 / 0.08)"
		>
			<b>Couldn't load job:</b>
			{data.error}
		</div>
	{:else if job}
		<!-- header + summary strip — kept padded on both sides, stays pinned above the scroll region -->
		<div class="px-10 shrink-0">
			<!-- header row -->
			<div class="mt-4 flex items-start gap-3">
				<StateBadge state={job.state} />
				<h1
					class="m-0 text-[22px] font-mono-muleta tracking-tight leading-none flex items-baseline gap-2"
				>
					{job.name}
					<span class="text-[13px] text-base-content/40 font-normal">#{job.id}</span>
				</h1>
				<div class="flex ml-auto items-center gap-1">
					<button
						type="button"
						class="btn btn-sm btn-ghost text-error"
						onclick={() => (confirmRemoveOpen = true)}
						disabled={actionBusy !== null}
						title="Remove this job from the queue"
					>
						{#if actionBusy === "remove"}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<Trash2 size={13} />
						{/if}
						Remove
					</button>
					<details bind:this={duplicateMenu} class="dropdown dropdown-end">
						<summary class="btn btn-sm btn-ghost join-item" aria-label="Duplicate options">
							{#if actionBusy === "duplicate"}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<Copy size={13} />
							{/if}
							Duplicate
						</summary>
						<ul
							class="menu dropdown-content z-10 mt-1 w-56 rounded border border-base-300 bg-base-100 p-1 shadow-md text-[12px]"
						>
							<li>
								<button
									type="button"
									class="gap-2"
									onclick={() => {
										duplicateMenu?.removeAttribute("open")
										onDuplicate()
									}}
									disabled={!job}
									title="Enqueue a copy with the same name, data, and policy"
								>
									<Copy size={12} /> Duplicate
								</button>
							</li>
							<li>
								<a
									href="/queues/{name}/add-job?from={id}"
									onclick={() => duplicateMenu?.removeAttribute("open")}
									aria-label="Duplicate with overrides"
									class="gap-2"
								>
									<Pencil size={12} /> Duplicate with overrides…
								</a>
							</li>
						</ul>
					</details>
					<details bind:this={exportMenu} class="dropdown dropdown-end">
						<summary class="btn btn-sm btn-ghost join-item" aria-label="Export options">
							<Download size={12} /> Export
						</summary>
						<ul
							class="menu dropdown-content z-10 mt-1 w-44 rounded border border-base-300 bg-base-100 p-1 shadow-md text-[12px]"
						>
							<li>
								<button type="button" class="gap-2" onclick={downloadJson} disabled={!job}>
									<Download size={12} /> Download JSON
								</button>
							</li>
							<li>
								<button type="button" class="gap-2" onclick={copyJsonToClipboard} disabled={!job}>
									{#if copyState === "copied"}
										<Check size={12} class="text-success" /> Copied
									{:else if copyState === "error"}
										<TriangleAlert size={12} class="text-error" /> Copy failed
									{:else}
										<Clipboard size={12} /> Copy as JSON
									{/if}
								</button>
							</li>
						</ul>
					</details>
					<button
						type="button"
						class="btn btn-sm btn-ghost btn-square"
						onclick={() => invalidateAll()}
						aria-label="Refresh"
						disabled={actionBusy !== null}
					>
						<RefreshCw size={13} />
					</button>
				</div>
			</div>

			<!-- summary strip -->
			<div
				class="mt-4 rounded-lg border border-base-300 bg-base-200 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 divide-x divide-y md:divide-y-0 divide-base-300"
			>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">Queue</div>
					<div class="text-[12.5px] font-mono-muleta truncate mt-0.5">{name}</div>
				</div>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">Full key</div>
					<div class="text-[12.5px] font-mono-muleta truncate mt-0.5">
						{name}:{job.id}
					</div>
				</div>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">State</div>
					<div class="text-[12.5px] font-mono-muleta capitalize mt-0.5">{job.state}</div>
				</div>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">Attempt</div>
					<div class="text-[12.5px] font-mono-muleta tnum mt-0.5">
						{job.attemptsMade} / {job.attempts}
					</div>
				</div>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">Added</div>
					<div class="text-[12.5px] font-mono-muleta mt-0.5">{age(job.addedAt)}</div>
				</div>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">Processed by</div>
					<div class="text-[12.5px] font-mono-muleta text-base-content/40 mt-0.5">—</div>
				</div>
				<div class="px-4 py-2.5 min-w-0">
					<div class="text-[10px] uppercase tracking-wider text-base-content/50">Duration</div>
					<div class="text-[12.5px] font-mono-muleta tnum mt-0.5">
						{#if job.processedAt && job.finishedAt}
							{duration(job.processedAt, job.finishedAt)}
						{:else if job.state === "active" && job.processedAt}
							{duration(job.processedAt, Date.now())}
						{:else}
							<span class="text-base-content/40">—</span>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="mt-5 flex pl-10 border-b border-base-300 shrink-0">
			<div class="flex items-center gap-5 flex-1 min-w-0 lg:mr-6">
				{#each TABS as t (t.id)}
					{@const isActive = isTabActive(t.id)}
					{#if t.disabled}
						<span
							id="tab-{t.id}"
							class="relative py-2 text-[13px] flex items-center gap-1.5 -mb-px border-b-2 border-transparent text-base-content/40 cursor-not-allowed opacity-60"
							title="Coming soon"
						>
							{t.label}
							{#if t.badge}
								<span class="badge badge-xs font-mono-muleta {t.badgeClass ?? ''}">
									{t.badge}
								</span>
							{/if}
						</span>
					{:else}
						<a
							id="tab-{t.id}"
							href={hrefFor(t.id)}
							class="relative py-2 text-[13px] flex items-center gap-1.5 -mb-px border-b-2 transition-colors
                  {isActive
								? 'border-primary text-base-content font-medium'
								: 'border-transparent text-base-content/60 hover:text-base-content'}"
						>
							{t.label}
							{#if t.dot}
								<span class="w-1.5 h-1.5 rounded-full" style:background="var(--color-success)"
								></span>
							{/if}
						</a>
					{/if}
				{/each}
			</div>
			<div class="shrink-0 lg:w-76"></div>
		</div>

		<div class="flex-1 grid gap-x-6 lg:grid-cols-[1fr_19rem] min-h-0 overflow-hidden">
			<div class="min-w-0 pb-10 pl-10 overflow-y-auto">
				{#if actionError}
					<div
						class="mt-3 rounded border px-3 py-2 text-[12px]"
						style:color="oklch(72% 0.17 20)"
						style:border-color="oklch(0.64 0.2 18 / 0.35)"
						style:background="oklch(0.64 0.2 18 / 0.08)"
					>
						{actionError}
					</div>
				{/if}
				{@render children()}
			</div>

			<aside
				id="job-sidebar"
				class="border-t border-base-300 lg:border-0 space-y-5 text-[12px] pt-5 pr-10 pl-5 pb-10 bg-base-200 overflow-y-auto"
			>
				<section>
					<h3 class="text-[10.5px] uppercase tracking-wider text-base-content/50">Lifecycle</h3>
					<div class="mt-2">
						<LifecycleTimeline {job} />
					</div>
				</section>

				<section>
					<h3 class="text-[10.5px] uppercase tracking-wider text-base-content/50">Relations</h3>
					<dl class="mt-2 space-y-1.5">
						<div class="flex items-center gap-2">
							<dt class="text-base-content/55 inline-flex items-center gap-1.5 w-24">
								<GitBranch size={12} /> Parent
							</dt>
							<dd class="font-mono-muleta text-base-content/40">none</dd>
						</div>
						<div class="flex items-center gap-2">
							<dt class="text-base-content/55 inline-flex items-center gap-1.5 w-24">
								<GitBranch size={12} class="rotate-180" /> Children
							</dt>
							<dd class="font-mono-muleta text-base-content/40">none</dd>
						</div>
						<div class="flex items-center gap-2">
							<dt class="text-base-content/55 inline-flex items-center gap-1.5 w-24">
								<Server size={12} /> Worker
							</dt>
							<dd class="font-mono-muleta text-base-content/40">—</dd>
						</div>
						<div class="flex items-center gap-2">
							<dt class="text-base-content/55 inline-flex items-center gap-1.5 w-24">
								<Rows4 size={12} /> Queue
							</dt>
							<dd class="font-mono-muleta">
								<a href="/queues/{name}/jobs" class="hover:underline">{name}</a>
							</dd>
						</div>
					</dl>
				</section>

				<section>
					<h3 class="text-[10.5px] uppercase tracking-wider text-base-content/50">Quick facts</h3>
					<dl class="mt-2 space-y-1.5">
						<div class="leader">
							<dt class="text-base-content/60">Priority</dt>
							<span class="leader-fill"></span>
							<dd class="font-mono-muleta tnum">{job.priority}</dd>
						</div>
						<div class="leader">
							<dt class="text-base-content/60">Delay</dt>
							<span class="leader-fill"></span>
							<dd class="font-mono-muleta tnum">{job.delay}ms</dd>
						</div>
						<div class="leader">
							<dt class="text-base-content/60">Backoff</dt>
							<span class="leader-fill"></span>
							<dd class="font-mono-muleta">{summarizeBackoff(job.opts)}</dd>
						</div>
						<div class="leader">
							<dt class="text-base-content/60">removeOn</dt>
							<span class="leader-fill"></span>
							<dd class="font-mono-muleta">{summarizeRemoveOn(job.opts)}</dd>
						</div>
						<div class="leader">
							<dt class="text-base-content/60">Payload size</dt>
							<span class="leader-fill"></span>
							<dd class="font-mono-muleta tnum">{byteSize(job.data)}</dd>
						</div>
						<div class="leader">
							<dt class="text-base-content/60">Return size</dt>
							<span class="leader-fill"></span>
							<dd class="font-mono-muleta tnum text-base-content/40">
								{job.state === "completed" ? byteSize(job.returnvalue) : "—"}
							</dd>
						</div>
					</dl>
				</section>

				<section>
					<h3 class="text-[10.5px] uppercase tracking-wider text-base-content/50">Danger zone</h3>
					<div class="mt-2 flex flex-col items-start gap-1">
						{#if job.state === "failed"}
							<button
								type="button"
								class="btn btn-xs btn-ghost text-base-content justify-start w-full"
								onclick={onRetry}
								disabled={actionBusy !== null}
							>
								{#if actionBusy === "retry"}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<Play size={12} />
								{/if}
								Retry job
							</button>
						{/if}
						{#if job.state === "delayed"}
							<button
								type="button"
								class="btn btn-xs btn-ghost text-base-content justify-start w-full"
								onclick={onPromote}
								disabled={actionBusy !== null}
							>
								{#if actionBusy === "promote"}
									<span class="loading loading-spinner loading-xs"></span>
								{:else}
									<Zap size={12} />
								{/if}
								Promote job
							</button>
						{/if}
						<button
							type="button"
							class="btn btn-xs btn-ghost text-error justify-start w-full"
							onclick={() => (confirmRemoveOpen = true)}
							disabled={actionBusy !== null}
						>
							{#if actionBusy === "remove"}
								<span class="loading loading-spinner loading-xs"></span>
							{:else}
								<Trash2 size={12} />
							{/if}
							Remove job
						</button>
						<button
							type="button"
							class="btn btn-xs btn-ghost text-base-content/60 justify-start w-full"
							disabled
						>
							<RotateCcw size={12} /> Reset attempts
						</button>
					</div>
				</section>
			</aside>
		</div>
	{/if}
</div>

<!-- confirm-remove dialog -->
{#if confirmRemoveOpen}
	<dialog open class="modal modal-open">
		<div class="modal-box max-w-sm">
			<h3 class="text-base font-semibold">Remove job?</h3>
			<p class="mt-2 text-[13px] text-base-content/70">
				Job <code class="font-mono-muleta">{id}</code> will be removed from queue
				<code class="font-mono-muleta">{name}</code>. This can't be undone.
			</p>
			<div class="modal-action">
				<button
					type="button"
					class="btn btn-sm btn-ghost"
					onclick={() => (confirmRemoveOpen = false)}
				>
					Cancel
				</button>
				<button type="button" class="btn btn-sm btn-error" onclick={onConfirmRemove}>
					Remove
				</button>
			</div>
		</div>
		<form method="dialog" class="modal-backdrop">
			<button type="submit" onclick={() => (confirmRemoveOpen = false)}>close</button>
		</form>
	</dialog>
{/if}

<style>
	/* JSON token colors used by {@html highlightJson(...)} in child routes.
   Mapped to the design's status tokens so keys/strings/numbers/bools pick
   up the exact same hexes as their matching state badges. */
	:global(.json-key) {
		color: var(--color-error);
	}
	:global(.json-str) {
		color: var(--color-success);
	}
	:global(.json-num) {
		color: var(--color-info);
	}
	:global(.json-bool) {
		color: var(--color-state-paused, var(--color-warning));
	}

	/* Dotted leader rows for the Quick Facts list. Label on the left, value
   pinned right, dotted fill absorbs the slack — matches the design's
   sidebar pattern. Fill lives at the baseline via border-bottom. */
	.leader {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 12px;
	}
	.leader-fill {
		flex: 1 1 auto;
		border-bottom: 1px dotted var(--color-border, var(--color-base-300));
		transform: translateY(-3px);
		min-width: 0.75rem;
	}
</style>
