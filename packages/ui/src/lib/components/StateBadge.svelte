<script lang="ts">
import type { JobState } from "$lib/api/client"
import { Check, Clock, Crown, Pause, Play, X } from "@lucide/svelte"
import type { Component } from "svelte"

interface Props {
  state: JobState
}

let { state }: Props = $props()

/**
 * Maps BullMQ states to daisyUI's semantic badge colors (using the `soft`
 * variant for dark bg + saturated fg). States outside daisyUI's palette
 * (`waiting`, `paused`, `prioritized`) get custom CSS vars from our theme,
 * because `badge-neutral` collapses to near-base-100 on dark mode.
 */
function stateStyle(varName: string): string {
  return `color: var(--color-state-${varName}); background: var(--color-state-${varName}-bg); border-color: color-mix(in oklab, var(--color-state-${varName}) 25%, transparent);`
}

const CONFIG: Record<JobState, { classes: string; style: string; icon: Component }> = {
  waiting: { classes: "", style: stateStyle("waiting"), icon: Clock },
  active: { classes: "badge-info badge-soft", style: "", icon: Play },
  completed: { classes: "badge-success badge-soft", style: "", icon: Check },
  failed: { classes: "badge-error badge-soft", style: "", icon: X },
  delayed: { classes: "badge-warning badge-soft", style: "", icon: Clock },
  paused: { classes: "", style: stateStyle("paused"), icon: Pause },
  prioritized: { classes: "", style: stateStyle("prioritized"), icon: Crown },
  "waiting-children": {
    classes: "",
    style: stateStyle("waiting"),
    icon: Clock,
  },
}

let cfg = $derived(CONFIG[state])
let Ico = $derived(cfg.icon)
</script>

<span class="badge badge-md font-mono-muleta gap-1 {cfg.classes}" style={cfg.style}>
  <Ico size={10} />
  {state}
</span>
