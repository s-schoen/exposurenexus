import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  FindingSource,
  FindingStatus
} from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import {
  createFindingByIDQueryOptions,
  createListFindingsQueryOptions
} from "./finding.ts"
import type { Finding } from "@openvlp/types/model/finding"

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  })
}

const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f"
const findingId = "2713d833-eb13-4517-ac7c-7761545ed42a"
const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe"
const assetId = "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c"
const findingJson = {
  id: findingId,
  vulnerabilityId,
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  source: FindingSource.Manual,
  evidence: "Observed exposed admin endpoint",
  mitigation: "Restrict access to internal networks",
  firstSeen: "2026-01-02T00:00:00.000Z",
  lastSeen: "2026-01-03T00:00:00.000Z",
  fingerprint: "abc123",
  assetId,
  createdBy: userId,
  updatedBy: userId,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
  vulnerability: {
    id: vulnerabilityId,
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: userId,
    updatedBy: userId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
}

function expectFindingDates(finding: Finding) {
  expect(finding.firstSeen).toBeInstanceOf(Date)
  expect(finding.lastSeen).toBeInstanceOf(Date)
  expect(finding.createdAt).toBeInstanceOf(Date)
  expect(finding.updatedAt).toBeInstanceOf(Date)
  expect(finding.vulnerability.createdAt).toBeInstanceOf(Date)
  expect(finding.vulnerability.updatedAt).toBeInstanceOf(Date)
  expect(finding.lastSeen?.toISOString()).toBe("2026-01-03T00:00:00.000Z")
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("finding api", () => {
  it("parses date fields when listing findings", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "finding-list-test",
        data: {
          items: [findingJson]
        }
      })
    )

    const findings = await createListFindingsQueryOptions().queryFn()

    expect(findings).toHaveLength(1)
    expectFindingDates(findings[0])
  })

  it("parses date fields when getting a finding by id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "finding-detail-test",
        data: findingJson
      })
    )

    const finding = await createFindingByIDQueryOptions(findingId).queryFn()

    expectFindingDates(finding)
  })
})
