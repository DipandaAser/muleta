import adapter from "@sveltejs/adapter-static"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: (/** @type {{ filename: string }} */ { filename }) =>
      filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
  },
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
  },
}

export default config
