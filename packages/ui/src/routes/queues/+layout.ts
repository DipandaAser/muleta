import { Rows4 } from "@lucide/svelte"
import type { CrumbFn } from "$lib/shell/crumbs"

export const _crumb: CrumbFn = () => ({
  label: "Queues",
  icon: Rows4,
})
