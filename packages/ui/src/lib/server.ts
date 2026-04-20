import { fileURLToPath } from "node:url"

/**
 * Absolute path to the built SPA assets produced by `pnpm build`.
 * Consumed by @muleta/server's createHandler to serve the UI alongside
 * the API from a single process.
 */
export const buildPath = fileURLToPath(new URL("../../build", import.meta.url))
