import type { CrumbFn } from "$lib/shell/crumbs"

/**
 * Adds the `Jobs` crumb for both `/queues/[name]/jobs` (listing) and
 * `/queues/[name]/jobs/[id]/...` (detail). Static — depends only on
 * `params.name` — so no load is needed.
 */
export const _crumb: CrumbFn = () => ({
  label: "Jobs",
})
