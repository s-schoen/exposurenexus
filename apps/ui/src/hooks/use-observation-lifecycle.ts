import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  useCreateFindingObservationMutation,
  useDeleteFindingObservationMutation,
  useMoveFindingObservationMutation,
  useUpdateFindingObservationMutation,
} from "@/api/finding.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";

import type {
  ManualObservationInput,
  Observation,
  UpdateObservation,
} from "@exposurenexus/contracts/model/observation";

export interface ObservationLifecycleActions {
  addObservation: (findingId: string, value: ManualObservationInput) => Promise<Observation | null>;
  updateObservation: (
    findingId: string,
    observationId: string,
    value: UpdateObservation,
  ) => Promise<Observation | null>;
  deleteObservation: (findingId: string, observationId: string) => Promise<Observation | null>;
  moveObservation: (
    findingId: string,
    observationId: string,
    targetFindingId: string,
  ) => Promise<Observation | null>;
}

async function invalidateObservationReads(
  queryClient: ReturnType<typeof useQueryClient>,
  findingIds: ReadonlyArray<string>,
) {
  const uniqueFindingIds = [...new Set(findingIds)];
  await Promise.all([
    ...uniqueFindingIds.flatMap((findingId) => [
      queryClient.invalidateQueries({
        queryKey: createFindingObservationsQueryOptions(findingId).queryKey,
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: createFindingByIDQueryOptions(findingId).queryKey,
        exact: true,
      }),
    ]),
    queryClient.invalidateQueries({
      queryKey: createListFindingsQueryOptions().queryKey,
      exact: true,
    }),
    queryClient.invalidateQueries({
      queryKey: createFindingStatsQueryOptions().queryKey,
      exact: true,
    }),
  ]);
}

export function useObservationLifecycle(): ObservationLifecycleActions {
  const queryClient = useQueryClient();
  const observationCreate = useCreateFindingObservationMutation();
  const observationUpdate = useUpdateFindingObservationMutation();
  const observationDelete = useDeleteFindingObservationMutation();
  const observationMove = useMoveFindingObservationMutation();

  return {
    async addObservation(findingId, value) {
      try {
        const observation = await observationCreate.mutateAsync({
          findingId,
          observation: value,
        });

        await invalidateObservationReads(queryClient, [findingId]);
        toast.success("Observation added");
        return observation;
      } catch (error) {
        toastActionError(error, `Failed to add observation: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async updateObservation(findingId, observationId, value) {
      try {
        const observation = await observationUpdate.mutateAsync({
          findingId,
          observationId,
          update: value,
        });
        await invalidateObservationReads(queryClient, [findingId]);
        toast.success("Observation updated");
        return observation;
      } catch (error) {
        toastActionError(error, `Failed to update observation: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async deleteObservation(findingId, observationId) {
      try {
        const observation = await observationDelete.mutateAsync({ findingId, observationId });
        await invalidateObservationReads(queryClient, [findingId]);
        toast.success("Observation deleted");
        return observation;
      } catch (error) {
        toastActionError(error, `Failed to delete observation: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async moveObservation(findingId, observationId, targetFindingId) {
      try {
        const observation = await observationMove.mutateAsync({
          findingId,
          observationId,
          targetFindingId,
        });

        await invalidateObservationReads(queryClient, [findingId, targetFindingId]);
        toast.success("Observation moved");
        return observation;
      } catch (error) {
        toastActionError(error, `Failed to move observation: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },
  };
}
