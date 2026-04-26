import sitemap from "@astrojs/sitemap"
import svelte from "@astrojs/svelte"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"

const SITE = "https://muleta.dev"

export default defineConfig({
  site: SITE,
  integrations: [
    svelte(),
    sitemap({
      changefreq: "weekly",
      priority: 0.7,
    }),
  ],
  vite: {
    // Tailwind v4 ships as a Vite plugin; daisyUI is loaded as a CSS
    // `@plugin` directive from src/styles/theme.css.
    plugins: [tailwindcss()],
  },
  build: {
    // Inline small stylesheets, hoist big ones — best for first-paint
    // without bloating individual pages.
    inlineStylesheets: "auto",
    // No client JS unless explicitly requested via `client:*` directives.
    // The site is content; interactivity is opt-in per island.
    format: "directory",
  },
  compressHTML: true,
  trailingSlash: "ignore",
  prefetch: {
    prefetchAll: false,
    defaultStrategy: "hover",
  },
})
