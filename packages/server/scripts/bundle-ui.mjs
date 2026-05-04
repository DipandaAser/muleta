// Copies the SvelteKit static build from @muleta-dev/ui into this package's
// dist/ui/ directory so the published tarball serves the dashboard SPA from
// inside the server package — single install, single mount.
//
// Also strips dev-only artifacts that npm's `files` field would otherwise
// pull into the tarball (`.tsbuildinfo`, `dist/ui/stats.html` from
// rollup-plugin-visualizer, all `.map` files). `.npmignore` doesn't help
// here because `files` takes precedence over it for top-level matches.
import { cpSync, existsSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const UI_SRC = resolve(here, "..", "..", "ui", "build")
const UI_DEST = resolve(here, "..", "dist", "ui")
const DIST = resolve(here, "..", "dist")

if (!existsSync(UI_SRC)) {
  console.error(
    `[bundle-ui] expected ${UI_SRC} to exist — run \`pnpm --filter @muleta-dev/ui build\` first`,
  )
  process.exit(1)
}

rmSync(UI_DEST, { recursive: true, force: true })
cpSync(UI_SRC, UI_DEST, { recursive: true })
console.log(`[bundle-ui] copied ${UI_SRC} → ${UI_DEST}`)

// Walk dist/ and strip dev-only files. Recursive because tsc emits .map
// files alongside every compiled module.
function stripDevFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      stripDevFiles(full)
      continue
    }
    if (name === ".tsbuildinfo" || name === "stats.html" || name.endsWith(".map")) {
      unlinkSync(full)
    }
  }
}
stripDevFiles(DIST)
console.log("[bundle-ui] stripped .tsbuildinfo / stats.html / *.map from dist")
