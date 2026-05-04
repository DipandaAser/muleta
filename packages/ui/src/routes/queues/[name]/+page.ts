import { redirect } from "@sveltejs/kit"
import { paths } from "$lib/paths"
import type { PageLoad } from "./$types"

export const load: PageLoad = ({ params }) => {
  redirect(307, paths.queueOverview(params.name))
}
