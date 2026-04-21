import { api, type JobDetail } from "$lib/api/client"
import type { LayoutLoad } from "./$types"

export const load: LayoutLoad = async ({ params }) => {
  let job: JobDetail | null = null
  let error: string | null = null
  let notFound = false
  try {
    const res = await api.api.v1.queues[":name"].jobs[":id"].$get({
      param: { name: params.name, id: params.id },
    })
    if (res.ok) {
      job = await res.json()
    } else {
      // Only 404 is declared as a non-200 response for this route; anything
      // else would be a runtime surprise (e.g. network failure, 5xx) which
      // the catch below will still handle via the HTTP fallback.
      notFound = true
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "failed to load job"
  }
  return { name: params.name, id: params.id, job, error, notFound }
}
