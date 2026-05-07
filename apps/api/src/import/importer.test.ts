import { beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource, type Finding } from "@exposurenexus/types/model/finding"
import { pino } from "pino"
import { createTestUser } from "../test/app.js"
import { createFindingImporter } from "./importer.js"

describe("importer", () => {
  const user = createTestUser()
  const ctx = { user }
  const file = Buffer.from('{"template-id":"test"}\n')
  const logger = pino({ enabled: false })
  const nucleiParser = {
    parseNucleiFindings: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("dispatches nuclei imports to the nuclei parser", async () => {
    const findings = [{ id: "finding-1" }] as Finding[]
    const importer = createFindingImporter({ nucleiParser, logger })

    nucleiParser.parseNucleiFindings.mockResolvedValue(findings)

    await expect(
      importer.parseFindingsFromFile(ctx, FindingSource.Nuclei, file)
    ).resolves.toEqual(findings)
    expect(nucleiParser.parseNucleiFindings).toHaveBeenCalledWith(ctx, file)
  })

  it("returns an empty result for unsupported import types", async () => {
    const importer = createFindingImporter({ nucleiParser, logger })

    await expect(
      importer.parseFindingsFromFile(ctx, "unsupported", file)
    ).resolves.toEqual([])
    expect(nucleiParser.parseNucleiFindings).not.toHaveBeenCalled()
  })
})
