import type { AuthApplicationErrorCatalog } from "./application-error/auth.js"
import type { RoleApplicationErrorCatalog } from "./application-error/role.js"
import type { UserProfileApplicationErrorCatalog } from "./application-error/user-profile.js"

export type { AuthApplicationErrorCatalog } from "./application-error/auth.js"
export type { RoleApplicationErrorCatalog } from "./application-error/role.js"
export type { UserProfileApplicationErrorCatalog } from "./application-error/user-profile.js"

export type ApplicationErrorCatalog = AuthApplicationErrorCatalog &
  RoleApplicationErrorCatalog &
  UserProfileApplicationErrorCatalog

export type ApplicationErrorCode = keyof ApplicationErrorCatalog

export type ApplicationErrorKind =
  ApplicationErrorCatalog[ApplicationErrorCode]["kind"]

type KindFor<Code extends ApplicationErrorCode> =
  ApplicationErrorCatalog[Code]["kind"]

type DetailsFor<Code extends ApplicationErrorCode> =
  Code extends ApplicationErrorCode
    ? ApplicationErrorCatalog[Code] extends { details: infer Details }
      ? Details
      : undefined
    : never

export type ApplicationErrorInput = {
  [Code in ApplicationErrorCode]: {
    code: Code
    message: string
    cause?: unknown
  } & ApplicationErrorCatalog[Code]
}[ApplicationErrorCode]

type ApplicationErrorInputFor<Code extends ApplicationErrorCode> = Extract<
  ApplicationErrorInput,
  { code: Code }
>

export class ApplicationError<
  Code extends ApplicationErrorCode = ApplicationErrorCode
> extends Error {
  readonly code: Code
  readonly kind: KindFor<Code>
  readonly details: DetailsFor<Code>

  constructor(input: ApplicationErrorInputFor<Code>) {
    super(input.message, { cause: input.cause })
    this.name = "ApplicationError"
    this.code = input.code
    this.kind = input.kind as KindFor<Code>
    this.details = (
      "details" in input ? input.details : undefined
    ) as DetailsFor<Code>
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError
}
