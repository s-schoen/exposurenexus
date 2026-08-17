import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createFindingByIDQueryOptions,
  createFindingObservationsQueryOptions,
  createFindingStatsQueryOptions,
  createListFindingsQueryOptions,
  useCreateFindingObservationMutation,
} from "@/api/finding.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";

import type { ManualObservationInput } from "@exposurenexus/types/model/finding";
import type { Observation } from "@exposurenexus/types/model/observation";

export interface ObservationLifecycleActions {
  addObservation: (findingId: string, value: ManualObservationInput) => Promise<Observation | null>;
}

export function useObservationLifecycle(): ObservationLifecycleActions {
  const queryClient = useQueryClient();
  const observationCreate = useCreateFindingObservationMutation();

  return {
    async addObservation(findingId, value) {
      try {
        const observation = await observationCreate.mutateAsync({
          findingId,
          observation: value,
        });

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: createFindingObservationsQueryOptions(findingId).queryKey,
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: createFindingByIDQueryOptions(findingId).queryKey,
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: createListFindingsQueryOptions().queryKey,
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: createFindingStatsQueryOptions().queryKey,
            exact: true,
          }),
        ]);
        toast.success("Observation added");
        return observation;
      } catch (error) {
        toastActionError(error, `Failed to add observation: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },
  };
}
