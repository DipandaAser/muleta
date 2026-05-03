import { api, type JobDetail } from "$lib/api/client"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

/**
 * Loads the global job-name list so the picker can offer suggestions
 * straight away. The parent layout already loaded the queue itself, so
 * we don't re-fetch it here — the page reads `data.queue` from the
 * inherited layout data.
 *
 * If `?from=<id>` is present, also fetch that job so the form can
 * pre-fill from it (the "Duplicate with overrides" flow). Failures are
 * surfaced as `fromError` rather than blocking the form — the user
 * can still hand-edit fields.
 */
export const load: PageLoad = async ({ params, url }) => {
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

  let sourceJob: JobDetail | null = null
  let fromError: string | null = null
  const fromId = url.searchParams.get("from")
  if (fromId) {
    try {
      const res = await api.api.v1.queues[":name"].jobs[":id"].$get({
        param: { name: params.name, id: fromId },
      })
      if (res.ok) {
        sourceJob = (await res.json()) as JobDetail
      } else {
        fromError = `Source job ${fromId} not found in queue ${params.name} (HTTP ${res.status}).`
      }
    } catch (e) {
      fromError = e instanceof Error ? e.message : "failed to load source job"
    }
  }

  return { jobNames, sourceJob, fromError }
}

export const _crumb: CrumbFn = () => ({
  label: "Add job",
})
