import { sveltekit } from "@sveltejs/kit/vite"
import tailwindcss from "@tailwindcss/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

const MULETA_API = process.env.MULETA_API_URL ?? "http://localhost:3737"

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    visualizer({
      emitFile: true,
      filename: "stats.html",
    }),
  ],
  server: {
    proxy: {
      "/api": { target: MULETA_API, changeOrigin: true },
    },
  },
})
