import { keepPreviousData } from "@tanstack/react-query"
import { findingSchema } from "@openvlp/types/model/finding"
import type {
  CreateFinding,
  Finding,
  FindingStatistics
} from "@openvlp/types/model/finding"
import {
  DEFAULT_QUERY_STALE_TIME,
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"

async function listFindings(): Promise<Array<Finding>> {
  const response = await apiRequest("/api/findings", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply(response, findingSchema)
}

export async function deleteFinding(id: string): Promise<Finding> {
  const response = await apiRequest(`/api/findings/${id}`, {
    method: "DELETE"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, findingSchema)
}

async function getFindingByID(id: string): Promise<Finding> {
  const response = await apiRequest(`/api/findings/${id}`, {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, findingSchema)
}

async function getFindingStats(): Promise<FindingStatistics> {
  const response = await apiRequest("/api/findings/stats", {
    method: "GET"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<FindingStatistics>(response)
}

export async function createFinding(f: CreateFinding): Promise<Finding> {
  const response = await apiRequest("/api/findings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(f)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, findingSchema)
}

export async function updateFinding(f: Finding): Promise<Finding> {
  const payload: CreateFinding = {
    vulnerabilityId: f.vulnerabilityId,
    severity: f.severity,
    status: f.status,
    source: f.source,
    evidence: f.evidence,
    mitigation: f.mitigation,
    assetId: f.assetId
  }

  const response = await apiRequest(`/api/findings/${f.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply(response, findingSchema)
}

export async function uploadFindingFile(type: string, file: File) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("type", type)

  const response = await apiRequest("/api/findings/import", {
    method: "POST",
    body: formData
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }
}

export function createListFindingsQueryOptions() {
  return {
    queryKey: ["findings"],
    queryFn: () => listFindings(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  }
}

export function createFindingByIDQueryOptions(id: string) {
  return {
    queryKey: ["findings", id],
    queryFn: () => getFindingByID(id)
  }
}

export function createFindingStatsQueryOptions() {
  return {
    queryKey: ["findings", "stats"],
    queryFn: () => getFindingStats(),
    placeholderData: keepPreviousData,
    staleTime: DEFAULT_QUERY_STALE_TIME
  }
}
