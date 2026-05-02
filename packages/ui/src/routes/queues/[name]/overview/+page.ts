import { api, type Job } from "$lib/api/client"
import type { CrumbFn } from "$lib/shell/crumbs"
import type { PageLoad } from "./$types"

interface Preview {
  jobs: Job[]
  total: number
  error: string | null
}

/**
 * Fetches the top-5 failed + top-5 active in parallel so the overview page
 * can render recent-activity previews without a second round-trip. Each list
 * carries its own error so one failure doesn't poison the whole page.
 */
export const load: PageLoad = async ({ params }) => {
  const name = params.name

  async function fetchState(state: "failed" | "active"): Promise<Preview> {
    try {
      const res = await api.api.v1.queues[":name"].jobs.$get({
        param: { name },
        query: { state, limit: 5 },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      return { jobs: body.jobs, total: body.total, error: null }
    } catch (e) {
      return {
        jobs: [],
        total: 0,
        error: e instanceof Error ? e.message : `failed to load ${state} jobs`,
      }
    }
  }

  const [recentFailed, recentActive] = await Promise.all([
    fetchState("failed"),
    fetchState("active"),
  ])

  return { recentFailed, recentActive }
}

export const _crumb: CrumbFn = () => ({
  label: "Overview",
})
