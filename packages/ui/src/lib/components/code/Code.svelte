<script lang="ts">
	import { theme } from "$lib/shell/theme.svelte"
	import { Check, Copy } from "@lucide/svelte"
	import { getHighlighter, type SupportedLang, THEME_FOR } from "./highlighter"

	interface Props {
		/** Source to render. */
		code: string
		/** Shiki language id. Defaults to `ts` since it covers the live `await queue.add(...)` preview. */
		lang?: SupportedLang
		/** Optional file label rendered above the code. */
		filename?: string
		/** Show the copy-to-clipboard button (top-right). Defaults to true. */
		showCopy?: boolean
		/** Soft-wrap long lines instead of horizontal scroll. Defaults to false. */
		wrap?: boolean
		/** Extra class merged onto the root container. */
		class?: string
	}

	let {
		code,
		lang = "ts",
		filename,
		showCopy = true,
		wrap = false,
		class: cls = "",
	}: Props = $props()

	/**
	 * Highlighted HTML from Shiki. The `$effect` below seeds it with an
	 * unhighlighted `<pre>` fallback synchronously on first run so the
	 * block has visible content during the ~50 ms the highlighter takes
	 * on cold cache (after that it's instant — singleton).
	 */
	let html = $state<string>("")
	let copied = $state(false)

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;")
	}

	function rawFallback(s: string): string {
		return `<pre class="shiki-fallback"><code>${escapeHtml(s)}</code></pre>`
	}

	/**
	 * Re-highlight whenever code, language, or theme changes. Shiki's
	 * `codeToHtml` returns a self-contained `<pre><code>` tree with inline
	 * span colours, so swapping it via `{@html}` is safe — Shiki sanitises
	 * the input and we only ever pass user-controlled *text*, never HTML.
	 */
	$effect(() => {
		const themeId = THEME_FOR[theme.value]
		const currentCode = code
		const currentLang = lang
		// Seed with the un-highlighted fallback immediately so the block
		// renders content during Shiki's first-load (~50 ms) and on every
		// subsequent code change before the highlighter resolves.
		html = rawFallback(currentCode)
		let cancelled = false
		getHighlighter()
			.then((h) => {
				if (cancelled) return
				html = h.codeToHtml(currentCode, { lang: currentLang, theme: themeId })
			})
			.catch(() => {
				// On highlighter failure, keep the raw fallback — never break
				// the page over a missing grammar.
			})
		return () => {
			cancelled = true
		}
	})

	async function copy() {
		try {
			await navigator.clipboard.writeText(code)
			copied = true
			setTimeout(() => (copied = false), 1200)
		} catch {
			// Clipboard API can fail (insecure context, blocked permission).
			// Silent — copy is a convenience, not load-bearing.
		}
	}
</script>

<div class="muleta-code relative {cls}" class:wrap>
	{#if filename}
		<header
			class="font-mono-muleta text-[11px] text-base-content/55 px-3 py-1.5 border-b border-base-300 bg-base-200/50"
		>
			{filename}
		</header>
	{/if}

	<div class="muleta-code-body">
		{@html html}
	</div>

	{#if showCopy}
		<button
			type="button"
			class="absolute top-1.5 right-1.5 p-1 rounded text-[11px] text-base-content/50 hover:text-base-content hover:bg-base-300 transition-colors"
			aria-label={copied ? "Copied" : "Copy code"}
			onclick={copy}
		>
			{#if copied}
				<Check size={12} />
			{:else}
				<span class="flex gap-1">
					<Copy size={12} /> Copy
				</span>
			{/if}
		</button>
	{/if}
</div>

<style>
	.muleta-code {
		border: 1px solid var(--color-base-300);
		border-radius: var(--radius-field);
		overflow: hidden;
		background: var(--color-base-200);
	}

	.muleta-code-body :global(pre) {
		margin: 0;
		padding: 0.75rem;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-feature-settings: "zero", "ss02";
		font-size: 11.5px;
		line-height: 1.6;
		/* Override Shiki's theme bg — keep the dashboard's surface colour
		   so code blocks slot into the form without a colour break. */
		background: transparent !important;
	}

	.muleta-code-body :global(code) {
		font-family: inherit;
	}

	/* Soft-wrap variant — used by short-form previews where horizontal
	   scrolling would feel awkward. */
	.muleta-code.wrap :global(pre) {
		white-space: pre-wrap;
		overflow-x: hidden;
		word-break: break-word;
	}

	/* Pre-highlight fallback styling — same metrics as the highlighted
	   output so swapping doesn't shift the layout. */
	.muleta-code-body :global(.shiki-fallback) {
		color: var(--color-base-content);
	}
</style>
