import { useMutation } from "@tanstack/react-query";

import {
  createFindingObservation,
  createManualFinding,
  deleteFinding,
  deleteFindingObservation,
  linkFindingVulnerability,
  moveFindingObservation,
  unlinkFindingVulnerability,
  updateFinding,
  updateFindingObservation,
} from "@/features/findings/api/findings.ts";

import type { CreateManualFinding, UpdateFinding } from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  UpdateObservation,
} from "@exposurenexus/contracts/model/observation";

export function useCreateFindingMutation() {
  return useMutation({
    mutationFn: (finding: CreateManualFinding) => createManualFinding(finding),
  });
}

export function useUpdateFindingMutation() {
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: UpdateFinding }) =>
      updateFinding(id, update),
  });
}

export function useDeleteFindingMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteFinding(id),
  });
}

export function useCreateFindingObservationMutation() {
  return useMutation({
    mutationFn: ({
      findingId,
      observation,
    }: {
      findingId: string;
      observation: ManualObservationInput;
    }) => createFindingObservation(findingId, observation),
  });
}

export function useUpdateFindingObservationMutation() {
  return useMutation({
    mutationFn: ({
      findingId,
      observationId,
      update,
    }: {
      findingId: string;
      observationId: string;
      update: UpdateObservation;
    }) => updateFindingObservation(findingId, observationId, update),
  });
}

export function useDeleteFindingObservationMutation() {
  return useMutation({
    mutationFn: ({ findingId, observationId }: { findingId: string; observationId: string }) =>
      deleteFindingObservation(findingId, observationId),
  });
}

export function useMoveFindingObservationMutation() {
  return useMutation({
    mutationFn: ({
      findingId,
      observationId,
      targetFindingId,
    }: {
      findingId: string;
      observationId: string;
      targetFindingId: string;
    }) => moveFindingObservation(findingId, observationId, targetFindingId),
  });
}

export function useLinkFindingVulnerabilityMutation() {
  return useMutation({
    mutationFn: ({ findingId, vulnerabilityId }: { findingId: string; vulnerabilityId: string }) =>
      linkFindingVulnerability(findingId, vulnerabilityId),
  });
}

export function useUnlinkFindingVulnerabilityMutation() {
  return useMutation({
    mutationFn: ({ findingId, vulnerabilityId }: { findingId: string; vulnerabilityId: string }) =>
      unlinkFindingVulnerability(findingId, vulnerabilityId),
  });
}
