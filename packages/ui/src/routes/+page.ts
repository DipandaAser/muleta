import { redirect } from "@sveltejs/kit"
import { paths } from "$lib/paths"
import type { PageLoad } from "./$types"

export const load = (async () => {
  redirect(307, paths.queues())
}) satisfies PageLoad
