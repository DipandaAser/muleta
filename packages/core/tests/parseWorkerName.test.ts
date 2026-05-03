import { describe, expect, it } from "vitest"
import { parseWorkerName } from "../src/queue/index.js"

/**
 * Pure-function unit tests for the helper that strips BullMQ's
 * `<prefix>:<base64queue>` framing out of a Redis client name. Worth
 * having in addition to the integration tests in `registry.test.ts`
 * because the parsing edge cases (anonymous workers, names containing
 * `:w:`, weird base64 chars) don't all need a Redis testcontainer.
 */
describe("parseWorkerName", () => {
  it("returns the user-supplied name for named workers", () => {
    // BullMQ format: `<prefix>:<base64Queue>:w:<userName>`. `bull` is the
    // default prefix; `ZW1haWxz` is base64("emails").
    expect(parseWorkerName("bull:ZW1haWxz:w:my-worker")).toBe("my-worker")
  })

  it("returns null for anonymous workers (no `:w:` segment)", () => {
    expect(parseWorkerName("bull:ZW1haWxz")).toBeNull()
  })

  it("returns null for an empty input", () => {
    expect(parseWorkerName("")).toBeNull()
  })

  it("captures user names that themselves contain `:w:` substrings", () => {
    // Greedy `.+` in the regex picks the LAST `:w:` as the separator,
    // so the user's literal name (which can contain colons) survives.
    expect(parseWorkerName("bull:ZW1haWxz:w:foo:w:bar")).toBe("foo:w:bar")
  })

  it("handles base64 characters in the queue name (+, /, =)", () => {
    // Standard base64 alphabet includes `+`, `/`, `=` — none are `:`, so
    // the `[^:]+` queue-segment match handles them without escaping.
    expect(parseWorkerName("bull:ab+/cd==:w:n")).toBe("n")
  })

  it("returns null for the BullMQ GCP fallback string", () => {
    // BullMQ surfaces `{ name: 'GCP does not support client list' }` when
    // CLIENT LIST is blocked. The string has no `:w:` segment, so
    // `parseWorkerName` correctly returns null even if a caller forgets
    // to filter it out earlier in the pipeline.
    expect(parseWorkerName("GCP does not support client list")).toBeNull()
  })
})
