import { HTTPException } from "hono/http-exception"
import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { APIErrorReply } from "@exposurenexus/types/api"
import type { ContextVariables } from "./hono-schema.js"

const INTERNAL_SERVER_ERROR_MESSAGE = "internal server error"

interface ApiErrorOptions {
  reason?: string
  cause?: unknown
  exposeMessage?: boolean
}

export class ApiError extends Error {
  status: ContentfulStatusCode
  reason?: string
  exposeMessage: boolean

  constructor(
    status: ContentfulStatusCode,
    message: string,
    { reason, cause, exposeMessage = false }: ApiErrorOptions = {}
  ) {
    super(message, { cause })
    this.status = status
    this.reason = reason
    this.exposeMessage = exposeMessage
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function badRequest(
  message: string,
  options?: ApiErrorOptions
): ApiError {
  return new ApiError(400, message, options)
}

export function unauthorized(
  message: string = "Unauthorized",
  options?: ApiErrorOptions
): ApiError {
  return new ApiError(401, message, options)
}

export function forbidden(
  message: string = "Forbidden",
  options?: ApiErrorOptions
): ApiError {
  return new ApiError(403, message, options)
}

export function notFound(
  type: string,
  id: string,
  options?: ApiErrorOptions
): ApiError {
  return new ApiError(404, `${type} with id ${id} does not exist`, options)
}

export function routeNotFound(options?: ApiErrorOptions): ApiError {
  return new ApiError(404, "Not Found", options)
}

export function conflict(message: string, options?: ApiErrorOptions): ApiError {
  return new ApiError(409, message, options)
}

export function internalServerError(
  message: string = INTERNAL_SERVER_ERROR_MESSAGE,
  options?: ApiErrorOptions
): ApiError {
  return new ApiError(500, message, options)
}

function shouldExposeMessage(error: ApiError | HTTPException): boolean {
  if (error.status < 500) {
    return true
  }

  return isApiError(error) && error.exposeMessage
}

export function createApiErrorReply(
  correlationId: string,
  error: ApiError | HTTPException
): APIErrorReply {
  const reply: APIErrorReply = {
    correlationId,
    status: error.status,
    error: shouldExposeMessage(error)
      ? error.message
      : INTERNAL_SERVER_ERROR_MESSAGE
  }

  if (isApiError(error) && error.reason) {
    reply.reason = error.reason
  }

  return reply
}

export function replyError(
  c: Context<{ Variables: ContextVariables }>,
  error: ApiError | HTTPException
) {
  return c.json(createApiErrorReply(c.get("requestId"), error), error.status)
}
