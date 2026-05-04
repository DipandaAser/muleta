// Removes `.tsbuildinfo` + `.map` files from dist/ so the published
// tarball doesn't carry them. `.npmignore` can't do this because the
// package's `files` field takes precedence and pulls everything in
// `dist/` regardless.
import { readdirSync, statSync, unlinkSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(here, "..", "dist")

function strip(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      strip(full)
      continue
    }
    if (name === ".tsbuildinfo" || name.endsWith(".map")) {
      unlinkSync(full)
    }
  }
}

strip(DIST)
console.log("[strip-dev] removed .tsbuildinfo / *.map from dist")
