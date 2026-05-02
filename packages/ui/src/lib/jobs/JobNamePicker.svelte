<script lang="ts">
	import { Check, ChevronDown, FileCode, Folder, Search, X } from "@lucide/svelte"
	import { tick } from "svelte"

	interface Props {
		/** Current value — flows back as a free-text string. */
		value: string
		/** Known job names (from the server's job-name index). */
		suggestions: string[]
		/** Set when the user picks a known name OR types free text. */
		onChange: (next: string) => void
		/** Optional id for label association. */
		id?: string
	}

	let { value = $bindable(), suggestions, onChange, id }: Props = $props()

	/**
	 * AdonisJS / file-path-based BullMQ deployments produce names like
	 * `file:///Users/aser/.../app/jobs/event_notifications/foo_job.ts`. Showing
	 * the raw name in a flat list is unreadable; instead we strip the longest
	 * common prefix across all known names, then split each name into
	 * `{ folder, display }` so the picker can render section headers.
	 */
	interface Entry {
		raw: string
		display: string
		folder: string
	}

	function safeDecode(s: string): string {
		try {
			return decodeURIComponent(s)
		} catch {
			return s
		}
	}

	function longestCommonPrefix(strs: string[]): string {
		if (strs.length === 0) return ""
		let prefix = strs[0]!
		for (let i = 1; i < strs.length; i++) {
			while (!strs[i]!.startsWith(prefix)) {
				prefix = prefix.slice(0, -1)
				if (prefix === "") return ""
			}
		}
		return prefix
	}

	/**
	 * Recognised code-root directories. When the longest common prefix dives
	 * past one of these, stop stripping so the project structure
	 * (e.g. `app/jobs/event_notifications`) stays visible in section headers
	 * — otherwise every folder collapses to a single leaf segment with no
	 * parent context.
	 */
	const ROOT_MARKERS = ["app", "src", "lib", "packages", "pkg", "jobs", "tasks"]

	function trimPrefixToRoot(prefix: string): string {
		for (const marker of ROOT_MARKERS) {
			const idx = prefix.lastIndexOf(`/${marker}/`)
			if (idx >= 0) return prefix.slice(0, idx + 1) // keep the leading slash
		}
		return prefix
	}

	function parseEntries(names: string[]): Entry[] {
		const cleaned = names.map((n) =>
			n.startsWith("file://") ? safeDecode(n.replace(/^file:\/+/, "/")) : n,
		)
		// Only path-like names contribute to common-prefix detection, plain names shouldn't drag the prefix down to "".
		const pathLike = cleaned.filter((s) => s.includes("/"))
		let prefix = ""
		if (pathLike.length > 1) {
			const common = longestCommonPrefix(pathLike)
			const lastSlash = common.lastIndexOf("/")
			prefix = lastSlash >= 0 ? common.slice(0, lastSlash + 1) : ""
			prefix = trimPrefixToRoot(prefix)
		}
		return names.map((raw, i) => {
			let s = cleaned[i]!
			if (prefix && s.startsWith(prefix)) s = s.slice(prefix.length)
			const lastSlash = s.lastIndexOf("/")
			if (lastSlash >= 0) {
				return { raw, display: s.slice(lastSlash + 1), folder: s.slice(0, lastSlash) }
			}
			return { raw, display: s, folder: "" }
		})
	}

	let entries = $derived(parseEntries(suggestions))
	let currentEntry = $derived(entries.find((e) => e.raw === value) ?? null)

	let open = $state(false)
	let query = $state("")
	let highlighted = $state(0)
	let wrapEl = $state<HTMLDivElement | null>(null)
	let searchEl = $state<HTMLInputElement | null>(null)

	let filtered = $derived.by(() => {
		const q = query.trim().toLowerCase()
		if (!q) return entries
		return entries.filter(
			(e) =>
				e.display.toLowerCase().includes(q) ||
				e.folder.toLowerCase().includes(q) ||
				e.raw.toLowerCase().includes(q),
		)
	})

	/**
	 * Walk `filtered` once, breaking into runs of contiguous folders. Each
	 * item carries its `index` into the flat `filtered` array so keyboard
	 * navigation (which uses a single `highlighted` integer) stays simple.
	 */
	let groups = $derived.by(() => {
		const out: { folder: string; items: Array<{ entry: Entry; index: number }> }[] = []
		filtered.forEach((entry, index) => {
			const last = out[out.length - 1]
			if (!last || last.folder !== entry.folder) {
				out.push({ folder: entry.folder, items: [{ entry, index }] })
			} else {
				last.items.push({ entry, index })
			}
		})
		return out
	})

	// Reset highlight whenever the visible set changes so arrow-key nav doesn't
	// land on a stale (now-out-of-range) row.
	$effect(() => {
		void filtered
		highlighted = 0
	})

	function openMenu() {
		if (open) return
		open = true
		// Focus the search input on the next microtask so click handlers can
		// finish first (otherwise focus jumps back to the trigger).
		tick().then(() => searchEl?.focus())
	}

	function closeMenu() {
		open = false
		query = ""
	}

	function pick(entry: Entry) {
		onChange(entry.raw)
		closeMenu()
	}

	function commitTyped() {
		// Free-text path: take the search query as the new name.
		const v = query.trim()
		if (v.length > 0) {
			onChange(v)
		}
		closeMenu()
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return
		if (e.key === "Escape") {
			e.preventDefault()
			closeMenu()
		} else if (e.key === "ArrowDown") {
			e.preventDefault()
			if (filtered.length === 0) return
			highlighted = (highlighted + 1) % filtered.length
		} else if (e.key === "ArrowUp") {
			e.preventDefault()
			if (filtered.length === 0) return
			highlighted = (highlighted - 1 + filtered.length) % filtered.length
		} else if (e.key === "Enter") {
			e.preventDefault()
			const target = filtered[highlighted]
			if (target) pick(target)
			else commitTyped()
		}
	}

	function onDocumentMouseDown(e: MouseEvent) {
		if (!open) return
		if (wrapEl && !wrapEl.contains(e.target as Node)) closeMenu()
	}

	$effect(() => {
		if (!open) return
		document.addEventListener("mousedown", onDocumentMouseDown)
		return () => document.removeEventListener("mousedown", onDocumentMouseDown)
	})
</script>

<div
	bind:this={wrapEl}
	class="relative"
	onkeydown={onKey}
	role="combobox"
	aria-expanded={open}
	aria-controls="{id}-menu"
	tabindex="-1"
>
	<button
		type="button"
		{id}
		class="flex items-center w-full gap-2 px-3 py-2 text-left rounded-field border border-base-300 bg-base-200 hover:border-base-content/30 transition-colors min-w-0"
		class:border-primary={open}
		onclick={openMenu}
	>
		<FileCode size={13} class="text-base-content/40 shrink-0" />
		<span class="font-mono-muleta text-[12.5px] truncate flex-1 min-w-0">
			{#if currentEntry}
				{currentEntry.display}
			{:else if value}
				{value}
			{:else}
				<span class="text-base-content/40">Select or type a job name…</span>
			{/if}
		</span>
		{#if currentEntry?.folder}
			<span
				class="font-mono-muleta text-[11px] text-base-content/40 truncate shrink-0 max-w-[40%] hidden sm:inline-block"
			>
				{currentEntry.folder}/
			</span>
		{/if}
		<span
			class="text-base-content/40 shrink-0 transition-transform inline-flex"
			style:transform={open ? "rotate(180deg)" : "none"}
		>
			<ChevronDown size={13} />
		</span>
	</button>

	{#if open}
		<div
			id="{id}-menu"
			role="listbox"
			class="absolute z-50 mt-1 w-full rounded-field border border-base-300 bg-base-100 shadow-lg overflow-hidden"
		>
			<div class="flex items-center gap-2 px-3 py-2 border-b border-base-300">
				<Search size={11} class="text-base-content/40" />
				<input
					bind:this={searchEl}
					bind:value={query}
					type="text"
					placeholder="Type to filter or set a new name…"
					class="flex-1 bg-transparent outline-none text-[12.5px] font-mono-muleta placeholder:text-base-content/40"
					spellcheck="false"
					autocomplete="off"
				/>
				{#if query}
					<button
						type="button"
						class="text-base-content/40 hover:text-base-content"
						onclick={() => (query = "")}
						aria-label="Clear search"
					>
						<X size={11} />
					</button>
				{/if}
				<span class="font-mono-muleta text-[10.5px] text-base-content/40 tnum">
					{filtered.length}
				</span>
			</div>

			<div class="max-h-80 overflow-y-auto py-1">
				{#if filtered.length === 0}
					<div class="px-3 py-3 text-[12px] text-base-content/50">
						{#if query}
							No matches.
							<button
								type="button"
								class="font-mono-muleta text-primary hover:underline"
								onclick={commitTyped}
							>
								Use "{query}" as the job name
							</button>
						{:else}
							No suggestions yet — type a job name to enqueue.
						{/if}
					</div>
				{:else}
					{#each groups as group, gi (group.folder + ":" + gi)}
						{@const lastSlash = group.folder.lastIndexOf("/")}
						{@const leaf = lastSlash >= 0 ? group.folder.slice(lastSlash + 1) : group.folder}
						{@const parent = lastSlash >= 0 ? group.folder.slice(0, lastSlash) : ""}
						<div class:border-t={gi > 0} class="border-base-300">
							{#if group.folder}
								<div
									class="flex items-baseline gap-1.5 px-3 pt-2 pb-1 text-[11px] text-base-content/70"
								>
									<Folder size={11} class="text-primary shrink-0 self-center" />
									<span class="font-mono-muleta truncate">{leaf}</span>
									{#if parent}
										<span
											class="font-mono-muleta text-[10px] text-base-content/40 truncate min-w-0"
										>
											from {parent}
										</span>
									{/if}
								</div>
							{/if}
							{#each group.items as item (item.entry.raw)}
								{@const isSelected = value === item.entry.raw}
								{@const isHighlighted = item.index === highlighted}
								<button
									type="button"
									role="option"
									aria-selected={isSelected}
									class="flex items-center gap-2 w-full pl-7 pr-3 py-1.5 text-left text-[12.5px] font-mono-muleta transition-colors"
									class:bg-base-200={isHighlighted && !isSelected}
									style:background={isSelected
										? "color-mix(in oklab, var(--color-primary) 12%, transparent)"
										: undefined}
									onmouseenter={() => (highlighted = item.index)}
									onclick={() => pick(item.entry)}
								>
									<FileCode size={11} class="text-base-content/40 shrink-0" />
									<span class="truncate flex-1">{item.entry.display}</span>
									{#if isSelected}
										<Check size={11} class="text-primary shrink-0" />
									{/if}
								</button>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<div
				class="border-t border-base-300 px-3 py-2 flex items-center gap-2 text-[10.5px] text-base-content/50 font-mono-muleta"
			>
				<kbd class="kbd kbd-xs">↑</kbd><kbd class="kbd kbd-xs">↓</kbd>
				<span>navigate</span>
				<span class="text-base-content/30">·</span>
				<kbd class="kbd kbd-xs">↵</kbd>
				<span>select</span>
			</div>
		</div>
	{/if}
</div>
