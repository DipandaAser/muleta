// Build-time GitHub stats. The marketing site builds frequently (on push,
// on cron) so a count from the last build is plenty fresh. No client JS,
// no rate-limit concerns at view time.

const REPO = "dipandaaser/muleta"

interface RepoResponse {
  stargazers_count: number
}

/**
 * Returns the repo's stargazer count, or `null` if the GitHub API is
 * unreachable / rate-limited / 404. Never throws — the build should not
 * fail because GitHub is having a bad afternoon.
 */
export async function getRepoStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        // The API version header lets GitHub gate breaking changes
        // without surprising us mid-build.
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as RepoResponse
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null
  } catch {
    return null
  }
}

/**
 * Compact star count: 0–999 as-is, then 1.2k / 12k / 123k. Mirrors the
 * style GitHub itself uses on its UI badges.
 */
export function formatStars(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
