import { beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource } from "@openvlp/types/model/finding"
import { createTestUser } from "../test/app.js"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("./nuclei.js", () => ({
  parseNucleiFindings: vi.fn()
}))

import { parseNucleiFindings } from "./nuclei.js"
import { parseFindingsFromFile } from "./importer.js"

describe("importer", () => {
  const user = createTestUser()
  const ctx = { user }
  const file = Buffer.from('{"template-id":"test"}\n')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("dispatches nuclei imports to the nuclei parser", async () => {
    const findings = [{ id: "finding-1" }]

    vi.mocked(parseNucleiFindings).mockResolvedValue(findings as any)

    await expect(
      parseFindingsFromFile(ctx, FindingSource.Nuclei, file)
    ).resolves.toEqual(findings)
    expect(parseNucleiFindings).toHaveBeenCalledWith(ctx, file)
  })

  it("returns an empty result for unsupported import types", async () => {
    await expect(
      parseFindingsFromFile(ctx, "unsupported", file)
    ).resolves.toEqual([])
    expect(parseNucleiFindings).not.toHaveBeenCalled()
  })
})
