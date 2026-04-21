import { redirect } from "@sveltejs/kit"
import type { PageLoad } from "./$types"

// Default the job detail view to the Data tab so the URL always identifies
// which panel the user is looking at (matches the queue detail pattern).
export const load: PageLoad = ({ params }) => {
  throw redirect(307, `/queues/${params.name}/jobs/${params.id}/data`)
}
