import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FindingSource, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { ReactNode } from "react"
import type { CreateFinding, Finding } from "@openvlp/types/model/finding"
import type * as FindingApi from "@/api/finding.ts"
import type { FindingLifecycleBatchResult } from "@/hooks/use-finding-lifecycle.ts"
import {
  createFindingByIDQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions
} from "@/api/finding.ts"
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts"

const {
  createFindingRequestMock,
  deleteFindingRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateFindingRequestMock
} = vi.hoisted(() => ({
  createFindingRequestMock: vi.fn(),
  deleteFindingRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateFindingRequestMock: vi.fn()
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock
  }
}))

vi.mock("@/api/finding.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof FindingApi>()

  return {
    ...actual,
    createFinding: createFindingRequestMock,
    deleteFinding: deleteFindingRequestMock,
    updateFinding: updateFindingRequestMock
  }
})

const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f"
const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe"

function createFindingFixture(overrides: Partial<Finding> = {}): Finding {
  const id = overrides.id ?? "2713d833-eb13-4517-ac7c-7761545ed42a"
  const createdAt = new Date("2026-01-02T00:00:00.000Z")
  const updatedAt = new Date("2026-01-03T00:00:00.000Z")

  return {
    id,
    vulnerabilityId,
    severity: VulnerabilitySeverity.High,
    status: FindingStatus.Active,
    source: FindingSource.Manual,
    evidence: "Observed exposed admin endpoint",
    mitigation: "Restrict access to internal networks",
    assigneeId: null,
    dueDate: null,
    firstSeen: createdAt,
    lastSeen: updatedAt,
    fingerprint: `fingerprint-${id}`,
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    createdBy: userId,
    updatedBy: userId,
    createdAt,
    updatedAt,
    vulnerability: {
      id: vulnerabilityId,
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      cwe: 284,
      cve: null,
      createdBy: userId,
      updatedBy: userId,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    },
    ...overrides
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return {
    promise,
    resolve,
    reject
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })
}

function renderLifecycleHook(queryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return {
    queryClient,
    ...renderHook(() => useFindingLifecycle(), { wrapper })
  }
}

beforeEach(() => {
  createFindingRequestMock.mockReset()
  deleteFindingRequestMock.mockReset()
  toastErrorMock.mockReset()
  toastSuccessMock.mockReset()
  updateFindingRequestMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useFindingLifecycle", () => {
  it("optimistically updates list and detail caches during a single-field update", async () => {
    const finding = createFindingFixture()
    const updatedFinding = {
      ...finding,
      status: FindingStatus.Confirmed,
      updatedAt: new Date("2026-01-04T00:00:00.000Z")
    }
    const update = createDeferred<Finding>()
    updateFindingRequestMock.mockReturnValueOnce(update.promise)
    const { queryClient, result } = renderLifecycleHook()

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [
      finding
    ])
    queryClient.setQueryData(
      createFindingByIDQueryOptions(finding.id).queryKey,
      finding
    )

    let operation!: Promise<Finding | null>
    act(() => {
      operation = result.current.updateFindingField(
        finding,
        "status",
        FindingStatus.Confirmed
      )
    })

    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(finding.id).queryKey
      )?.status
    ).toBe(FindingStatus.Confirmed)
    expect(
      queryClient.getQueryData<Array<Finding>>(
        createListFindingsQueryOptions().queryKey
      )?.[0].status
    ).toBe(FindingStatus.Confirmed)

    await act(async () => {
      update.resolve(updatedFinding)
      await operation
    })

    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(finding.id).queryKey
      )?.updatedAt
    ).toEqual(updatedFinding.updatedAt)
  })

  it("rolls list and detail caches back when a single-field update fails", async () => {
    const finding = createFindingFixture()
    const update = createDeferred<Finding>()
    updateFindingRequestMock.mockReturnValueOnce(update.promise)
    const { queryClient, result } = renderLifecycleHook()

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [
      finding
    ])
    queryClient.setQueryData(
      createFindingByIDQueryOptions(finding.id).queryKey,
      finding
    )

    let operation!: Promise<Finding | null>
    act(() => {
      operation = result.current.updateFindingField(
        finding,
        "status",
        FindingStatus.Confirmed
      )
    })

    await act(async () => {
      update.reject(new Error("Update failed"))
      await operation
    })

    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(finding.id).queryKey
      )
    ).toEqual(finding)
    expect(
      queryClient.getQueryData<Array<Finding>>(
        createListFindingsQueryOptions().queryKey
      )
    ).toEqual([finding])
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to update finding")
  })

  it("rolls assignee cache changes back and reports errors when assignment fails", async () => {
    const finding = createFindingFixture()
    const assigneeId = "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12"
    const update = createDeferred<Finding>()
    updateFindingRequestMock.mockReturnValueOnce(update.promise)
    const { queryClient, result } = renderLifecycleHook()

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [
      finding
    ])
    queryClient.setQueryData(
      createFindingByIDQueryOptions(finding.id).queryKey,
      finding
    )

    let operation!: Promise<Finding | null>
    act(() => {
      operation = result.current.updateFindingField(
        finding,
        "assigneeId",
        assigneeId
      )
    })

    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(finding.id).queryKey
      )?.assigneeId
    ).toBe(assigneeId)
    expect(
      queryClient.getQueryData<Array<Finding>>(
        createListFindingsQueryOptions().queryKey
      )?.[0].assigneeId
    ).toBe(assigneeId)

    await act(async () => {
      update.reject(new Error("Assignment failed"))
      await operation
    })

    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(finding.id).queryKey
      )
    ).toEqual(finding)
    expect(
      queryClient.getQueryData<Array<Finding>>(
        createListFindingsQueryOptions().queryKey
      )
    ).toEqual([finding])
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to update finding")
  })

  it("invalidates detail, list, and stats after a successful single-field update", async () => {
    const finding = createFindingFixture()
    const updatedFinding = {
      ...finding,
      status: FindingStatus.Confirmed
    }
    updateFindingRequestMock.mockResolvedValueOnce(updatedFinding)
    const { queryClient, result } = renderLifecycleHook()
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined)

    await act(async () => {
      await result.current.updateFindingField(
        finding,
        "status",
        FindingStatus.Confirmed
      )
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListFindingsQueryOptions().queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(finding.id).queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true
    })
  })

  it("preserves due dates when updating another finding field", async () => {
    const dueDate = new Date("2026-05-06T00:00:00.000Z")
    const finding = createFindingFixture({
      dueDate
    })
    const updatedFinding = {
      ...finding,
      status: FindingStatus.Confirmed
    }
    updateFindingRequestMock.mockResolvedValueOnce(updatedFinding)
    const { result } = renderLifecycleHook()

    await act(async () => {
      await result.current.updateFindingField(
        finding,
        "status",
        FindingStatus.Confirmed
      )
    })

    expect(updateFindingRequestMock).toHaveBeenCalledWith({
      ...finding,
      status: FindingStatus.Confirmed,
      dueDate
    })
  })

  it("updates finding due dates as editable lifecycle fields", async () => {
    const finding = createFindingFixture()
    const dueDate = new Date("2026-05-06T00:00:00.000Z")
    const updatedFinding = {
      ...finding,
      dueDate
    }
    updateFindingRequestMock.mockResolvedValueOnce(updatedFinding)
    const { queryClient, result } = renderLifecycleHook()

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [
      finding
    ])
    queryClient.setQueryData(
      createFindingByIDQueryOptions(finding.id).queryKey,
      finding
    )

    await act(async () => {
      await result.current.updateFindingField(finding, "dueDate", dueDate)
    })

    expect(updateFindingRequestMock).toHaveBeenCalledWith({
      ...finding,
      dueDate
    })
    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(finding.id).queryKey
      )?.dueDate
    ).toEqual(dueDate)
  })

  it("creates findings and invalidates the unnested list query key plus stats", async () => {
    const finding = createFindingFixture()
    const value: CreateFinding = {
      vulnerabilityId: finding.vulnerabilityId,
      severity: finding.severity,
      status: finding.status,
      source: finding.source,
      evidence: finding.evidence,
      mitigation: finding.mitigation,
      assetId: finding.assetId
    }
    createFindingRequestMock.mockResolvedValueOnce(finding)
    const { queryClient, result } = renderLifecycleHook()
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined)

    await act(async () => {
      await result.current.createFinding(value)
    })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["findings"],
      exact: true
    })
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: [["findings"]]
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true
    })
  })

  it("reports partial bulk update failures and rolls failed findings back", async () => {
    const first = createFindingFixture({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a"
    })
    const second = createFindingFixture({
      id: "f83f9298-2271-4b13-84fe-13724989243b",
      severity: VulnerabilitySeverity.Low
    })
    const updatedFirst = {
      ...first,
      severity: VulnerabilitySeverity.Critical,
      updatedAt: new Date("2026-01-04T00:00:00.000Z")
    }
    updateFindingRequestMock.mockImplementation((finding: Finding) =>
      finding.id === first.id
        ? Promise.resolve(updatedFirst)
        : Promise.reject(new Error("Update failed"))
    )
    const { queryClient, result } = renderLifecycleHook()

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [
      first,
      second
    ])
    queryClient.setQueryData(
      createFindingByIDQueryOptions(second.id).queryKey,
      second
    )

    let batchResult: FindingLifecycleBatchResult | undefined
    await act(async () => {
      batchResult = await result.current.bulkUpdateFindingField(
        [first, second],
        "severity",
        VulnerabilitySeverity.Critical
      )
    })

    expect(batchResult).toMatchObject({
      successful: [updatedFirst],
      failed: [{ finding: second }]
    })
    expect(
      queryClient.getQueryData<Array<Finding>>(
        createListFindingsQueryOptions().queryKey
      )
    ).toEqual([updatedFirst, second])
    expect(
      queryClient.getQueryData<Finding>(
        createFindingByIDQueryOptions(second.id).queryKey
      )
    ).toEqual(second)
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Updated 1 finding(s); failed 1"
    )
  })

  it("bulk-updates finding status successfully", async () => {
    const finding = createFindingFixture()
    const updatedFinding = {
      ...finding,
      status: FindingStatus.Confirmed,
      updatedAt: new Date("2026-01-04T00:00:00.000Z")
    }
    updateFindingRequestMock.mockResolvedValueOnce(updatedFinding)
    const { queryClient, result } = renderLifecycleHook()

    queryClient.setQueryData(createListFindingsQueryOptions().queryKey, [
      finding
    ])

    let batchResult: FindingLifecycleBatchResult | undefined
    await act(async () => {
      batchResult = await result.current.bulkUpdateFindingField(
        [finding],
        "status",
        FindingStatus.Confirmed
      )
    })

    expect(batchResult).toEqual({
      successful: [updatedFinding],
      failed: []
    })
    expect(updateFindingRequestMock.mock.calls[0][0]).toEqual({
      ...finding,
      status: FindingStatus.Confirmed
    })
    expect(
      queryClient.getQueryData<Array<Finding>>(
        createListFindingsQueryOptions().queryKey
      )
    ).toEqual([updatedFinding])
    expect(toastSuccessMock).toHaveBeenCalledWith("Updated 1 finding(s)")
  })

  it("reports partial delete failures and invalidates affected reads", async () => {
    const first = createFindingFixture({
      id: "2713d833-eb13-4517-ac7c-7761545ed42a"
    })
    const second = createFindingFixture({
      id: "f83f9298-2271-4b13-84fe-13724989243b"
    })
    deleteFindingRequestMock.mockImplementation((id: string) =>
      id === first.id
        ? Promise.resolve(first)
        : Promise.reject(new Error("Delete failed"))
    )
    const { queryClient, result } = renderLifecycleHook()
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined)

    let batchResult: FindingLifecycleBatchResult | undefined
    await act(async () => {
      batchResult = await result.current.deleteFindings([first, second])
    })

    expect(batchResult).toMatchObject({
      successful: [first],
      failed: [{ finding: second }]
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListFindingsQueryOptions().queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(first.id).queryKey,
      exact: true
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createFindingByIDQueryOptions(second.id).queryKey,
      exact: true
    })
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Deleted 1 finding(s); failed 1"
    )
  })
})
