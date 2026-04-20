import { redirect } from "@sveltejs/kit"
import type { PageLoad } from "./$types"

// /queues/[name] has no Overview page yet — route straight to Jobs,
// which is the primary workflow today.
export const load: PageLoad = ({ params }) => {
  redirect(307, `/queues/${params.name}/jobs`)
}
