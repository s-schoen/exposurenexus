import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type {
  CreateFinding,
  Finding
} from "@openvlp/types/model/finding"
import {
  createFindingByIDQueryOptions,
  createFinding as createFindingRequest,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  deleteFinding as deleteFindingRequest,
  updateFinding as updateFindingRequest
} from "@/api/finding.ts"
import { toastActionError } from "@/lib/action-error-toast.ts"

export type FindingEditableField =
  | "severity"
  | "status"
  | "source"
  | "evidence"
  | "mitigation"
  | "assigneeId"
  | "dueDate"

export type FindingBulkEditableField = "severity" | "status"

export interface FindingLifecycleFailure {
  finding: Finding
  error: unknown
}

export interface FindingLifecycleBatchResult {
  successful: Array<Finding>
  failed: Array<FindingLifecycleFailure>
}

export interface FindingLifecycleActions {
  /**
   * Creates a finding, shows default success/failure toasts, and invalidates
   * finding list and stats queries.
   *
   * Returns the created finding on success. Returns null for handled API
   * failures; callers do not need to catch to show errors.
   */
  createFinding: (value: CreateFinding) => Promise<Finding | null>

  /**
   * Updates one mutable finding field with optimistic list/detail cache updates.
   *
   * Returns the updated finding on success. Returns null for handled API
   * failures after rolling optimistic cache writes back.
   */
  updateFindingField: <TKey extends FindingEditableField>(
    finding: Finding,
    key: TKey,
    value: Finding[TKey]
  ) => Promise<Finding | null>

  /**
   * Updates one bulk-editable field for many findings, shows default summary
   * toasts, and returns per-finding success/failure details.
   *
   * API failures are represented in the returned result instead of thrown.
   */
  bulkUpdateFindingField: <TKey extends FindingBulkEditableField>(
    findings: Array<Finding>,
    key: TKey,
    value: Finding[TKey]
  ) => Promise<FindingLifecycleBatchResult>

  /**
   * Deletes many findings, shows default summary toasts, and returns per-finding
   * success/failure details.
   *
   * Confirmation stays with the caller. API failures are represented in the
   * returned result instead of thrown.
   */
  deleteFindings: (
    findings: Array<Finding>
  ) => Promise<FindingLifecycleBatchResult>
}

interface FindingCacheSnapshot {
  list: Array<Finding> | undefined
  details: Map<string, Finding | undefined>
}

const listQueryKey = createListFindingsQueryOptions().queryKey
const statsQueryKey = createFindingStatsQueryOptions().queryKey

function detailQueryKey(findingId: string) {
  return createFindingByIDQueryOptions(findingId).queryKey
}

function replaceFindingInList(
  findings: Array<Finding> | undefined,
  nextFinding: Finding
) {
  return findings?.map((finding) =>
    finding.id === nextFinding.id ? nextFinding : finding
  )
}

function findingWithField<TKey extends FindingEditableField>(
  finding: Finding,
  key: TKey,
  value: Finding[TKey]
): Finding {
  return {
    ...finding,
    [key]: value
  }
}

function createBatchResult(
  findings: Array<Finding>,
  results: Array<PromiseSettledResult<Finding>>
): FindingLifecycleBatchResult {
  return results.reduce<FindingLifecycleBatchResult>(
    (result, settled, index) => {
      if (settled.status === "fulfilled") {
        result.successful.push(settled.value)
      } else {
        result.failed.push({
          finding: findings[index],
          error: settled.reason
        })
      }

      return result
    },
    {
      successful: [],
      failed: []
    }
  )
}

function toastBatchSummary(
  result: FindingLifecycleBatchResult,
  action: "Deleted" | "Updated",
  failureVerb: "delete" | "update"
) {
  const total = result.successful.length + result.failed.length

  if (result.failed.length === 0) {
    toast.success(`${action} ${result.successful.length} finding(s)`)
    return
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to ${failureVerb} ${total} finding(s)`)
    return
  }

  toast.error(
    `${action} ${result.successful.length} finding(s); failed ${result.failed.length}`
  )
}

export function useFindingLifecycle(): FindingLifecycleActions {
  const queryClient = useQueryClient()

  function snapshotFindings(findingIds: Array<string>): FindingCacheSnapshot {
    return {
      list: queryClient.getQueryData<Array<Finding>>(listQueryKey),
      details: new Map(
        findingIds.map((id) => [
          id,
          queryClient.getQueryData<Finding>(detailQueryKey(id))
        ])
      )
    }
  }

  function writeFindingToCaches(finding: Finding) {
    queryClient.setQueryData(detailQueryKey(finding.id), finding)
    queryClient.setQueryData<Array<Finding>>(listQueryKey, (current) =>
      replaceFindingInList(current, finding)
    )
  }

  function restoreFindingFromSnapshot(
    snapshot: FindingCacheSnapshot,
    findingId: string
  ) {
    const previousDetail = snapshot.details.get(findingId)

    if (previousDetail) {
      queryClient.setQueryData(detailQueryKey(findingId), previousDetail)
    } else {
      queryClient.removeQueries({
        queryKey: detailQueryKey(findingId),
        exact: true
      })
    }

    queryClient.setQueryData<Array<Finding>>(listQueryKey, (current) => {
      if (!current || !snapshot.list) {
        return current
      }

      const previousFinding = snapshot.list.find(
        (finding) => finding.id === findingId
      )

      if (!previousFinding) {
        return current
      }

      return replaceFindingInList(current, previousFinding)
    })
  }

  async function invalidateFindingReads(findingIds: Array<string>) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true
      }),
      queryClient.invalidateQueries({
        queryKey: statsQueryKey,
        exact: true
      }),
      ...findingIds.map((id) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(id),
          exact: true
        })
      )
    ])
  }

  return {
    async createFinding(value) {
      try {
        const createdFinding = await createFindingRequest(value)

        toast.success("Finding created")
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: listQueryKey,
            exact: true
          }),
          queryClient.invalidateQueries({
            queryKey: statsQueryKey,
            exact: true
          })
        ])

        return createdFinding
      } catch (error) {
        toastActionError(error, `Failed to create finding: ${error}`)
        console.error(error)
        return null
      }
    },

    async updateFindingField(finding, key, value) {
      if (finding[key] === value) {
        return finding
      }

      const nextFinding = findingWithField(finding, key, value)
      const snapshot = snapshotFindings([finding.id])

      try {
        // Keep split list/detail views in sync while the edit is pending; the
        // server response refreshes authoritative audit fields before refetch.
        writeFindingToCaches(nextFinding)

        const updatedFinding = await updateFindingRequest(nextFinding)

        writeFindingToCaches(updatedFinding)
        await invalidateFindingReads([finding.id])

        return updatedFinding
      } catch (error) {
        // Restore both caches so a failed inline edit cannot leave the list and
        // detail panes showing different lifecycle state.
        restoreFindingFromSnapshot(snapshot, finding.id)
        toastActionError(error, "Failed to update finding")
        console.error(error)
        return null
      }
    },

    async bulkUpdateFindingField(findings, key, value) {
      if (findings.length === 0) {
        return {
          successful: [],
          failed: []
        }
      }

      const snapshot = snapshotFindings(findings.map((finding) => finding.id))
      const nextFindings = findings.map((finding) =>
        findingWithField(finding, key, value)
      )

      // Apply the batch optimistically to every visible cache entry, then let
      // each settled request either canonicalize or restore its own row.
      for (const nextFinding of nextFindings) {
        writeFindingToCaches(nextFinding)
      }

      const result = createBatchResult(
        findings,
        await Promise.allSettled(nextFindings.map(updateFindingRequest))
      )

      for (const successfulFinding of result.successful) {
        writeFindingToCaches(successfulFinding)
      }

      for (const failure of result.failed) {
        restoreFindingFromSnapshot(snapshot, failure.finding.id)
        console.error(failure.error)
      }

      await invalidateFindingReads(findings.map((finding) => finding.id))
      toastBatchSummary(result, "Updated", "update")

      return result
    },

    async deleteFindings(findings) {
      if (findings.length === 0) {
        return {
          successful: [],
          failed: []
        }
      }

      const result = createBatchResult(
        findings,
        await Promise.allSettled(
          findings.map((finding) => deleteFindingRequest(finding.id))
        )
      )

      for (const failure of result.failed) {
        console.error(failure.error)
      }

      await invalidateFindingReads(findings.map((finding) => finding.id))
      toastBatchSummary(result, "Deleted", "delete")

      return result
    }
  }
}
