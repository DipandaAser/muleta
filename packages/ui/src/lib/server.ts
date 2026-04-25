import { fileURLToPath } from "node:url"

/**
 * Absolute path to the built SPA assets produced by `pnpm build`.
 * Consumed by @muleta-dev/server's createHandler to serve the UI alongside
 * the API from a single process.
 *
 * Honours `MULETA_UI_BUILD_PATH` as an override for production deploys
 * where the SPA is shipped to a fixed path (e.g. our Docker image keeps
 * it at `/app/ui-build`). The default uses `import.meta.url` so it
 * resolves correctly from the workspace source layout in dev — but that
 * value gets rewritten when the consumer is bundled, hence the override.
 */
export const buildPath =
  process.env.MULETA_UI_BUILD_PATH ?? fileURLToPath(new URL("../../build", import.meta.url))
