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
  Finding,
  UpdateFinding,
} from "@exposurenexus/contracts/model/finding";

export interface FindingDeleteFailure {
  finding: Finding;
  error: unknown;
}

export interface FindingDeleteBatchResult {
  successful: Array<Finding>;
  failed: Array<FindingDeleteFailure>;
}

export interface FindingLifecycleActions {
  /**
   * Creates a finding, shows default success/failure toasts, and invalidates
   * finding list and stats queries.
   *
   * Returns the created finding on success. Returns null for handled API
   * failures; callers do not need to catch to show errors.
   */
  createFinding: (value: CreateManualFinding) => Promise<Finding | null>;

  correctFinding: (findingId: string, update: UpdateFinding) => Promise<Finding | null>;

  /**
   * Deletes many findings, shows default summary toasts, and returns per-finding
   * success/failure details.
   *
   * Confirmation stays with the caller. API failures are represented in the
   * returned result instead of thrown.
   */
  deleteFindings: (findings: Array<Finding>) => Promise<FindingDeleteBatchResult>;
  linkVulnerability: (findingId: string, vulnerabilityId: string) => Promise<Finding | null>;
  unlinkVulnerability: (findingId: string, vulnerabilityId: string) => Promise<Finding | null>;
}

const listQueryKey = createListFindingsQueryOptions().queryKey;
const statsQueryKey = createFindingStatsQueryOptions().queryKey;

function detailQueryKey(findingId: string) {
  return createFindingByIDQueryOptions(findingId).queryKey;
}

function replaceFindingInList(findings: Array<Finding> | undefined, nextFinding: Finding) {
  return findings?.map((finding) => (finding.id === nextFinding.id ? nextFinding : finding));
}

function toastDeleteSummary(result: FindingDeleteBatchResult) {
  const total = result.successful.length + result.failed.length;

  if (result.failed.length === 0) {
    toast.success(`Deleted ${formatFindingCount(result.successful.length)}`);
    return;
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to delete ${formatFindingCount(total)}`);
    return;
  }

  toast.error(
    `Deleted ${formatFindingCount(result.successful.length)}; failed ${formatFindingCount(result.failed.length)}`,
  );
}

export function useFindingLifecycle(): FindingLifecycleActions {
  const queryClient = useQueryClient();
  const findingCreate = useCreateFindingMutation();
  const findingUpdate = useUpdateFindingMutation();
  const findingDelete = useDeleteFindingMutation();
  const findingVulnerabilityLink = useLinkFindingVulnerabilityMutation();
  const findingVulnerabilityUnlink = useUnlinkFindingVulnerabilityMutation();

  function writeFindingToCaches(finding: Finding) {
    queryClient.setQueryData(detailQueryKey(finding.id), finding);
    queryClient.setQueryData<Array<Finding>>(listQueryKey, (current) => {
      return replaceFindingInList(current, finding);
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

    async correctFinding(findingId, update) {
      try {
        const updatedFinding = await findingUpdate.mutateAsync({ id: findingId, update });
        writeFindingToCaches(updatedFinding);
        await invalidateFindingReads([findingId]);
        return updatedFinding;
      } catch (error) {
        toastActionError(error, "Failed to update finding");
        console.error(error);
        return null;
      }
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
      toastDeleteSummary(result);

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
