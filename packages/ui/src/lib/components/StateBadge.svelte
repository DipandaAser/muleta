<script lang="ts">
import type { JobState } from "$lib/api/client"
import { ArrowUp, Check, Clock, Pause, Play, X } from "@lucide/svelte"
import type { Component } from "svelte"

interface Props {
  state: JobState
  /** Drop the icon (e.g. when used inside a filter chip that already has a dot). */
  iconless?: boolean
}

let { state, iconless = false }: Props = $props()

const PALETTE: Record<JobState, { fg: string; bg: string; icon: Component }> = {
  waiting: {
    fg: "var(--color-state-waiting)",
    bg: "color-mix(in oklab, var(--color-state-waiting) 15%, transparent)",
    icon: Clock,
  },
  active: {
    fg: "var(--color-info)",
    bg: "color-mix(in oklab, var(--color-info) 15%, transparent)",
    icon: Play,
  },
  completed: {
    fg: "var(--color-success)",
    bg: "color-mix(in oklab, var(--color-success) 15%, transparent)",
    icon: Check,
  },
  failed: {
    fg: "var(--color-error)",
    bg: "color-mix(in oklab, var(--color-error) 15%, transparent)",
    icon: X,
  },
  delayed: {
    fg: "var(--color-warning)",
    bg: "color-mix(in oklab, var(--color-warning) 15%, transparent)",
    icon: Clock,
  },
  paused: {
    fg: "var(--color-state-paused)",
    bg: "var(--color-state-paused-bg)",
    icon: Pause,
  },
  prioritized: {
    fg: "var(--color-state-prioritized)",
    bg: "var(--color-state-prioritized-bg)",
    icon: ArrowUp,
  },
  "waiting-children": {
    fg: "var(--color-state-waiting)",
    bg: "color-mix(in oklab, var(--color-state-waiting) 15%, transparent)",
    icon: Clock,
  },
}

let palette = $derived(PALETTE[state])
let Ico = $derived(palette.icon)
</script>

<span
  class="font-mono-muleta text-[10.5px] px-1.5 py-0.5 rounded leading-none inline-flex items-center gap-1"
  style:color={palette.fg}
  style:background={palette.bg}
>
  {#if !iconless}
    <Ico size={10} />
  {/if}
  {state}
</span>
