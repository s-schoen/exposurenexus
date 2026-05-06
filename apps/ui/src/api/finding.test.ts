import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import {
  createFinding,
  createFindingByIDQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  deleteFinding,
  updateFinding,
  uploadFindingFile
} from "./finding.ts"
import type {
  CreateFinding,
  Finding,
  FindingStatistics
} from "@openvlp/types/model/finding"

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

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1]
  if (!init) {
    throw new Error("fetch was not called")
  }

  return init
}

function requestJsonBody(): unknown {
  return JSON.parse(requestInit().body as string)
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
  assigneeId: null,
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
const createFindingPayload: CreateFinding = {
  vulnerabilityId,
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  source: FindingSource.Manual,
  evidence: "Observed exposed admin endpoint",
  mitigation: "Restrict access to internal networks",
  assetId
}
const findingStats: FindingStatistics = {
  total: 2,
  status: {
    [FindingStatus.Active]: 1,
    [FindingStatus.Inactive]: 0,
    [FindingStatus.Confirmed]: 1,
    [FindingStatus.FalsePositive]: 0,
    [FindingStatus.RiskAccepted]: 0,
    [FindingStatus.Duplicate]: 0,
    [FindingStatus.OutOfScope]: 0,
    [FindingStatus.Mitigated]: 0
  },
  severity: {
    [VulnerabilitySeverity.Info]: 0,
    [VulnerabilitySeverity.Low]: 0,
    [VulnerabilitySeverity.Medium]: 0,
    [VulnerabilitySeverity.High]: 1,
    [VulnerabilitySeverity.Critical]: 1
  },
  source: {
    manual: 2
  },
  assets: {
    [assetId]: 2
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
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("finding api", () => {
  it("creates list query options, requests findings, and parses date fields", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "finding-list-test",
        data: {
          items: [findingJson]
        }
      })
    )

    const queryOptions = createListFindingsQueryOptions()
    const findings = await queryOptions.queryFn()

    expect(queryOptions.queryKey).toEqual(["findings"])
    expect(findings).toHaveLength(1)
    expectFindingDates(findings[0])
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/findings",
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("creates detail query options, requests a finding, and parses date fields", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        correlationId: "finding-detail-test",
        data: findingJson
      })
    )

    const queryOptions = createFindingByIDQueryOptions(findingId)
    const finding = await queryOptions.queryFn()

    expect(queryOptions.queryKey).toEqual(["findings", findingId])
    expectFindingDates(finding)
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/findings/${findingId}`,
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("creates findings with a JSON request body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingJson
      })
    )

    const finding = await createFinding(createFindingPayload)

    expectFindingDates(finding)
    const headers = requestInit().headers as Headers
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/findings",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual(createFindingPayload)
  })

  it("updates findings with a mapped JSON request body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...findingJson,
          status: FindingStatus.Confirmed,
          assigneeId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
        }
      })
    )
    const finding = await createFindingByIDQueryOptions(findingId).queryFn()
    fetchMock.mockClear()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          ...findingJson,
          status: FindingStatus.Confirmed,
          assigneeId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
        }
      })
    )

    const updatedFinding = await updateFinding({
      ...finding,
      status: FindingStatus.Confirmed,
      ownerId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
      assigneeId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
    } as Finding)

    expect(updatedFinding.status).toBe(FindingStatus.Confirmed)
    expect(updatedFinding.assigneeId).toBe(
      "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
    )
    const headers = requestInit().headers as Headers
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/findings/${findingId}`,
      expect.objectContaining({
        credentials: "include",
        method: "PUT"
      })
    )
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(requestJsonBody()).toEqual({
      ...createFindingPayload,
      status: FindingStatus.Confirmed,
      assigneeId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
    })
    expect(requestJsonBody()).not.toHaveProperty("ownerId")
  })

  it("deletes findings", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingJson
      })
    )

    const deletedFinding = await deleteFinding(findingId)

    expectFindingDates(deletedFinding)
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/findings/${findingId}`,
      expect.objectContaining({
        credentials: "include",
        method: "DELETE"
      })
    )
  })

  it("creates stats query options and parses finding stats", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: findingStats
      })
    )

    const queryOptions = createFindingStatsQueryOptions()
    const result = await queryOptions.queryFn()

    expect(queryOptions.queryKey).toEqual(["findings", "stats"])
    expect(result).toEqual(findingStats)
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/findings/stats",
      expect.objectContaining({
        credentials: "include",
        method: "GET"
      })
    )
  })

  it("uploads finding import files as form data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: {} }))
    const file = new File(["{}"], "nuclei.json", {
      type: "application/json"
    })

    await uploadFindingFile("nuclei", file)

    const body = requestInit().body
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/findings/import",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    )
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get("type")).toBe("nuclei")
    expect((body as FormData).get("file")).toBe(file)
  })

  it("throws API errors from finding requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: "Finding request failed",
          reason: "invalid status"
        },
        { status: 400 }
      )
    )

    await expect(deleteFinding(findingId)).rejects.toThrow(
      "Finding request failed"
    )
  })
})
