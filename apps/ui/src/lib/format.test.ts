import { describe, expect, it } from "vitest"
import { formatCount, formatFindingCount } from "@/lib/format.ts"

describe("formatCount", () => {
  it("uses the singular label for one item", () => {
    expect(formatCount(1, "asset")).toBe("1 asset")
  })

  it("uses the default plural label for zero and multiple items", () => {
    expect(formatCount(0, "asset")).toBe("0 assets")
    expect(formatCount(2, "asset")).toBe("2 assets")
  })

  it("uses a custom plural label", () => {
    expect(formatCount(2, "vulnerability", "vulnerabilities")).toBe(
      "2 vulnerabilities"
    )
  })
})

describe("formatFindingCount", () => {
  it("formats finding counts", () => {
    expect(formatFindingCount(1)).toBe("1 finding")
    expect(formatFindingCount(2)).toBe("2 findings")
  })
})
