import { env } from "@/env.ts"
import {
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "@/api/common.ts"
import type { Finding } from "@openvlp/types/model/finding"

export async function listFindings(): Promise<Finding[]> {
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

export async function getFindingByID(id: string) {
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

export async function createFinding(f: Finding): Promise<Finding> {
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
