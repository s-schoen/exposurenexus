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
import { ApplicationError } from "../service/application-error.js"

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

  it("maps application error kinds to HTTP statuses", () => {
    expect(
      createApiErrorReply(
        "api-error-test",
        new ApplicationError({
          code: "role.unknown_ids",
          kind: "validation",
          message: "unknown role ids: missing-role",
          details: { roleIds: ["missing-role"] }
        })
      )
    ).toMatchObject({
      correlationId: "api-error-test",
      status: 400,
      error: expect.any(String),
      reason: "unknown-role-ids"
    })

    expect(
      createApiErrorReply(
        "api-error-test",
        new ApplicationError({
          code: "role.protected_role",
          kind: "denied",
          message: "built-in roles cannot be modified",
          details: { roleId: "viewer-role-id" }
        })
      )
    ).toMatchObject({
      correlationId: "api-error-test",
      status: 403,
      error: expect.any(String)
    })

    expect(
      createApiErrorReply(
        "api-error-test",
        new ApplicationError({
          code: "role.create_conflict",
          kind: "conflict",
          message: "role already exists",
          details: { roleName: "viewer" }
        })
      )
    ).toMatchObject({
      correlationId: "api-error-test",
      status: 409,
      error: expect.any(String)
    })

    expect(
      createApiErrorReply(
        "api-error-test",
        new ApplicationError({
          code: "role.list_failed",
          kind: "unexpected",
          message: "failed to list roles"
        })
      )
    ).toMatchObject({
      correlationId: "api-error-test",
      status: 500,
      error: expect.any(String)
    })
  })

  it("does not expose application error codes as public reasons by default", () => {
    const error = new ApplicationError({
      code: "role.protected_role",
      kind: "denied",
      message: "built-in roles cannot be modified",
      details: { roleId: "viewer-role-id" }
    })

    const reply = createApiErrorReply("api-error-test", error)

    expect(reply).toMatchObject({
      correlationId: "api-error-test",
      status: 403,
      error: expect.any(String)
    })
    expect(reply).not.toHaveProperty("reason")
  })

  it("does not expose sensitive auth application diagnostics", () => {
    const error = new ApplicationError({
      code: "auth.credentials_session_create_failed",
      kind: "unexpected",
      message: "failed to create session for credentials",
      cause: new Error("credential lookup failed"),
      details: { username: "alice" }
    })

    const reply = createApiErrorReply("api-error-test", error)

    expect(reply).toMatchObject({
      correlationId: "api-error-test",
      status: 500,
      error: expect.any(String)
    })
    expect(reply.error).not.toContain("credentials")
    expect(reply.error).not.toContain("alice")
    expect(reply).not.toHaveProperty("reason")
  })

  it("does not expose user profile application error codes as public reasons", () => {
    const error = new ApplicationError({
      code: "user_profile.role_assignment_invalid",
      kind: "validation",
      message: "invalid user role assignment",
      details: { roleIds: ["missing-role-id"] }
    })

    const reply = createApiErrorReply("api-error-test", error)

    expect(reply).toMatchObject({
      correlationId: "api-error-test",
      status: 400,
      error: expect.any(String)
    })
    expect(reply).not.toHaveProperty("reason")
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
