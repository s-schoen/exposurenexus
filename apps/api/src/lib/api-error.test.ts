import { describe, expect, it } from "vitest"
import { HTTPException } from "hono/http-exception"
import {
  badRequest,
  conflict,
  createApiErrorReply,
  forbidden,
  internalServerError,
  isApiError,
  unauthorized
} from "./api-error.js"

describe("api errors", () => {
  it("creates typed API errors", () => {
    expect(badRequest("invalid input")).toMatchObject({
      status: 400,
      message: "invalid input"
    })
    expect(conflict("already exists")).toMatchObject({
      status: 409,
      message: "already exists"
    })
    expect(forbidden()).toMatchObject({
      status: 403,
      message: "Forbidden"
    })
    expect(unauthorized()).toMatchObject({
      status: 401,
      message: "Unauthorized"
    })
  })

  it("serializes explicit client-facing reasons", () => {
    const error = badRequest("invalid custom field", {
      reason: "required-default-missing"
    })

    expect(createApiErrorReply("api-error-test", error)).toEqual({
      correlationId: "api-error-test",
      status: 400,
      error: "invalid custom field",
      reason: "required-default-missing"
    })
  })

  it("does not infer reasons from causes", () => {
    const error = badRequest("invalid custom field", {
      cause: { reason: "internal-detail" }
    })

    expect(createApiErrorReply("api-error-test", error)).toEqual({
      correlationId: "api-error-test",
      status: 400,
      error: "invalid custom field"
    })
  })

  it("serializes server errors with a generic public message", () => {
    expect(
      createApiErrorReply(
        "api-error-test",
        internalServerError("failed to list roles")
      )
    ).toEqual({
      correlationId: "api-error-test",
      status: 500,
      error: "internal server error"
    })
  })

  it("applies the generic server error message to legacy Hono errors", () => {
    expect(
      createApiErrorReply(
        "api-error-test",
        new HTTPException(500, { message: "failed to list roles" })
      )
    ).toEqual({
      correlationId: "api-error-test",
      status: 500,
      error: "internal server error"
    })
  })

  it("identifies API errors", () => {
    expect(isApiError(badRequest("invalid input"))).toBe(true)
    expect(isApiError(new Error("invalid input"))).toBe(false)
  })
})
