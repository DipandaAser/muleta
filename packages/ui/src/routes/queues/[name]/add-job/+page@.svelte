<script lang="ts">
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { api, type AddJobOptions, type AddJobRequest, type Queue } from "$lib/api/client"
	import Code from "$lib/components/code/Code.svelte"
	import CodeEditor from "$lib/components/code/CodeEditor.svelte"
	import JobNamePicker from "$lib/jobs/JobNamePicker.svelte"
	import { ArrowLeft, Check, Pause, Plus } from "@lucide/svelte"
	import { CronExpressionParser } from "cron-parser"
	import cronstrue from "cronstrue"

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

	/** Same units as the age selector but pre-multiplied to milliseconds —
	 * BullMQ's `every` field is ms, not seconds. */
	const EVERY_UNIT_MS: Record<AgeUnit, number> = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
	}

	let { data } = $props<{ data: { jobNames: string[] } }>()

	// The parent layout's loader populated `page.data.queue` and `page.data.name`.
	// Re-deriving here lets the form react to the live queue state (paused
	// flag, waiting count) without a second round-trip.
	let queue = $derived(page.data.queue as Queue | null)
	let queueName = $derived(page.params.name as string)

	let name = $state("")
	let jobId = $state("")
	let dataText = $state("{}")
	let priority = $state(0)
	let attempts = $state(3)
	let delay = $state(0)
	let delayUnit = $state<DelayUnit>("s")
	let backoffType = $state<BackoffType>("exponential")
	let backoffDelay = $state(2000)
	let removeOnComplete = $state(false)
	let removeOnCompleteCount = $state<number | null>(null)
	let removeOnCompleteAge = $state<number | null>(null)
	let removeOnCompleteAgeUnit = $state<AgeUnit>("s")
	let removeOnFail = $state(false)
	let removeOnFailCount = $state<number | null>(null)
	let removeOnFailAge = $state<number | null>(null)
	let removeOnFailAgeUnit = $state<AgeUnit>("s")
	let repeat = $state(false)
	let repeatStrategy = $state<RepeatStrategy>("pattern")
	let repeatPattern = $state("0 */15 * * * *")
	let repeatEvery = $state<number | null>(null)
	let repeatEveryUnit = $state<AgeUnit>("m")
	let repeatLimit = $state<number | null>(null)
	let repeatImmediately = $state(false)
	/**
	 * `<input type="datetime-local">` produces strings shaped like
	 * `2026-05-04T10:30` (no seconds, no timezone — local time). We hold
	 * the raw string here and convert to ISO at submit time.
	 */
	let repeatStartDate = $state("")
	let repeatEndDate = $state("")

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

	let cronExplanation = $derived.by<
		{ ok: true; text: string } | { ok: false; error: string } | null
	>(() => {
		if (!repeat || repeatStrategy !== "pattern") return null
		const pattern = repeatPattern.trim()
		if (!pattern) return null
		try {
			const text = cronstrue.toString(pattern, {
				throwExceptionOnParseError: true,
				use24HourTimeFormat: true,
			})
			return { ok: true, text }
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : "invalid cron" }
		}
	})

	let cronNextRun = $derived.by<Date | null>(() => {
		if (!repeat || repeatStrategy !== "pattern") return null
		const pattern = repeatPattern.trim()
		if (!pattern) return null
		try {
			const interval = CronExpressionParser.parse(pattern)
			return interval.next().toDate()
		} catch {
			return null
		}
	})

	/**
	 * Computed `every` interval in milliseconds. Empty / zero / negative
	 * input collapses to `null`, which means the `every` strategy is
	 * incomplete and we omit `repeat` from the request entirely. The
	 * preview pane reflects this — only a valid value materialises in
	 * the outgoing payload.
	 */
	let repeatEveryMs = $derived.by<number | null>(() => {
		if (!repeat || repeatStrategy !== "every") return null
		if (repeatEvery === null || !Number.isFinite(repeatEvery)) return null
		const ms = Math.max(0, Math.floor(repeatEvery * EVERY_UNIT_MS[repeatEveryUnit]))
		return ms > 0 ? ms : null
	})

	function formatNextRun(d: Date): string {
		// `YYYY-MM-DD HH:mm:ss` — same shape crontab.guru uses, locale-free
		// so timezone differences don't make the form's output visually
		// inconsistent across users on the same team.
		const pad = (n: number) => String(n).padStart(2, "0")
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	}

	/**
	 * Translate the form's three knobs (count, age, age-unit) into the
	 * shape BullMQ accepts on `removeOnComplete` / `removeOnFail`.
	 *   - both empty       → `true`           (remove every job immediately)
	 *   - count only       → `number`         (keep last N)
	 *   - age only         → `{ age }`        (remove older than N seconds)
	 *   - count + age      → `{ age, count }` (BullMQ AND-applies both caps)
	 *
	 * Caller still needs to gate this behind the toggle being on — when
	 * the toggle is off we don't send the field at all (BullMQ default:
	 * keep forever).
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

	/**
	 * Normalise the raw `<input type="datetime-local">` value (local time,
	 * no seconds, e.g. `"2026-05-04T10:30"`) to a UTC ISO string the
	 * server schema and BullMQ both accept. Empty / unparseable input ⇒
	 * `null` so callers can omit the field instead of sending an empty
	 * string.
	 */
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
				// Only emit `pattern` when the user has typed *something* —
				// sending `pattern: ""` would fail server-side validation.
				if (trimmed) r.pattern = trimmed
				// `immediately` is cron-only per BullMQ semantics; the field
				// is hidden from the markup when strategy === "every".
				if (repeatImmediately) r.immediately = true
			} else if (repeatEveryMs !== null) {
				r.every = repeatEveryMs
			}
			if (repeatLimit !== null && Number.isFinite(repeatLimit) && repeatLimit > 0) {
				r.limit = Math.floor(repeatLimit)
			}
			// Convert local-datetime strings to UTC ISO at the boundary —
			// the server schema validates ISO format and BullMQ stores the
			// values via `Date.parse(...)`. Empty input ⇒ omit the field.
			const startIso = toIsoOrNull(repeatStartDate)
			const endIso = toIsoOrNull(repeatEndDate)
			if (startIso) r.startDate = startIso
			if (endIso) r.endDate = endIso
			// Skip the field entirely when the user hasn't completed the
			// chosen strategy — sending `repeat: {}` would either fail
			// validation or trigger BullMQ default-fallback behaviour.
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
			// Brief flash, then jump straight to the new job's row.
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
		// Don't hijack typing inside form fields.
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

			<!-- Options -->
			<div class="flex flex-col gap-3">
				<div class="text-[11px] uppercase tracking-wide text-base-content/50 font-medium">
					Options
				</div>
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
											class="join-item px-2.5 py-2 text-[12px] font-mono-muleta transition-colors {active
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
											class="join-item px-2.5 py-2 text-[12px] font-mono-muleta transition-colors {active
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

				<!-- Toggles -->
				<div class="flex flex-col gap-2 mt-2">
					<div class="flex flex-col gap-1.5">
						<label class="flex items-center gap-2.5 text-[12px] cursor-pointer w-fit">
							<input
								type="checkbox"
								bind:checked={removeOnComplete}
								class="toggle toggle-sm toggle-primary"
							/>
							<span>removeOnComplete</span>
						</label>
						{#if removeOnComplete}
							<div
								class="ml-9 flex flex-col gap-1.5 text-[11px] text-base-content/55 font-mono-muleta"
							>
								<div class="flex items-center gap-1.5">
									<span class="w-20 shrink-0">keep last</span>
									<input
										type="number"
										min="0"
										bind:value={removeOnCompleteCount}
										placeholder="—"
										aria-label="Number of completed jobs to keep"
										class="input input-xs font-mono-muleta w-20"
									/>
									<span>jobs</span>
								</div>
								<div class="flex items-center gap-1.5">
									<span class="w-20 shrink-0">older than</span>
									<input
										type="number"
										min="0"
										bind:value={removeOnCompleteAge}
										placeholder="—"
										aria-label="Maximum age of completed jobs to keep"
										class="input input-xs font-mono-muleta w-20"
									/>
									<div class="join border border-base-300 rounded-field overflow-hidden">
										{#each ["s", "m", "h", "d"] as const as u (u)}
											{@const active = removeOnCompleteAgeUnit === u}
											<button
												type="button"
												aria-label="Age unit: {u}"
												class="join-item px-2 py-0.5 text-[10px] transition-colors {active
													? 'bg-base-300 text-base-content'
													: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
												onclick={() => (removeOnCompleteAgeUnit = u)}
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

					<div class="flex flex-col gap-1.5">
						<label class="flex items-center gap-2.5 text-[12px] cursor-pointer w-fit">
							<input
								type="checkbox"
								bind:checked={removeOnFail}
								class="toggle toggle-sm toggle-primary"
							/>
							<span>removeOnFail</span>
						</label>
						{#if removeOnFail}
							<div
								class="ml-9 flex flex-col gap-1.5 text-[11px] text-base-content/55 font-mono-muleta"
							>
								<div class="flex items-center gap-1.5">
									<span class="w-20 shrink-0">keep last</span>
									<input
										type="number"
										min="0"
										bind:value={removeOnFailCount}
										placeholder="—"
										aria-label="Number of failed jobs to keep"
										class="input input-xs font-mono-muleta w-20"
									/>
									<span>jobs</span>
								</div>
								<div class="flex items-center gap-1.5">
									<span class="w-20 shrink-0">older than</span>
									<input
										type="number"
										min="0"
										bind:value={removeOnFailAge}
										placeholder="—"
										aria-label="Maximum age of failed jobs to keep"
										class="input input-xs font-mono-muleta w-20"
									/>
									<div class="join border border-base-300 rounded-field overflow-hidden">
										{#each ["s", "m", "h", "d"] as const as u (u)}
											{@const active = removeOnFailAgeUnit === u}
											<button
												type="button"
												aria-label="Age unit: {u}"
												class="join-item px-2 py-0.5 text-[10px] transition-colors {active
													? 'bg-base-300 text-base-content'
													: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
												onclick={() => (removeOnFailAgeUnit = u)}
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
					<label class="flex items-center gap-2.5 text-[12px] cursor-pointer w-fit">
						<input type="checkbox" bind:checked={repeat} class="toggle toggle-sm toggle-primary" />
						<span>Repeat</span>
					</label>
					{#if repeat}
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
										{@const active = repeatStrategy === opt.id}
										<button
											type="button"
											class="join-item px-2.5 py-0.5 text-[11px] transition-colors {active
												? 'bg-base-300 text-base-content'
												: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
											onclick={() => (repeatStrategy = opt.id)}
										>
											{opt.label}
										</button>
									{/each}
								</div>
							</div>

							{#if repeatStrategy === "pattern"}
								<div class="flex flex-col gap-1.5">
									<input
										type="text"
										bind:value={repeatPattern}
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
												<span class="font-mono-muleta text-[11px]">
													{cronExplanation.error}
												</span>
											{/if}
										</div>
									{/if}
									{#if cronNextRun}
										<div class="text-[11px] flex items-center gap-1.5 text-base-content/55">
											<span>next at</span>
											<span class="font-mono-muleta tnum text-base-content/80">
												{formatNextRun(cronNextRun)}
											</span>
										</div>
									{/if}
									<label class="flex items-center gap-2 text-[11px] cursor-pointer w-fit">
										<input
											type="checkbox"
											bind:checked={repeatImmediately}
											class="toggle toggle-xs toggle-primary"
										/>
										<span class="text-base-content/55 font-mono-muleta">
											fire immediately on add
										</span>
									</label>
								</div>
							{:else}
								<!-- Fixed-interval strategy — `every` is in milliseconds when
								     it lands in BullMQ's RepeatOptions; the unit selector
								     just multiplies for convenience. -->
								<div
									class="flex flex-col gap-1.5 text-[11px] text-base-content/55 font-mono-muleta"
								>
									<div class="flex items-center gap-1.5">
										<span class="w-16 shrink-0">every</span>
										<input
											type="number"
											min="1"
											bind:value={repeatEvery}
											placeholder="—"
											aria-label="Repeat interval"
											class="input input-xs font-mono-muleta w-20"
										/>
										<div class="join border border-base-300 rounded-field overflow-hidden">
											{#each ["s", "m", "h", "d"] as const as u (u)}
												{@const active = repeatEveryUnit === u}
												<button
													type="button"
													aria-label="Interval unit: {u}"
													class="join-item px-2 py-0.5 text-[10px] transition-colors {active
														? 'bg-base-300 text-base-content'
														: 'text-base-content/55 hover:bg-base-200 hover:text-base-content'}"
													onclick={() => (repeatEveryUnit = u)}
												>
													{u}
												</button>
											{/each}
										</div>
									</div>
									{#if repeatEveryMs !== null}
										<span class="text-base-content/40 ml-17">
											= {repeatEveryMs.toLocaleString()} ms
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
										bind:value={repeatLimit}
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
										bind:value={repeatStartDate}
										aria-label="Schedule start date — empty to start now"
										class="input input-xs font-mono-muleta"
									/>
									<span class="text-base-content/40">empty = now</span>
								</div>
								<div class="flex items-center gap-1.5">
									<span class="w-16 shrink-0">end at</span>
									<input
										type="datetime-local"
										bind:value={repeatEndDate}
										aria-label="Schedule end date — empty for no end"
										class="input input-xs font-mono-muleta"
									/>
									<span class="text-base-content/40">empty = no end</span>
								</div>
							</div>

							{#if jobId.trim()}
								<span class="text-[11px] text-base-content/50">
									BullMQ ignores Job ID for repeating jobs — it derives a deterministic id from the
									schedule.
								</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<aside
			id="preview-column"
			class="lg:w-90 lg:shrink-0 flex flex-col gap-3 pt-5 pr-10 pl-5 pb-24 bg-base-200 overflow-y-auto"
		>
			<div
				class="text-[11px] uppercase tracking-wide text-base-content/50 font-medium flex items-center gap-2"
			>
				Preview
				<span class="text-base-content/40 normal-case font-normal tracking-normal">
					what will execute
				</span>
			</div>
			<Code code={preview} lang="ts" />

			<dl class="flex flex-col gap-1.5 text-[12px] mt-2">
				<div class="flex items-baseline gap-3">
					<dt class="text-base-content/50">queue</dt>
					<dd class="font-mono-muleta truncate ml-auto">{queueName}</dd>
				</div>
				<div class="flex items-baseline gap-3">
					<dt class="text-base-content/50">waiting</dt>
					<dd class="font-mono-muleta tnum ml-auto">
						{queue?.counts.waiting?.toLocaleString() ?? "—"}
					</dd>
				</div>
				<div class="flex items-baseline gap-3">
					<dt class="text-base-content/50">paused</dt>
					<dd class="font-mono-muleta ml-auto">{queue?.isPaused ? "yes" : "no"}</dd>
				</div>
			</dl>

			{#if queue?.isPaused}
				<div
					class="flex items-start gap-2 text-[11.5px] p-2.5 rounded border"
					style:background="var(--color-state-paused-bg)"
					style:color="var(--color-state-paused)"
					style:border-color="color-mix(in oklab, var(--color-state-paused) 30%, transparent)"
				>
					<Pause size={12} class="mt-0.5 shrink-0" />
					<span>
						Queue is paused. The job will be enqueued but won't run until the queue is resumed.
					</span>
				</div>
			{/if}

			{#if serverError}
				<div
					class="text-[12px] p-2.5 rounded border"
					style:background="color-mix(in oklab, var(--color-error) 12%, transparent)"
					style:color="var(--color-error)"
					style:border-color="color-mix(in oklab, var(--color-error) 30%, transparent)"
				>
					{serverError}
				</div>
			{/if}
		</aside>
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
