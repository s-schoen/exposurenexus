import { env } from "@/env.ts"
import {
  DEFAULT_QUERY_STALE_TIME,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"
import type {
  CreateFinding,
  Finding,
  FindingStatistics
} from "@openvlp/types/model/finding"
import { keepPreviousData } from "@tanstack/react-query"

async function listFindings(): Promise<Finding[]> {
  const response = await fetch(`${env.VITE_API_URL}/api/findings`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseArrayReply<Finding>(response)
}

export async function deleteFinding(id: string): Promise<Finding> {
  const response = await fetch(`${env.VITE_API_URL}/api/findings/${id}`, {
    method: "DELETE",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Finding>(response)
}

async function getFindingByID(id: string): Promise<Finding> {
  const response = await fetch(`${env.VITE_API_URL}/api/findings/${id}`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<Finding>(response)
}

async function getFindingStats(): Promise<FindingStatistics> {
  const response = await fetch(`${env.VITE_API_URL}/api/findings/stats`, {
    method: "GET",
    credentials: "include"
  })

  if (!response.ok) {
    const error = await parseErrorReply(response)
    console.error(error)
    throw error
  }

  return parseObjectReply<FindingStatistics>(response)
}

export async function createFinding(f: CreateFinding): Promise<Finding> {
  const response = await fetch(`${env.VITE_API_URL}/api/findings`, {
    method: "POST",
    credentials: "include",
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

  return parseObjectReply<Finding>(response)
}

export async function uploadFindingFile(type: string, file: File) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("type", type)

  const response = await fetch(`${env.VITE_API_URL}/api/findings/import`, {
    method: "POST",
    credentials: "include",
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
