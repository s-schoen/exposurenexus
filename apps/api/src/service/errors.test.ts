import { describe, expect, it } from "vitest"
import {
  badRequest,
  conflict,
  forbidden,
  isConflictError,
  isForeignKeyError
} from "./errors.js"

describe("service errors", () => {
  it("detects conflict-shaped errors", () => {
    expect(isConflictError(new Error("role already exists"))).toBe(true)
    expect(isConflictError(new Error("duplicate key value"))).toBe(true)
    expect(
      isConflictError(Object.assign(new Error("db error"), { code: "23505" }))
    ).toBe(true)
    expect(
      isConflictError(
        Object.assign(new Error("request failed"), { status: 409 })
      )
    ).toBe(true)
    expect(
      isConflictError(
        Object.assign(new Error("request failed"), { statusCode: 409 })
      )
    ).toBe(true)
  })

  it("rejects non-conflict errors", () => {
    expect(isConflictError("duplicate" as never)).toBe(false)
    expect(isConflictError(new Error("db offline"))).toBe(false)
  })

  it("detects foreign-key-shaped errors", () => {
    expect(
      isForeignKeyError(
        Object.assign(new Error("violates foreign key constraint"), {
          code: "23503"
        })
      )
    ).toBe(true)
    expect(isForeignKeyError(new Error("foreign key violation"))).toBe(true)
  })

  it("rejects non-foreign-key errors", () => {
    expect(isForeignKeyError("foreign key" as never)).toBe(false)
    expect(isForeignKeyError(new Error("db offline"))).toBe(false)
  })

  it("creates typed HTTP exceptions", () => {
    expect(badRequest("invalid input")).toMatchObject({
      status: 400,
      message: "invalid input"
    })
    expect(conflict("already exists")).toMatchObject({
      status: 409,
      message: "already exists"
    })
    expect(forbidden("not allowed")).toMatchObject({
      status: 403,
      message: "not allowed"
    })
  })
})
