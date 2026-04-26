<script lang="ts">
	import { Check, Copy } from "@lucide/svelte"
	import type { Tab } from "../lib/install"

	// Install widget. npm is deferred (no @muleta-dev npm scope published
	// yet). Two channels: a `docker run` for kicking the tires, and a
	// self-contained `docker compose` one-liner that stamps a compose.yml
	// in cwd then `docker compose up` — same shape as the standalone
	// Docker compose example in apps/standalone, but as one shell command.
	//
	// Both the raw command (`commands`) and a shiki-prerendered HTML
	// version (`cmdHtml`) come in as props. Highlighting is done at build
	// time in apps/site/src/lib/install.ts so shiki itself never ships to
	// the client — this island only flips between strings.

	interface Props {
		commands: Record<Tab, string>
		cmdHtml: Record<Tab, string>
	}

	let { commands, cmdHtml }: Props = $props()

	let activeTab = $state<Tab>("docker")
	// Detect multi-line content from the rendered shiki HTML — shiki emits
	// a literal `\n` between each `<span class="line">`. We can't infer
	// from the raw command alone since the compose.yaml tab's command is a
	// single-line curl but its displayed body (the actual file content) is
	// multi-line. When multi-line, the widget grows vertically and pins
	// the prompt + copy button to the top.
	let multiline = $derived(cmdHtml[activeTab].includes("\n"))
	let copied = $state(false)
	let copyTimer: ReturnType<typeof setTimeout> | null = null

	async function copy() {
		try {
			await navigator.clipboard.writeText(commands[activeTab])
			copied = true
			if (copyTimer) clearTimeout(copyTimer)
			copyTimer = setTimeout(() => {
				copied = false
			}, 1200)
		} catch {
			/* clipboard blocked; ignore */
		}
	}
</script>

<div class="install-tabbed">
	<div class="install-tabs" role="tablist" aria-label="Install method">
		<button
			class="t"
			class:on={activeTab === "docker"}
			type="button"
			role="tab"
			aria-selected={activeTab === "docker"}
			onclick={() => (activeTab = "docker")}
		>
			<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
				<path
					d="M4.8 10.4h2v2h-2zM7.2 10.4h2v2h-2zM9.6 10.4h2v2h-2zM12 10.4h2v2h-2zM7.2 8h2v2h-2zM9.6 8h2v2h-2zM12 8h2v2h-2zM12 5.6h2v2h-2zM14.4 10.4h2v2h-2zM22 11.2c-.6-.4-1.4-.5-2-.4-.2-.6-.6-1.2-1.1-1.6l-.4-.2-.2.4c-.3.5-.5 1.3-.3 2 .1.3.3.6.5.8-.6.3-1.4.5-2 .5H1.9c-.2 0-.4.2-.4.4-.1 1.1.1 2.5.7 3.7 1.1 2 2.8 2.4 4.8 2.4 4.5 0 8.2-2 9.9-5.8 1.1 0 2.3-.3 2.9-1.2l.3-.3-.3-.3z"
				></path>
			</svg>
			docker
		</button>
		<button
			class="t"
			class:on={activeTab === "compose"}
			type="button"
			role="tab"
			aria-selected={activeTab === "compose"}
			onclick={() => (activeTab = "compose")}
		>
			<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
				<path
					d="M4.8 10.4h2v2h-2zM7.2 10.4h2v2h-2zM9.6 10.4h2v2h-2zM12 10.4h2v2h-2zM7.2 8h2v2h-2zM9.6 8h2v2h-2zM12 8h2v2h-2zM12 5.6h2v2h-2zM14.4 10.4h2v2h-2zM22 11.2c-.6-.4-1.4-.5-2-.4-.2-.6-.6-1.2-1.1-1.6l-.4-.2-.2.4c-.3.5-.5 1.3-.3 2 .1.3.3.6.5.8-.6.3-1.4.5-2 .5H1.9c-.2 0-.4.2-.4.4-.1 1.1.1 2.5.7 3.7 1.1 2 2.8 2.4 4.8 2.4 4.5 0 8.2-2 9.9-5.8 1.1 0 2.3-.3 2.9-1.2l.3-.3-.3-.3z"
				></path>
			</svg>
			compose
		</button>
		<button
			class="t"
			class:on={activeTab === "compose.yaml"}
			type="button"
			role="tab"
			aria-selected={activeTab === "compose.yaml"}
			onclick={() => (activeTab = "compose.yaml")}
		>
			<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
				<path
					d="M4.8 10.4h2v2h-2zM7.2 10.4h2v2h-2zM9.6 10.4h2v2h-2zM12 10.4h2v2h-2zM7.2 8h2v2h-2zM9.6 8h2v2h-2zM12 8h2v2h-2zM12 5.6h2v2h-2zM14.4 10.4h2v2h-2zM22 11.2c-.6-.4-1.4-.5-2-.4-.2-.6-.6-1.２-1.1-1.6l-.4-.２-.２.4c-.3.5-.5 1.3-.3 ２ .1.3.3.6.5.8-.6.3-1.4.5-２ .5H1.9c-.２ 0-.４.２-.４.４-.１ 1.１.１ ２.５.7 3.7 1.１ ２ ２.8 ２.４ 4.8 ２.４ 4.5 0 8.２-２ 9.9-5.8 1.１ 0 ₂-.3 ₂-1l-.3-.3-.3z"
				></path>
			</svg>
			compose.yaml
		</button>
		<span class="t spacer"></span>
	</div>
	<div class="install-body" class:multiline>
		<span class="pr">$</span>
		<span class="cmd">{@html cmdHtml[activeTab]}</span>
		<button class="copy" class:ok={copied} type="button" aria-label="Copy command" onclick={copy}>
			{#if copied}
				<Check viewBox="0 0 24 24" width="12" height="12" />
			{:else}
				<Copy viewBox="0 0 24 24" width="12" height="12" />
			{/if}
		</button>
	</div>
</div>

<style>
	.install-tabbed {
		display: inline-flex;
		flex-direction: column;
		background: var(--bg-1);
		border: 1px solid var(--border);
		border-radius: var(--r-2);
		overflow: hidden;
		min-width: 340px;
	}
	.install-tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
		background: var(--bg-2);
	}
	.install-tabs .t {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 0 12px;
		height: 28px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--fg-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-right: 1px solid var(--border);
	}
	.install-tabs .t svg {
		width: 11px;
		height: 11px;
	}
	.install-tabs .t.on {
		color: var(--fg);
		background: var(--bg-1);
		position: relative;
	}
	.install-tabs .t.on::after {
		content: "";
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 1px;
		background: var(--accent);
	}
	.install-tabs .t:hover:not(.on) {
		color: var(--fg-1);
	}
	.install-tabs .spacer {
		flex: 1;
		border-right: 0;
	}
	.install-body {
		display: flex;
		align-items: center;
		height: 40px;
		padding: 0 4px 0 14px;
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--fg);
		gap: 10px;
	}
	/* Multi-line content (compose one-liner, compose.yaml view): grow
	   vertically, pin prompt + copy button to the top so the YAML reads
	   naturally below them. */
	.install-body.multiline {
		height: auto;
		align-items: flex-start;
		padding: 10px 4px 10px 14px;
	}
	.install-body.multiline .pr {
		padding-top: 1px;
	}
	.install-body.multiline .copy {
		position: sticky;
		top: 6px;
	}
	.install-body .pr {
		color: var(--fg-3);
	}
	.install-body .cmd {
		flex: 1;
		min-width: 0;
		/* `pre` honors literal `\n` between shiki's `<span class="line">`
		   wrappers, so the multi-line compose YAML renders as you'd expect.
		   Single-line content has no newlines so it still lays out on one
		   line; horizontal overflow scrolls inside this element only. */
		white-space: pre;
		overflow: auto;
		max-height: 280px;
		scrollbar-width: none;
	}
	.install-body .cmd::-webkit-scrollbar {
		display: none;
	}
	/* shiki output: inherit the widget's font + size. The line wrapper is
	   block by default; that's fine for multi-line. For single-line we
	   collapse it to inline so layout stays compact. */
	.install-body .cmd :global(.line),
	.install-body .cmd :global(.line span) {
		font-family: inherit;
		font-size: inherit;
	}
	.install-body:not(.multiline) .cmd :global(.line) {
		display: inline;
	}
	.install-body .copy {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		color: var(--fg-2);
		border-radius: var(--r-1);
		cursor: pointer;
		background: transparent;
		border: 0;
		flex-shrink: 0;
	}
	.install-body .copy:hover {
		background: var(--bg-hover);
		color: var(--fg);
	}
	.install-body .copy.ok {
		color: var(--st-completed-fg);
	}
</style>
