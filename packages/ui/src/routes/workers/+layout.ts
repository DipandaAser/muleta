import { Server } from "@lucide/svelte"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { LayoutLoad } from "./$types"

export const load = (async () => {
  return {}
}) satisfies LayoutLoad

export const _crumb: CrumbFn = () => ({
  label: "Workers",
  icon: Server,
})
