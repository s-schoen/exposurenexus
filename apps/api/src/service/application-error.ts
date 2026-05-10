export type ApplicationErrorCatalog = {
  "role.list_failed": { kind: "unexpected" }
  "role.get_failed": { kind: "unexpected"; details: { roleId: string } }
  "role.get_by_names_failed": {
    kind: "unexpected"
    details: { roleNames: readonly string[] }
  }
  "role.resolve_ids_failed": {
    kind: "unexpected"
    details: { roleNames: readonly string[] }
  }
  "role.unknown_ids": {
    kind: "validation"
    details: { roleIds: readonly string[] }
  }
  "role.resolve_names_failed": {
    kind: "unexpected"
    details: { roleIds: readonly string[] }
  }
  "role.create_conflict": { kind: "conflict"; details: { roleName: string } }
  "role.create_failed": { kind: "unexpected"; details: { roleName: string } }
  "role.protected_role": { kind: "denied"; details: { roleId: string } }
  "role.update_conflict": {
    kind: "conflict"
    details: { roleId: string; roleName: string }
  }
  "role.update_failed": { kind: "unexpected"; details: { roleId: string } }
  "role.assigned_to_users": {
    kind: "conflict"
    details: { roleId: string; roleName: string }
  }
  "role.delete_failed": { kind: "unexpected"; details: { roleId: string } }
}

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
