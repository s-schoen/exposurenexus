import {
  findingSchema,
  FindingStatistics as findingStatisticsSchema,
} from "@exposurenexus/types/model/finding";
import { observationSchema } from "@exposurenexus/types/model/observation";
import { keepPreviousData, queryOptions, useMutation } from "@tanstack/react-query";

import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/api/common.ts";

import type {
  CreateManualFinding,
  Finding,
  FindingStatistics,
  UpdateFinding,
} from "@exposurenexus/types/model/finding";
import type {
  ManualObservationInput,
  Observation,
  UpdateObservation,
} from "@exposurenexus/types/model/observation";

async function listFindings(): Promise<Array<Finding>> {
  const response = await apiRequest("/api/findings", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, findingSchema);
}

export async function deleteFinding(id: string): Promise<Finding> {
  const response = await apiRequest(`/api/findings/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

async function getFindingByID(id: string): Promise<Finding> {
  const response = await apiRequest(`/api/findings/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

async function getFindingStats(): Promise<FindingStatistics> {
  const response = await apiRequest("/api/findings/stats", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingStatisticsSchema);
}

async function listFindingObservations(findingId: string): Promise<Array<Observation>> {
  const response = await apiRequest(`/api/findings/${findingId}/observations`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, observationSchema);
}

export async function createFindingObservation(
  findingId: string,
  observation: ManualObservationInput,
): Promise<Observation> {
  const response = await apiRequest(`/api/findings/${findingId}/observations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(observation),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, observationSchema);
}

export async function updateFindingObservation(
  findingId: string,
  observationId: string,
  update: UpdateObservation,
): Promise<Observation> {
  const response = await apiRequest(`/api/findings/${findingId}/observations/${observationId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, observationSchema);
}

export async function deleteFindingObservation(
  findingId: string,
  observationId: string,
): Promise<Observation> {
  const response = await apiRequest(`/api/findings/${findingId}/observations/${observationId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, observationSchema);
}

export async function moveFindingObservation(
  findingId: string,
  observationId: string,
  targetFindingId: string,
): Promise<Observation> {
  const response = await apiRequest(
    `/api/findings/${findingId}/observations/${observationId}/move`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetFindingId }),
    },
  );

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, observationSchema);
}

export async function createManualFinding(f: CreateManualFinding): Promise<Finding> {
  const response = await apiRequest("/api/findings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(f),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

export async function updateFinding(id: string, update: UpdateFinding): Promise<Finding> {
  const response = await apiRequest(`/api/findings/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

export async function linkFindingVulnerability(
  findingId: string,
  vulnerabilityId: string,
): Promise<Finding> {
  const response = await apiRequest(
    `/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`,
    {
      method: "PUT",
    },
  );

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

export async function unlinkFindingVulnerability(
  findingId: string,
  vulnerabilityId: string,
): Promise<Finding> {
  const response = await apiRequest(
    `/api/findings/${findingId}/vulnerabilities/${vulnerabilityId}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

export function createListFindingsQueryOptions() {
  return {
    ...queryOptions({
      queryKey: ["findings"],
      queryFn: () => listFindings(),
      placeholderData: keepPreviousData,
      staleTime: DEFAULT_QUERY_STALE_TIME,
    }),
    queryKey: ["findings"],
  };
}

export function createFindingByIDQueryOptions(id: string) {
  return {
    ...queryOptions({
      queryKey: ["findings", id],
      queryFn: () => getFindingByID(id),
    }),
    queryKey: ["findings", id],
  };
}

export function createFindingStatsQueryOptions() {
  return queryOptions({
    queryKey: ["findings", "stats"],
    queryFn: () => getFindingStats(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createFindingObservationsQueryOptions(findingId: string) {
  return queryOptions({
    queryKey: ["findings", findingId, "observations"],
    queryFn: () => listFindingObservations(findingId),
  });
}

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
