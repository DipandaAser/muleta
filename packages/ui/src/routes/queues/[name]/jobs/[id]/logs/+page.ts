import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

export const _crumb: CrumbFn = () => ({
  label: "Logs",
})

export const load = (async () => {
  return {}
}) satisfies PageLoad
