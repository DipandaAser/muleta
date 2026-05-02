<script lang="ts">
	import { browser } from "$app/environment"
	import { theme } from "$lib/shell/theme.svelte"
	import type * as MonacoNs from "monaco-editor"
	import { getMonaco } from "./editor-loader"
	import type { SupportedLang } from "./highlighter"
	import { THEME_FOR } from "./highlighter"

	interface Props {
		/** Editor contents — two-way bindable. */
		value: string
		/** Shiki language id; doubles as Monaco's language. Defaults to JSON. */
		lang?: SupportedLang
		/** Editor pixel height. Monaco needs an explicit value. */
		height?: number | string
		/** Read-only mode — disables editing but keeps highlighting. */
		readonly?: boolean
		/** Render the minimap (off by default — too dense for short payloads). */
		minimap?: boolean
		/** Extra class merged onto the container. */
		class?: string
	}

	let {
		value = $bindable(""),
		lang = "json",
		height = 220,
		readonly = false,
		minimap = false,
		class: cls = "",
	}: Props = $props()

	let host = $state<HTMLDivElement | null>(null)
	let editor: MonacoNs.editor.IStandaloneCodeEditor | null = null
	let monaco: typeof MonacoNs | null = null
	/**
	 * Set while we're applying an external `value` change — guards the
	 * `onDidChangeModelContent` listener from re-emitting the same change
	 * back into `value` and bouncing forever.
	 */
	let applyingExternal = false

	const heightCss = $derived(typeof height === "number" ? `${height}px` : height)

	$effect(() => {
		if (!browser) return
		const target = host
		if (!target) return

		let cancelled = false
		getMonaco().then((m) => {
			if (cancelled || !host) return
			monaco = m
			editor = m.editor.create(target, {
				value,
				language: lang,
				theme: THEME_FOR[theme.value],
				readOnly: readonly,
				minimap: { enabled: minimap },
				fontSize: 12.5,
				fontFamily: "var(--font-mono, ui-monospace, monospace)",
				fontLigatures: false,
				lineNumbers: "on",
				lineNumbersMinChars: 3,
				glyphMargin: false,
				folding: false,
				renderLineHighlight: "none",
				scrollBeyondLastLine: false,
				smoothScrolling: true,
				padding: { top: 8, bottom: 8 },
				automaticLayout: true,
				tabSize: 2,
				insertSpaces: true,
				wordWrap: "on",
				scrollbar: {
					verticalScrollbarSize: 8,
					horizontalScrollbarSize: 8,
				},
				occurrencesHighlight: "off",
				renderWhitespace: "none",
				overviewRulerLanes: 0,
				hideCursorInOverviewRuler: true,
			})

			editor.onDidChangeModelContent(() => {
				if (applyingExternal) return
				const next = editor!.getValue()
				if (next !== value) value = next
			})
		})

		return () => {
			cancelled = true
			editor?.dispose()
			editor = null
			monaco = null
		}
	})

	/* ─── External value updates ─────────────────────────────────────────
	   When the parent rewrites `value` (e.g. picking a job template seeds
	   `dataText`), push that into Monaco. Skip if the editor's content
	   already matches — avoids cursor jumps when the parent's `value` is
	   just echoing what Monaco itself just emitted. */
	$effect(() => {
		const v = value
		if (!editor) return
		if (editor.getValue() === v) return
		applyingExternal = true
		editor.setValue(v)
		applyingExternal = false
	})

	/* ─── Theme switching ────────────────────────────────────────────── */
	$effect(() => {
		const themeId = THEME_FOR[theme.value]
		if (monaco) monaco.editor.setTheme(themeId)
	})

	/* ─── Read-only toggling ─────────────────────────────────────────── */
	$effect(() => {
		const ro = readonly
		editor?.updateOptions({ readOnly: ro })
	})
</script>

<div class="muleta-editor {cls}" style:height={heightCss} bind:this={host}></div>

<style>
	.muleta-editor {
		border: 1px solid var(--color-base-300);
		border-radius: var(--radius-field);
		overflow: hidden;
		background: var(--color-base-100);
	}

	/* Monaco renders its UI inside a deeply nested tree of generated
	   classes; all we need to override is the outer surface so the editor
	   sits flush with the muleta border. The real colours come from the
	   Shiki-bridged theme. */
	.muleta-editor :global(.monaco-editor),
	.muleta-editor :global(.monaco-editor-background),
	.muleta-editor :global(.monaco-editor .margin) {
		background: var(--color-base-100) !important;
	}
</style>
