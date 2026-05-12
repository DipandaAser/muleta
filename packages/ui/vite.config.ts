import { readFileSync } from "node:fs"
import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

const MULETA_API = process.env.MULETA_API_URL ?? "http://localhost:3737"

/**
 * Inject the running `@muleta-dev/server` version as a compile-time
 * constant. The UI bundle ships inside `@muleta-dev/server`'s tarball,
 * so the two versions are always in lockstep at deploy time — reading
 * the sibling package's `package.json` at build time is enough to
 * show the operator which release they're looking at.
 */
const serverPkg: { version: string } = JSON.parse(
  readFileSync(new URL("../server/package.json", import.meta.url), "utf-8"),
)

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
    __MULETA_VERSION__: JSON.stringify(serverPkg.version),
  },
  server: {
    proxy: {
      "/api": { target: MULETA_API, changeOrigin: true },
    },
  },
})
