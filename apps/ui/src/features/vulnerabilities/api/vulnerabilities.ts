import { vulnerabilityCatalogSchema } from "@exposurenexus/contracts/model/vulnerability";

import {
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/lib/api-client.ts";

import type {
  VulnerabilityCatalog,
  VulnerabilityInput,
} from "@exposurenexus/contracts/model/vulnerability";

export async function listVulnerabilities(): Promise<Array<VulnerabilityCatalog>> {
  const response = await apiRequest("/api/vulnerabilities", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, vulnerabilityCatalogSchema);
}

export async function getVulnerabilityByID(id: string): Promise<VulnerabilityCatalog> {
  const response = await apiRequest(`/api/vulnerabilities/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, vulnerabilityCatalogSchema);
}

export async function createVulnerability(
  vulnerability: VulnerabilityInput,
): Promise<VulnerabilityCatalog> {
  const response = await apiRequest("/api/vulnerabilities", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(vulnerability),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, vulnerabilityCatalogSchema);
}

export async function updateVulnerability(
  id: string,
  vulnerability: VulnerabilityInput,
): Promise<VulnerabilityCatalog> {
  const response = await apiRequest(`/api/vulnerabilities/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(vulnerability),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, vulnerabilityCatalogSchema);
}

export async function deleteVulnerability(id: string): Promise<VulnerabilityCatalog> {
  const response = await apiRequest(`/api/vulnerabilities/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, vulnerabilityCatalogSchema);
}
