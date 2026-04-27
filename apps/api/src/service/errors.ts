import { HTTPException } from "hono/http-exception"

interface ErrorWithDatabaseCode extends Error {
  code?: string
  status?: number
  statusCode?: number
}

function isErrorWithMetadata(error: unknown): error is ErrorWithDatabaseCode {
  return error instanceof Error
}

export function isConflictError(error: unknown): boolean {
  if (!isErrorWithMetadata(error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    error.status === 409 ||
    error.statusCode === 409 ||
    error.code === "23505" ||
    message.includes("already exists") ||
    message.includes("duplicate")
  )
}

export function isForeignKeyError(error: unknown): boolean {
  if (!isErrorWithMetadata(error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    error.code === "23503" ||
    message.includes("foreign key") ||
    message.includes("violates foreign key constraint")
  )
}

export function badRequest(message: string): HTTPException {
  return new HTTPException(400, { message })
}

export function conflict(message: string): HTTPException {
  return new HTTPException(409, { message })
}

export function forbidden(message: string): HTTPException {
  return new HTTPException(403, { message })
}
