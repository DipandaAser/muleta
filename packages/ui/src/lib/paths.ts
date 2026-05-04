import { resolve } from "$app/paths"

/**
 * Centralized hrefs for every internal route. Always use these instead
 * of writing `/queues/...` literals — the dashboard is mounted under an
 * arbitrary base path at runtime (e.g. `/admin/queues`), and SvelteKit's
 * `resolve` automatically prepends `paths.base` so the resulting URL
 * works regardless of where the SPA is mounted.
 *
 * Renames stay localized: change a route folder, fix the helper here,
 * every caller follows.
 */
export const paths = {
  queues: () => resolve("/queues"),
  queue: (name: string) => resolve("/queues/[name]", { name }),
  queueOverview: (name: string) => resolve("/queues/[name]/overview", { name }),
  queueJobs: (name: string) => resolve("/queues/[name]/jobs", { name }),
  queueFlows: (name: string) => resolve("/queues/[name]/flows", { name }),
  queueWorkers: (name: string) => resolve("/queues/[name]/workers", { name }),
  queueSchedulers: (name: string) => resolve("/queues/[name]/schedulers", { name }),
  addJob: (queue: string, opts?: { fromJobId?: string; scheduler?: string }) => {
    const url = resolve("/queues/[name]/add-job", { name: queue })
    const search = new URLSearchParams()
    if (opts?.fromJobId) search.set("from", opts.fromJobId)
    if (opts?.scheduler) search.set("scheduler", opts.scheduler)
    const qs = search.toString()
    return qs ? `${url}?${qs}` : url
  },
  job: (queue: string, id: string) => resolve("/queues/[name]/jobs/[id]", { name: queue, id }),
  jobData: (queue: string, id: string) =>
    resolve("/queues/[name]/jobs/[id]/data", { name: queue, id }),
  jobLogs: (queue: string, id: string) =>
    resolve("/queues/[name]/jobs/[id]/logs", { name: queue, id }),
  jobOptions: (queue: string, id: string) =>
    resolve("/queues/[name]/jobs/[id]/options", { name: queue, id }),
  jobRaw: (queue: string, id: string) =>
    resolve("/queues/[name]/jobs/[id]/raw", { name: queue, id }),
  jobTimeline: (queue: string, id: string) =>
    resolve("/queues/[name]/jobs/[id]/timeline", { name: queue, id }),
  flows: () => resolve("/flows"),
  workers: () => resolve("/workers"),
  schedulers: () => resolve("/schedulers"),
}
