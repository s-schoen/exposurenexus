import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createFindingByIDQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  useCreateFindingMutation,
  useDeleteFindingMutation,
  useLinkFindingVulnerabilityMutation,
  useUnlinkFindingVulnerabilityMutation,
  useUpdateFindingMutation,
} from "@/api/finding.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";
import { formatFindingCount } from "@/lib/format.ts";

import type {
  CreateManualFinding,
  FindingProjection,
  UpdateFinding,
} from "@exposurenexus/types/model/finding";

export type FindingEditableField =
  | "title"
  | "severity"
  | "status"
  | "mitigation"
  | "assigneeId"
  | "dueDate"
  | "weakness"
  | "affectedResource";

export type FindingBulkEditableField = "severity" | "status";

export interface FindingLifecycleFailure {
  finding: FindingProjection | FindingReference;
  error: unknown;
}

export interface FindingLifecycleBatchResult {
  successful: Array<FindingProjection>;
  failed: Array<FindingLifecycleFailure>;
}

export type FindingReference = Pick<FindingProjection, "id">;

export type FindingDeleteBatchResult = FindingLifecycleBatchResult;

type FindingCacheValue = FindingProjection;

export interface FindingLifecycleActions {
  /**
   * Creates a finding, shows default success/failure toasts, and invalidates
   * finding list and stats queries.
   *
   * Returns the created finding projection on success. Returns null for handled API
   * failures; callers do not need to catch to show errors.
   */
  createFinding: (value: CreateManualFinding) => Promise<FindingProjection | null>;

  /**
   * Updates one mutable finding field with optimistic list/detail cache updates.
   *
   * Returns the updated finding on success. Returns null for handled API
   * failures after rolling optimistic cache writes back.
   */
  updateFindingField: <TKey extends FindingEditableField>(
    finding: FindingProjection,
    key: TKey,
    value: FindingProjection[TKey],
  ) => Promise<FindingProjection | null>;

  correctFinding: (
    finding: FindingProjection,
    update: UpdateFinding,
  ) => Promise<FindingProjection | null>;

  /**
   * Updates one bulk-editable field for many findings, shows default summary
   * toasts, and returns per-finding success/failure details.
   *
   * API failures are represented in the returned result instead of thrown.
   */
  bulkUpdateFindingField: <TKey extends FindingBulkEditableField>(
    findings: Array<FindingProjection>,
    key: TKey,
    value: FindingProjection[TKey],
  ) => Promise<FindingLifecycleBatchResult>;

  /**
   * Deletes many findings, shows default summary toasts, and returns per-finding
   * success/failure details.
   *
   * Confirmation stays with the caller. API failures are represented in the
   * returned result instead of thrown.
   */
  deleteFindings: (findings: Array<FindingReference>) => Promise<FindingDeleteBatchResult>;
  linkVulnerability: (
    findingId: string,
    vulnerabilityId: string,
  ) => Promise<FindingProjection | null>;
  unlinkVulnerability: (
    findingId: string,
    vulnerabilityId: string,
  ) => Promise<FindingProjection | null>;
}

interface FindingCacheSnapshot {
  list: Array<FindingCacheValue> | undefined;
  details: Map<string, FindingCacheValue | undefined>;
}

const listQueryKey = createListFindingsQueryOptions().queryKey;
const statsQueryKey = createFindingStatsQueryOptions().queryKey;

function detailQueryKey(findingId: string) {
  return createFindingByIDQueryOptions(findingId).queryKey;
}

function replaceFindingInList(
  findings: Array<FindingCacheValue> | undefined,
  nextFinding: FindingCacheValue,
) {
  return findings?.map((finding) => (finding.id === nextFinding.id ? nextFinding : finding));
}

function findingWithField<TKey extends FindingEditableField>(
  finding: FindingProjection,
  key: TKey,
  value: FindingProjection[TKey],
): FindingProjection {
  return {
    ...finding,
    [key]: value,
  };
}

function createBatchResult(
  findings: Array<FindingProjection>,
  results: Array<PromiseSettledResult<FindingProjection>>,
): FindingLifecycleBatchResult {
  return results.reduce<FindingLifecycleBatchResult>(
    (result, settled, index) => {
      if (settled.status === "fulfilled") {
        result.successful.push(settled.value);
      } else {
        result.failed.push({
          finding: findings[index],
          error: settled.reason,
        });
      }

      return result;
    },
    {
      successful: [],
      failed: [],
    },
  );
}

function toastBatchSummary(
  result: { successful: Array<unknown>; failed: Array<unknown> },
  action: "Deleted" | "Updated",
  failureVerb: "delete" | "update",
) {
  const total = result.successful.length + result.failed.length;

  if (result.failed.length === 0) {
    toast.success(`${action} ${formatFindingCount(result.successful.length)}`);
    return;
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to ${failureVerb} ${formatFindingCount(total)}`);
    return;
  }

  toast.error(
    `${action} ${formatFindingCount(result.successful.length)}; failed ${formatFindingCount(result.failed.length)}`,
  );
}

export function useFindingLifecycle(): FindingLifecycleActions {
  const queryClient = useQueryClient();
  const findingCreate = useCreateFindingMutation();
  const findingUpdate = useUpdateFindingMutation();
  const findingDelete = useDeleteFindingMutation();
  const findingVulnerabilityLink = useLinkFindingVulnerabilityMutation();
  const findingVulnerabilityUnlink = useUnlinkFindingVulnerabilityMutation();

  function snapshotFindings(findingIds: Array<string>): FindingCacheSnapshot {
    return {
      list: queryClient.getQueryData<Array<FindingCacheValue>>(listQueryKey),
      details: new Map(
        findingIds.map((id) => [
          id,
          queryClient.getQueryData<FindingCacheValue>(detailQueryKey(id)),
        ]),
      ),
    };
  }

  function writeFindingToCaches(finding: FindingCacheValue) {
    queryClient.setQueryData(detailQueryKey(finding.id), finding);
    queryClient.setQueryData<Array<FindingCacheValue>>(listQueryKey, (current) =>
      replaceFindingInList(current, finding),
    );
  }

  function restoreFindingFromSnapshot(snapshot: FindingCacheSnapshot, findingId: string) {
    const previousDetail = snapshot.details.get(findingId);

    if (previousDetail) {
      queryClient.setQueryData(detailQueryKey(findingId), previousDetail);
    } else {
      queryClient.removeQueries({
        queryKey: detailQueryKey(findingId),
        exact: true,
      });
    }

    queryClient.setQueryData<Array<FindingCacheValue>>(listQueryKey, (current) => {
      if (!current || !snapshot.list) {
        return current;
      }

      const previousFinding = snapshot.list.find((finding) => finding.id === findingId);

      if (!previousFinding) {
        return current;
      }

      return replaceFindingInList(current, previousFinding);
    });
  }

  async function invalidateFindingReads(findingIds: Array<string>) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: statsQueryKey,
        exact: true,
      }),
      ...findingIds.map((id) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(id),
          exact: true,
        }),
      ),
    ]);
  }

  return {
    async createFinding(value) {
      try {
        const createdFinding = await findingCreate.mutateAsync(value);

        toast.success("Finding created");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: listQueryKey,
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: statsQueryKey,
            exact: true,
          }),
        ]);

        return createdFinding;
      } catch (error) {
        toastActionError(error, `Failed to create finding: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async updateFindingField(finding, key, value) {
      if (finding[key] === value) {
        return finding;
      }

      const nextFinding = findingWithField(finding, key, value);
      const snapshot = snapshotFindings([finding.id]);

      try {
        // Keep split list/detail views in sync while the edit is pending; the
        // server response refreshes authoritative audit fields before refetch.
        writeFindingToCaches(nextFinding);

        const updatedFinding = await findingUpdate.mutateAsync({
          id: finding.id,
          update: { [key]: value },
        });

        writeFindingToCaches(updatedFinding);
        await invalidateFindingReads([finding.id]);

        return updatedFinding;
      } catch (error) {
        // Restore both caches so a failed inline edit cannot leave the list and
        // detail panes showing different lifecycle state.
        restoreFindingFromSnapshot(snapshot, finding.id);
        toastActionError(error, "Failed to update finding");
        console.error(error);
        return null;
      }
    },

    async correctFinding(finding, update) {
      const nextFinding = { ...finding, ...update };
      const snapshot = snapshotFindings([finding.id]);

      try {
        writeFindingToCaches(nextFinding);
        const updatedFinding = await findingUpdate.mutateAsync({ id: finding.id, update });
        writeFindingToCaches(updatedFinding);
        await invalidateFindingReads([finding.id]);
        return updatedFinding;
      } catch (error) {
        restoreFindingFromSnapshot(snapshot, finding.id);
        toastActionError(error, "Failed to update finding");
        console.error(error);
        return null;
      }
    },

    async bulkUpdateFindingField(findings, key, value) {
      if (findings.length === 0) {
        return {
          successful: [],
          failed: [],
        };
      }

      const snapshot = snapshotFindings(findings.map((finding) => finding.id));
      const nextFindings = findings.map((finding) => findingWithField(finding, key, value));

      // Apply the batch optimistically to every visible cache entry, then let
      // each settled request either canonicalize or restore its own row.
      for (const nextFinding of nextFindings) {
        writeFindingToCaches(nextFinding);
      }

      const result = createBatchResult(
        findings,
        await Promise.allSettled(
          nextFindings.map((nextFinding) =>
            findingUpdate.mutateAsync({
              id: nextFinding.id,
              update: { [key]: value },
            }),
          ),
        ),
      );

      for (const successfulFinding of result.successful) {
        writeFindingToCaches(successfulFinding);
      }

      for (const failure of result.failed) {
        restoreFindingFromSnapshot(snapshot, failure.finding.id);
        console.error(failure.error);
      }

      await invalidateFindingReads(findings.map((finding) => finding.id));
      toastBatchSummary(result, "Updated", "update");

      return result;
    },

    async deleteFindings(findings) {
      if (findings.length === 0) {
        return {
          successful: [],
          failed: [],
        };
      }

      const settled = await Promise.allSettled(
        findings.map((finding) => findingDelete.mutateAsync(finding.id)),
      );
      const result = settled.reduce<FindingDeleteBatchResult>(
        (batchResult, item, index) => {
          if (item.status === "fulfilled") {
            batchResult.successful.push(item.value);
          } else {
            batchResult.failed.push({
              finding: findings[index],
              error: item.reason,
            });
          }

          return batchResult;
        },
        {
          successful: [],
          failed: [],
        },
      );

      for (const failure of result.failed) {
        console.error(failure.error);
      }

      await invalidateFindingReads(findings.map((finding) => finding.id));
      toastBatchSummary(result, "Deleted", "delete");

      return result;
    },

    async linkVulnerability(findingId, vulnerabilityId) {
      try {
        const finding = await findingVulnerabilityLink.mutateAsync({
          findingId,
          vulnerabilityId,
        });
        writeFindingToCaches(finding);
        await invalidateFindingReads([findingId]);
        toast.success("Linked catalog entry to finding");
        return finding;
      } catch (error) {
        toastActionError(error, `Failed to link catalog entry: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async unlinkVulnerability(findingId, vulnerabilityId) {
      try {
        const finding = await findingVulnerabilityUnlink.mutateAsync({
          findingId,
          vulnerabilityId,
        });
        writeFindingToCaches(finding);
        await invalidateFindingReads([findingId]);
        toast.success("Unlinked catalog entry from finding");
        return finding;
      } catch (error) {
        toastActionError(error, `Failed to unlink catalog entry: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },
  };
}
