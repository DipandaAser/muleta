import { codeToHtml } from "shiki"

export type Tab = "docker" | "compose" | "compose.yaml"

const COMPOSE_YAML_URL =
  "https://raw.githubusercontent.com/DipandaAser/muleta/refs/heads/main/apps/standalone/compose.yaml"

export const COMMANDS: Record<Tab | string, string> = {
  docker: "docker run -p 3737:3737 ghcr.io/muleta-dev/muleta:edge",
  compose: `curl -fsSL \\ \n ${COMPOSE_YAML_URL} \\ \n -O && docker compose up`,
}

// Shiki wraps output in `<pre><code>...</code></pre>` with an inline
// `style="background-color: ...; color: ..."` on the pre. We render the
// command inline inside the install widget's flex row, so unwrap to just
// the colored token spans and let the widget's CSS drive layout/bg.
function stripWrappers(html: string): string {
  return html
    .replace(/^\s*<pre[^>]*>/, "")
    .replace(/<\/pre>\s*$/, "")
    .replace(/^\s*<code[^>]*>/, "")
    .replace(/<\/code>\s*$/, "")
}

/**
 * Build-time syntax highlighting for the install commands. Runs in Astro
 * frontmatter (server-only); the Svelte island only receives the
 * pre-rendered HTML strings, so shiki itself isn't shipped to the client.
 *
 * The compose.yaml tab's body is fetched live from the repo at build, so
 * the marketing site always shows whatever apps/standalone/compose.yaml
 * looks like on `main` — no manual sync.
 */
export async function getHighlighted(): Promise<Record<Tab, string>> {
  const composeYamlResponse = await fetch(COMPOSE_YAML_URL)
  if (!composeYamlResponse.ok) {
    throw new Error(`Failed to fetch compose.yaml: ${composeYamlResponse.status}`)
  }
  const composeYamlContent = await composeYamlResponse.text()
  const shellOpts = { lang: "shell", theme: "github-dark-default" } as const
  const yamlOpts = { lang: "yaml", theme: "github-dark-default" } as const
  const [docker, compose, composeYaml] = await Promise.all([
    codeToHtml(COMMANDS.docker, shellOpts).then(stripWrappers),
    codeToHtml(COMMANDS.compose, shellOpts).then(stripWrappers),
    codeToHtml(composeYamlContent, yamlOpts).then(stripWrappers),
  ])
  return { docker, compose, "compose.yaml": composeYaml }
}
