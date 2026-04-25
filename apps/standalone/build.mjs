// Bundles src/index.ts and all workspace deps (@muleta-dev/*) into a
// single ESM file. Third-party prod deps stay external — the Dockerfile
// installs them via `pnpm deploy --prod` so node_modules holds only what
// the bundle imports at runtime.

import { readFileSync } from "node:fs"
import { build } from "esbuild"

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))

const externals = Object.keys(pkg.dependencies ?? {})
  .filter((name) => !name.startsWith("@muleta-dev/"))
  // Cover subpath imports too (e.g. `hono/streaming`).
  .flatMap((name) => [name, `${name}/*`])

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  legalComments: "linked",
  // Workspace deps resolve to TS source files via `main: "./src/index.ts"`,
  // which esbuild happily inlines. Anything else goes through node_modules
  // at runtime.
  external: externals,
  // Bundles use `import.meta.url`; preserve the production semantics of
  // ESM modules by emitting an .mjs-style file.
  banner: { js: "// @muleta-dev/standalone — bundled production entry" },
})
