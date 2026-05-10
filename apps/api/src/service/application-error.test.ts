import { describe, expect, expectTypeOf, it } from "vitest"
import {
  ApplicationError,
  type ApplicationErrorInput
} from "./application-error.js"

function assertApplicationErrorInputTypes() {
  const validInput = {
    code: "role.unknown_ids",
    kind: "validation",
    message: "unknown role ids: viewer",
    details: { roleIds: ["viewer"] }
  } satisfies ApplicationErrorInput

  expectTypeOf(validInput.kind).toEqualTypeOf<"validation">()

  // @ts-expect-error role.unknown_ids is pinned to validation.
  const wrongKind: ApplicationErrorInput = {
    code: "role.unknown_ids",
    kind: "conflict",
    message: "unknown role ids: viewer",
    details: { roleIds: ["viewer"] }
  }
  void wrongKind

  // @ts-expect-error role.get_failed requires roleId details.
  const missingDetails: ApplicationErrorInput = {
    code: "role.get_failed",
    kind: "unexpected",
    message: "failed to get role"
  }
  void missingDetails

  const unexpectedDetails: ApplicationErrorInput = {
    code: "role.list_failed",
    kind: "unexpected",
    message: "failed to list roles",
    // @ts-expect-error role.list_failed does not carry structured details.
    details: {}
  }
  void unexpectedDetails

  const wrongConstructorKind = new ApplicationError<"role.unknown_ids">({
    code: "role.unknown_ids",
    // @ts-expect-error constructor input kind is pinned by code.
    kind: "conflict",
    message: "unknown role ids: viewer",
    details: { roleIds: ["viewer"] }
  })
  void wrongConstructorKind
}

describe("application errors", () => {
  it("stores typed object input as runtime error fields", () => {
    const cause = new Error("db offline")
    const error = new ApplicationError({
      code: "role.unknown_ids",
      kind: "validation",
      message: "unknown role ids: viewer",
      cause,
      details: { roleIds: ["viewer"] }
    })

    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({
      name: "ApplicationError",
      code: "role.unknown_ids",
      kind: "validation",
      details: { roleIds: ["viewer"] }
    })
    expect(error.cause).toBe(cause)
  })

  it("supports no-detail error inputs", () => {
    const error = new ApplicationError({
      code: "role.list_failed",
      kind: "unexpected",
      message: "failed to list roles"
    })

    expect(error).toMatchObject({
      code: "role.list_failed",
      kind: "unexpected",
      details: undefined
    })
  })

  it("keeps compile-time input constraints", () => {
    expect(assertApplicationErrorInputTypes).toBeTypeOf("function")
  })
})
