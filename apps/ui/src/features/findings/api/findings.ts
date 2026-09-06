import {
  findingSchema,
  FindingStatistics as findingStatisticsSchema,
} from "@exposurenexus/contracts/model/finding";
import { observationSchema } from "@exposurenexus/contracts/model/observation";

import {
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/lib/api-client.ts";

import type {
  CreateManualFinding,
  Finding,
  FindingStatistics,
  UpdateFinding,
} from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  Observation,
  UpdateObservation,
} from "@exposurenexus/contracts/model/observation";

export async function listFindings(): Promise<Array<Finding>> {
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

export async function getFindingByID(id: string): Promise<Finding> {
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

export async function getFindingStats(): Promise<FindingStatistics> {
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

export async function listFindingObservations(findingId: string): Promise<Array<Observation>> {
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
