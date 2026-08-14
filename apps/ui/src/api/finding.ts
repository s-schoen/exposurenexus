import {
  findingSchema,
  FindingStatistics as findingStatisticsSchema,
  reclassifyFindingsResultSchema,
} from "@exposurenexus/types/model/finding";
import { keepPreviousData, queryOptions, useMutation } from "@tanstack/react-query";

import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/api/common.ts";

import type {
  CreateFinding,
  Finding,
  FindingStatistics,
  ReclassifyFindings,
  ReclassifyFindingsResult,
  UpdateFinding,
} from "@exposurenexus/types/model/finding";

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

export async function createFinding(f: CreateFinding): Promise<Finding> {
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

export async function updateFinding(f: Finding): Promise<Finding> {
  const payload: UpdateFinding = {
    severity: f.severity,
    status: f.status,
    source: f.source,
    evidence: f.evidence,
    mitigation: f.mitigation,
    assigneeId: f.assigneeId,
    dueDate: f.dueDate,
  };

  const response = await apiRequest(`/api/findings/${f.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, findingSchema);
}

export async function uploadFindingFile(type: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  const response = await apiRequest("/api/findings/import", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }
}

export async function reclassifyFindings(
  reclassification: ReclassifyFindings,
): Promise<ReclassifyFindingsResult> {
  const response = await apiRequest("/api/findings/reclassify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reclassification),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, reclassifyFindingsResultSchema);
}

export function createListFindingsQueryOptions() {
  return queryOptions({
    queryKey: ["findings"],
    queryFn: () => listFindings(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function createFindingByIDQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["findings", id],
    queryFn: () => getFindingByID(id),
  });
}

export function createFindingStatsQueryOptions() {
  return queryOptions({
    queryKey: ["findings", "stats"],
    queryFn: () => getFindingStats(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME,
  });
}

export function useCreateFindingMutation() {
  return useMutation({
    mutationFn: (finding: CreateFinding) => createFinding(finding),
  });
}

export function useUpdateFindingMutation() {
  return useMutation({
    mutationFn: (finding: Finding) => updateFinding(finding),
  });
}

export function useDeleteFindingMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteFinding(id),
  });
}

export function useUploadFindingFileMutation() {
  return useMutation({
    mutationFn: ({ type, file }: { type: string; file: File }) => uploadFindingFile(type, file),
  });
}

export function useReclassifyFindingsMutation() {
  return useMutation({
    mutationFn: (reclassification: ReclassifyFindings) => reclassifyFindings(reclassification),
  });
}
