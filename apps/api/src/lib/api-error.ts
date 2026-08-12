import { HTTPException } from "hono/http-exception"
import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { APIErrorReply } from "@exposurenexus/types/api"
import type { ContextVariables } from "./hono-schema.js"
import {
  isApplicationError,
  type ApplicationError,
  type ApplicationErrorCode,
  type ApplicationErrorKind
} from "../service/application-error.js"

const INTERNAL_SERVER_ERROR_MESSAGE = "internal server error"

type ApplicationErrorReasonPolicy<Code extends ApplicationErrorCode> =
  string | ((error: ApplicationError<Code>) => string | undefined)

type ApplicationErrorResponsePolicy<Code extends ApplicationErrorCode> = {
  reason?: ApplicationErrorReasonPolicy<Code>
}

type ApplicationErrorResponsePolicies = {
  [Code in ApplicationErrorCode]?: ApplicationErrorResponsePolicy<Code>
}

// Public reasons are an API contract. Only expose codes or detail-derived
// values here when clients are expected to branch on them.
const applicationErrorResponsePolicies: ApplicationErrorResponsePolicies = {
  "role.unknown_ids": { reason: "role.unknown_ids" },
  "asset_custom_field.definition.rule_violation": {
    reason: (error) => error.details.reason
  }
}

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

function shouldExposeMessage(
  error: ApiError | HTTPException | ApplicationError
): boolean {
  if (isApplicationError(error)) {
    return getApplicationErrorStatus(error.kind) < 500
  }

  if (error.status < 500) {
    return true
  }

  return isApiError(error) && error.exposeMessage
}

function getApplicationErrorStatus(
  kind: ApplicationErrorKind
): ContentfulStatusCode {
  switch (kind) {
    case "validation":
      return 400
    case "missing":
      return 404
    case "denied":
      return 403
    case "conflict":
      return 409
    case "unexpected":
      return 500
  }
}

function getErrorStatus(
  error: ApiError | HTTPException | ApplicationError
): ContentfulStatusCode {
  if (isApplicationError(error)) {
    return getApplicationErrorStatus(error.kind)
  }

  return error.status
}

function getApplicationErrorPublicReason<Code extends ApplicationErrorCode>(
  error: ApplicationError<Code>
): string | undefined {
  const reason = applicationErrorResponsePolicies[error.code]?.reason
  if (typeof reason === "function") {
    return reason(error)
  }

  return reason
}

export function createApiErrorReply(
  correlationId: string,
  error: ApiError | HTTPException | ApplicationError
): APIErrorReply {
  const status = getErrorStatus(error)
  const reply: APIErrorReply = {
    correlationId,
    status,
    error: shouldExposeMessage(error)
      ? error.message
      : INTERNAL_SERVER_ERROR_MESSAGE
  }

  if (isApiError(error) && error.reason) {
    reply.reason = error.reason
  }

  if (isApplicationError(error)) {
    const reason = getApplicationErrorPublicReason(error)
    if (reason) {
      reply.reason = reason
    }
  }

  return reply
}

export function replyError(
  c: Context<{ Variables: ContextVariables }>,
  error: ApiError | HTTPException | ApplicationError
) {
  return c.json(
    createApiErrorReply(c.get("requestId"), error),
    getErrorStatus(error)
  )
}
