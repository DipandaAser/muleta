import { api } from "$lib/api/client"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

/**
 * Loads the global job-name list so the picker can offer suggestions
 * straight away. The parent layout already loaded the queue itself, so
 * we don't re-fetch it here  the page reads `data.queue` from the
 * inherited layout data.
 */
export const load: PageLoad = async () => {
  let jobNames: string[] = []
  try {
    const res = await api.api.v1.jobs.names.$get()
    if (res.ok) {
      const body = await res.json()
      jobNames = body.names
    }
  } catch {
    // Picker degrades to free-text. No need to surface the error.
  }
  return { jobNames }
}

export const _crumb: CrumbFn = () => ({
  label: "Add job",
})
