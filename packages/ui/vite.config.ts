import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

const MULETA_API = process.env.MULETA_API_URL ?? "http://localhost:3737"

// `v0.1.0` on a release tag, `v0.1.0+abc1234` on edge builds between
// releases. Falls back to `v0.1.0` when git isn't available.
function tryGit(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return ""
  }
}

const serverPkg: { version: string } = JSON.parse(
  readFileSync(new URL("../server/package.json", import.meta.url), "utf-8"),
)
const tagAtHead = tryGit("tag --points-at HEAD --list 'v*'")
const shortSha = tryGit("rev-parse --short HEAD")
const muletaVersion =
  tagAtHead || !shortSha ? `v${serverPkg.version}` : `v${serverPkg.version}+${shortSha}`

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    visualizer({
      emitFile: true,
      filename: "stats.html",
    }),
  ],
  define: {
    __MULETA_VERSION__: JSON.stringify(muletaVersion),
  },
  server: {
    proxy: {
      "/api": { target: MULETA_API, changeOrigin: true },
    },
  },
})
