<script lang="ts">
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { untrack } from "svelte"
	import {
		api,
		type AddJobOptions,
		type AddJobRequest,
		type JobDetail,
		type Queue,
	} from "$lib/api/client"
	import CodeEditor from "$lib/components/code/CodeEditor.svelte"
	import OptionsGrid from "$lib/jobs/add-job/OptionsGrid.svelte"
	import PreviewPane from "$lib/jobs/add-job/PreviewPane.svelte"
	import RemoveOnPolicyField from "$lib/jobs/add-job/RemoveOnPolicyField.svelte"
	import RepeatScheduleField from "$lib/jobs/add-job/RepeatScheduleField.svelte"
	import JobNamePicker from "$lib/jobs/JobNamePicker.svelte"
	import { Check, Plus } from "@lucide/svelte"

	type DelayUnit = "ms" | "s" | "m"
	type BackoffType = "fixed" | "exponential"
	type AgeUnit = "s" | "m" | "h" | "d"
	type RepeatStrategy = "pattern" | "every"

	const AGE_UNIT_SECONDS: Record<AgeUnit, number> = {
		s: 1,
		m: 60,
		h: 3600,
		d: 86_400,
	}

	/** Same units as the age selector but pre-multiplied to milliseconds. */
	const EVERY_UNIT_MS: Record<AgeUnit, number> = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
	}

	/**
	 * Pick the largest whole-number unit that divides `ms` evenly so the
	 * pre-filled "delay 60000 ms" reads as "1 m" instead of dumping the
	 * raw millisecond count into an ms input.
	 */
	function fitDelay(ms: number): { value: number; unit: DelayUnit } {
		if (ms <= 0) return { value: 0, unit: "s" }
		if (ms % 60_000 === 0) return { value: ms / 60_000, unit: "m" }
		if (ms % 1000 === 0) return { value: ms / 1000, unit: "s" }
		return { value: ms, unit: "ms" }
	}

	function fitAgeSeconds(seconds: number): { value: number; unit: AgeUnit } {
		if (seconds <= 0) return { value: 0, unit: "s" }
		if (seconds % 86_400 === 0) return { value: seconds / 86_400, unit: "d" }
		if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "h" }
		if (seconds % 60 === 0) return { value: seconds / 60, unit: "m" }
		return { value: seconds, unit: "s" }
	}

	function fitEveryMs(ms: number): { value: number; unit: AgeUnit } {
		if (ms <= 0) return { value: 0, unit: "m" }
		if (ms % 86_400_000 === 0) return { value: ms / 86_400_000, unit: "d" }
		if (ms % 3_600_000 === 0) return { value: ms / 3_600_000, unit: "h" }
		if (ms % 60_000 === 0) return { value: ms / 60_000, unit: "m" }
		return { value: Math.max(1, Math.round(ms / 1000)), unit: "s" }
	}

	/**
	 * Convert the various date shapes BullMQ stores (ISO string or epoch
	 * ms) to the `YYYY-MM-DDTHH:mm` shape `<input type="datetime-local">`
	 * expects. Returns "" if the value is missing or unparseable.
	 */
	function toLocalInput(v: unknown): string {
		const d = typeof v === "number" ? new Date(v) : typeof v === "string" && v ? new Date(v) : null
		if (!d || Number.isNaN(d.getTime())) return ""
		return d.toISOString().slice(0, 16)
	}

	function parseKeepJobs(v: unknown): {
		enabled: boolean
		count: number | null
		age: number | null
		ageUnit: AgeUnit
	} {
		// BullMQ stores `removeOnComplete` / `removeOnFail` in five shapes —
		// undefined, false, true, number, or `{ count?, age? }`. We map each
		// back to the form's three knobs (toggle + count + age + ageUnit).
		const def = { enabled: false, count: null, age: null, ageUnit: "s" as AgeUnit }
		if (v === undefined || v === null || v === false) return def
		if (v === true) return { enabled: true, count: null, age: null, ageUnit: "s" }
		if (typeof v === "number") return { enabled: true, count: v, age: null, ageUnit: "s" }
		if (typeof v === "object") {
			const o = v as { count?: unknown; age?: unknown }
			const count = typeof o.count === "number" ? o.count : null
			if (typeof o.age === "number") {
				const fit = fitAgeSeconds(o.age)
				return { enabled: true, count, age: fit.value, ageUnit: fit.unit }
			}
			return { enabled: true, count, age: null, ageUnit: "s" }
		}
		return def
	}

	function parseRepeat(v: unknown) {
		const def = {
			enabled: false,
			strategy: "pattern" as RepeatStrategy,
			pattern: "0 */15 * * * *",
			every: null as number | null,
			everyUnit: "m" as AgeUnit,
			limit: null as number | null,
			immediately: false,
			startDate: "",
			endDate: "",
		}
		if (!v || typeof v !== "object") return def
		const r = v as Record<string, unknown>
		const out = { ...def, enabled: true }
		if (typeof r.pattern === "string" && r.pattern) {
			out.strategy = "pattern"
			out.pattern = r.pattern
			if (typeof r.immediately === "boolean") out.immediately = r.immediately
		} else if (typeof r.every === "number" && r.every > 0) {
			out.strategy = "every"
			const fit = fitEveryMs(r.every)
			out.every = fit.value
			out.everyUnit = fit.unit
		} else {
			return def
		}
		if (typeof r.limit === "number" && r.limit > 0) out.limit = r.limit
		out.startDate = toLocalInput(r.startDate)
		out.endDate = toLocalInput(r.endDate)
		return out
	}

	/**
	 * Project a source `JobDetail` onto the form's initial values. Returns
	 * the same defaults when called with `null`, so the form's boot-up
	 * shape is identical regardless of whether `?from=` was set.
	 */
	function buildPrefill(src: JobDetail | null) {
		const opts = (src?.opts ?? {}) as Record<string, unknown>
		const delayMs = typeof opts.delay === "number" ? opts.delay : 0
		const backoff =
			opts.backoff && typeof opts.backoff === "object"
				? (opts.backoff as { type?: unknown; delay?: unknown })
				: null
		return {
			name: src?.name ?? "",
			jobId: typeof opts.jobId === "string" ? opts.jobId : "",
			dataText: src ? JSON.stringify(src.data ?? {}, null, 2) : "{}",
			priority: typeof opts.priority === "number" ? opts.priority : 0,
			attempts: typeof opts.attempts === "number" ? opts.attempts : 3,
			delay: fitDelay(delayMs),
			backoff: {
				type:
					backoff?.type === "fixed" || backoff?.type === "exponential"
						? backoff.type
						: ("exponential" as BackoffType),
				delay: typeof backoff?.delay === "number" ? backoff.delay : 2000,
			},
			removeOnComplete: parseKeepJobs(opts.removeOnComplete),
			removeOnFail: parseKeepJobs(opts.removeOnFail),
			repeat: parseRepeat(opts.repeat),
		}
	}

	let { data } = $props<{
		data: { jobNames: string[]; sourceJob: JobDetail | null; fromError: string | null }
	}>()

	let queue = $derived(page.data.queue as Queue | null)
	let queueName = $derived(page.params.name as string)

	// Initial form values, optionally seeded from a `?from=<id>` source
	// job. `untrack` makes this an explicit one-shot read — once the
	// form is interactive, edits live in the `$state` slots below and
	// don't react to subsequent loader reruns (which would otherwise
	// stomp on whatever the user just typed).
	const seed = untrack(() => buildPrefill(data.sourceJob))

	let name = $state(seed.name)
	let jobId = $state(seed.jobId)
	let dataText = $state(seed.dataText)
	let priority = $state(seed.priority)
	let attempts = $state(seed.attempts)
	let delay = $state(seed.delay.value)
	let delayUnit = $state<DelayUnit>(seed.delay.unit)
	let backoffType = $state<BackoffType>(seed.backoff.type)
	let backoffDelay = $state(seed.backoff.delay)

	let removeOnComplete = $state(seed.removeOnComplete.enabled)
	let removeOnCompleteCount = $state<number | null>(seed.removeOnComplete.count)
	let removeOnCompleteAge = $state<number | null>(seed.removeOnComplete.age)
	let removeOnCompleteAgeUnit = $state<AgeUnit>(seed.removeOnComplete.ageUnit)

	let removeOnFail = $state(seed.removeOnFail.enabled)
	let removeOnFailCount = $state<number | null>(seed.removeOnFail.count)
	let removeOnFailAge = $state<number | null>(seed.removeOnFail.age)
	let removeOnFailAgeUnit = $state<AgeUnit>(seed.removeOnFail.ageUnit)

	let repeat = $state(seed.repeat.enabled)
	let repeatStrategy = $state<RepeatStrategy>(seed.repeat.strategy)
	let repeatPattern = $state(seed.repeat.pattern)
	let repeatEvery = $state<number | null>(seed.repeat.every)
	let repeatEveryUnit = $state<AgeUnit>(seed.repeat.everyUnit)
	let repeatLimit = $state<number | null>(seed.repeat.limit)
	let repeatImmediately = $state(seed.repeat.immediately)
	let repeatStartDate = $state(seed.repeat.startDate)
	let repeatEndDate = $state(seed.repeat.endDate)

	let submitting = $state(false)
	let submitted = $state(false)
	let serverError = $state<string | null>(null)

	let parsedData = $derived.by<{ ok: true; value: unknown; bytes: number } | { ok: false }>(() => {
		try {
			const value = JSON.parse(dataText)
			const bytes = new Blob([JSON.stringify(value)]).size
			return { ok: true, value, bytes }
		} catch {
			return { ok: false }
		}
	})
	let jsonValid = $derived(parsedData.ok)

	/**
	 * Translate the form's three knobs (count, age, age-unit) into the
	 * shape BullMQ accepts on `removeOnComplete` / `removeOnFail`.
	 *   - both empty       → `true`           (remove every job immediately)
	 *   - count only       → `number`         (keep last N)
	 *   - age only         → `{ age }`        (remove older than N seconds)
	 *   - count + age      → `{ age, count }` (BullMQ AND-applies both caps)
	 */
	function buildKeepJobs(
		count: number | null,
		age: number | null,
		unit: AgeUnit,
	): NonNullable<AddJobOptions["removeOnComplete"]> {
		const hasCount = count !== null && Number.isFinite(count)
		const hasAge = age !== null && Number.isFinite(age)
		if (!hasCount && !hasAge) return true
		if (hasCount && !hasAge) return Math.max(0, Math.floor(count as number))
		const ageSec = Math.max(0, Math.floor((age as number) * AGE_UNIT_SECONDS[unit]))
		return hasCount
			? { age: ageSec, count: Math.max(0, Math.floor(count as number)) }
			: { age: ageSec }
	}

	function toIsoOrNull(local: string): string | null {
		const trimmed = local.trim()
		if (!trimmed) return null
		const parsed = new Date(trimmed)
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
	}

	function delayMs(): number {
		if (delay <= 0) return 0
		if (delayUnit === "s") return delay * 1000
		if (delayUnit === "m") return delay * 60_000
		return delay
	}

	let optsForRequest = $derived.by<AddJobOptions>(() => {
		const opts: AddJobOptions = { attempts: Number(attempts) || 1 }
		const p = Number(priority)
		if (p > 0) opts.priority = p
		const d = delayMs()
		if (d > 0) opts.delay = d
		opts.backoff = { type: backoffType, delay: Number(backoffDelay) || 0 }
		if (removeOnComplete) {
			opts.removeOnComplete = buildKeepJobs(
				removeOnCompleteCount,
				removeOnCompleteAge,
				removeOnCompleteAgeUnit,
			)
		}
		if (removeOnFail) {
			opts.removeOnFail = buildKeepJobs(removeOnFailCount, removeOnFailAge, removeOnFailAgeUnit)
		}
		if (repeat) {
			const r: NonNullable<AddJobOptions["repeat"]> = {}
			if (repeatStrategy === "pattern") {
				const trimmed = repeatPattern.trim()
				if (trimmed) r.pattern = trimmed
				if (repeatImmediately) r.immediately = true
			} else if (repeatEvery !== null && Number.isFinite(repeatEvery)) {
				const ms = Math.max(0, Math.floor(repeatEvery * EVERY_UNIT_MS[repeatEveryUnit]))
				if (ms > 0) r.every = ms
			}
			if (repeatLimit !== null && Number.isFinite(repeatLimit) && repeatLimit > 0) {
				r.limit = Math.floor(repeatLimit)
			}
			const startIso = toIsoOrNull(repeatStartDate)
			const endIso = toIsoOrNull(repeatEndDate)
			if (startIso) r.startDate = startIso
			if (endIso) r.endDate = endIso
			if (r.pattern || r.every) opts.repeat = r
		}
		if (jobId.trim()) opts.jobId = jobId.trim()
		return opts
	})

	let preview = $derived.by(() => {
		const safeName = name || "job-name"
		const dataJson = jsonValid ? dataText : "/* invalid JSON */"
		const optsJson = JSON.stringify(optsForRequest, null, 2)
		const indent = (s: string) => s.split("\n").join("\n  ")
		return `await queue.add(\n  ${JSON.stringify(safeName)},\n  ${indent(dataJson)},\n  ${indent(optsJson)}\n);`
	})

	let canSubmit = $derived(jsonValid && name.trim().length > 0 && !submitting)

	async function submit() {
		if (!canSubmit || !parsedData.ok) return
		submitting = true
		serverError = null
		try {
			const body: AddJobRequest = {
				name: name.trim(),
				data: parsedData.value,
				opts: optsForRequest,
			}
			const res = await api.api.v1.queues[":name"].jobs.$post({
				param: { name: queueName },
				json: body,
			})
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as { error?: string } | null
				serverError = err?.error ?? `request failed (HTTP ${res.status})`
				return
			}
			const job = await res.json()
			submitted = true
			setTimeout(() => goto(`/queues/${queueName}/jobs/${job.id}`), 600)
		} catch (e) {
			serverError = e instanceof Error ? e.message : "submit failed"
		} finally {
			submitting = false
		}
	}

	function cancel() {
		goto(`/queues/${queueName}`)
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null
		const isFormField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA"
		if (e.key === "Escape" && !isFormField) {
			e.preventDefault()
			cancel()
		}
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault()
			submit()
		}
	}

	$effect(() => {
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	})
</script>

<div class="flex flex-col h-full overflow-hidden">
	<div
		class="flex-1 pl-10 flex flex-col lg:flex-row items-stretch gap-8 min-h-0 overflow-hidden mb-2"
	>
		<div id="form-column" class="pt-5 pb-24 flex-1 min-w-0 flex flex-col gap-6 overflow-y-auto">
			{#if data.sourceJob}
				<div
					class="rounded border border-base-300 bg-base-200 px-3 py-2 text-[12px] flex items-center gap-2"
				>
					<Check size={12} class="text-success" />
					<span>
						Pre-filled from job
						<a
							href="/queues/{queueName}/jobs/{data.sourceJob.id}/data"
							class="font-mono-muleta hover:underline">{data.sourceJob.name} #{data.sourceJob.id}</a
						>. Tweak any field, then enqueue.
					</span>
				</div>
			{:else if data.fromError}
				<div
					class="rounded border px-3 py-2 text-[12px]"
					style:color="oklch(72% 0.17 20)"
					style:border-color="oklch(0.64 0.2 18 / 0.35)"
					style:background="oklch(0.64 0.2 18 / 0.08)"
				>
					{data.fromError}
				</div>
			{/if}

			<!-- Job picker -->
			<div class="flex flex-col gap-1.5">
				<div class="text-[12px] text-base-content/70 flex items-center gap-1.5">
					Pick a job
					<span class="text-base-content/40 text-[11px]">from existing job list</span>
				</div>
				<JobNamePicker
					id="job-name-picker"
					bind:value={name}
					suggestions={data.jobNames}
					onChange={(v) => (name = v)}
				/>
			</div>

			<div class="flex flex-col sm:flex-row gap-4">
				<div class="flex-2 min-w-0 flex flex-col gap-1.5">
					<label for="job-name" class="text-[12px] text-base-content/70">
						Job name <span class="text-error">*</span>
					</label>
					<input
						id="job-name"
						type="text"
						bind:value={name}
						placeholder="e.g. send-welcome-email"
						class="input input-sm font-mono-muleta w-full"
					/>
				</div>
				<div class="flex-1 min-w-0 flex flex-col gap-1.5">
					<label for="job-id" class="text-[12px] text-base-content/70">
						Job ID <span class="text-base-content/40 text-[11px]">optional</span>
					</label>
					<input
						id="job-id"
						type="text"
						bind:value={jobId}
						placeholder="auto"
						class="input input-sm font-mono-muleta w-full"
					/>
					{#if repeat}
						<p class="label text-error/50">
							BullMQ ignores Job ID for repeating jobs — it derives a deterministic id from the
							schedule.
						</p>
					{/if}
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<div class="flex items-center justify-between">
					<label for="job-data" class="text-[12px] text-base-content/70 flex items-center gap-1.5">
						Data
						<span class="text-base-content/40 text-[11px]">JSON payload</span>
					</label>
					{#if jsonValid && parsedData.ok}
						<span
							class="font-mono-muleta text-[10.5px] px-1.5 py-0.5 rounded"
							style:background="color-mix(in oklab, var(--color-success) 12%, transparent)"
							style:color="var(--color-success)"
						>
							✓ valid · {parsedData.bytes}B
						</span>
					{:else}
						<span
							class="font-mono-muleta text-[10.5px] px-1.5 py-0.5 rounded"
							style:background="color-mix(in oklab, var(--color-error) 12%, transparent)"
							style:color="var(--color-error)"
						>
							⚠ invalid JSON
						</span>
					{/if}
				</div>
				<CodeEditor
					bind:value={dataText}
					lang="json"
					height={220}
					class={jsonValid ? "" : "muleta-editor-error"}
				/>
			</div>

			<OptionsGrid
				bind:priority
				bind:attempts
				bind:delay
				bind:delayUnit
				bind:backoffType
				bind:backoffDelay
			/>

			<div class="flex flex-col gap-2 mt-2">
				<RemoveOnPolicyField
					label="removeOnComplete"
					bind:enabled={removeOnComplete}
					bind:count={removeOnCompleteCount}
					bind:age={removeOnCompleteAge}
					bind:ageUnit={removeOnCompleteAgeUnit}
				/>
				<RemoveOnPolicyField
					label="removeOnFail"
					bind:enabled={removeOnFail}
					bind:count={removeOnFailCount}
					bind:age={removeOnFailAge}
					bind:ageUnit={removeOnFailAgeUnit}
				/>
				<RepeatScheduleField
					bind:enabled={repeat}
					bind:strategy={repeatStrategy}
					bind:pattern={repeatPattern}
					bind:every={repeatEvery}
					bind:everyUnit={repeatEveryUnit}
					bind:limit={repeatLimit}
					bind:immediately={repeatImmediately}
					bind:startDate={repeatStartDate}
					bind:endDate={repeatEndDate}
					showJobIdHint={Boolean(jobId.trim())}
				/>
			</div>
		</div>

		<PreviewPane {preview} {queue} {queueName} {serverError} />
	</div>

	<!-- Footer actions -->
	<div
		class="fixed bottom-0 left-58 right-0 border-t border-base-300 bg-base-100/95 backdrop-blur px-10 py-2 flex items-center gap-3 z-40"
	>
		<div class="font-mono-muleta text-[11px] text-base-content/50 flex items-center gap-2">
			<kbd class="kbd kbd-xs">⌘</kbd><kbd class="kbd kbd-xs">↵</kbd>
			<span>or</span>
			<kbd class="kbd kbd-xs">ctrl</kbd><kbd class="kbd kbd-xs">Enter</kbd>
			<span>to add</span>
			<span class="text-base-content/30">·</span>
			<kbd class="kbd kbd-xs">esc</kbd>
			<span>to cancel</span>
		</div>
		<div class="ml-auto flex items-center gap-2">
			<button type="button" class="btn btn-sm btn-ghost" onclick={cancel}>Cancel</button>
			<button type="button" class="btn btn-sm btn-primary" disabled={!canSubmit} onclick={submit}>
				{#if submitted}
					<Check size={13} /> Added
				{:else if submitting}
					<span class="loading loading-spinner loading-xs"></span> Adding…
				{:else}
					<Plus size={13} /> Add to queue
				{/if}
			</button>
		</div>
	</div>
</div>
