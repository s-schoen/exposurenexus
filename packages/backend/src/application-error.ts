import type { AssetCustomFieldApplicationErrorCatalog } from "./features/assets/custom-fields/asset-custom-field-error.js";
import type { AssetApplicationErrorCatalog } from "./features/assets/inventory/asset-error.js";
import type { AuthApplicationErrorCatalog } from "./features/authentication/auth-error.js";
import type { FindingApplicationErrorCatalog } from "./features/findings/finding-error.js";
import type { ObservationApplicationErrorCatalog } from "./features/findings/observation-error.js";
import type { RoleApplicationErrorCatalog } from "./features/identity/roles/role-error.js";
import type { UserProfileApplicationErrorCatalog } from "./features/identity/users/user-profile-error.js";
import type { ImportSourceApplicationErrorCatalog } from "./features/import-sources/import-source-error.js";
import type { StatsApplicationErrorCatalog } from "./features/statistics/stats-error.js";
export type { ImportSourceApplicationErrorCatalog } from "./features/import-sources/import-source-error.js";
import type { VulnerabilityApplicationErrorCatalog } from "./features/vulnerabilities/vulnerability-error.js";

export type { AssetCustomFieldApplicationErrorCatalog } from "./features/assets/custom-fields/asset-custom-field-error.js";
export type { AssetApplicationErrorCatalog } from "./features/assets/inventory/asset-error.js";
export type { AuthApplicationErrorCatalog } from "./features/authentication/auth-error.js";
export type { FindingApplicationErrorCatalog } from "./features/findings/finding-error.js";
export type { ObservationApplicationErrorCatalog } from "./features/findings/observation-error.js";
export type { RoleApplicationErrorCatalog } from "./features/identity/roles/role-error.js";
export type { StatsApplicationErrorCatalog } from "./features/statistics/stats-error.js";
export type { UserProfileApplicationErrorCatalog } from "./features/identity/users/user-profile-error.js";
export type { VulnerabilityApplicationErrorCatalog } from "./features/vulnerabilities/vulnerability-error.js";

export type ApplicationErrorCatalog = AssetApplicationErrorCatalog &
  ImportSourceApplicationErrorCatalog &
  AssetCustomFieldApplicationErrorCatalog &
  AuthApplicationErrorCatalog &
  FindingApplicationErrorCatalog &
  ObservationApplicationErrorCatalog &
  RoleApplicationErrorCatalog &
  StatsApplicationErrorCatalog &
  UserProfileApplicationErrorCatalog &
  VulnerabilityApplicationErrorCatalog;

export type ApplicationErrorCode = keyof ApplicationErrorCatalog;

export type ApplicationErrorKind = ApplicationErrorCatalog[ApplicationErrorCode]["kind"];

type KindFor<Code extends ApplicationErrorCode> = ApplicationErrorCatalog[Code]["kind"];

type DetailsFor<Code extends ApplicationErrorCode> = Code extends ApplicationErrorCode
  ? ApplicationErrorCatalog[Code] extends { details: infer Details }
    ? Details
    : undefined
  : never;

export type ApplicationErrorInput = {
  [Code in ApplicationErrorCode]: {
    code: Code;
    message: string;
    cause?: unknown;
  } & ApplicationErrorCatalog[Code];
}[ApplicationErrorCode];

type ApplicationErrorInputFor<Code extends ApplicationErrorCode> = Extract<
  ApplicationErrorInput,
  { code: Code }
>;

export class ApplicationError<
  Code extends ApplicationErrorCode = ApplicationErrorCode,
> extends Error {
  readonly code: Code;
  readonly kind: KindFor<Code>;
  readonly details: DetailsFor<Code>;

  constructor(input: ApplicationErrorInputFor<Code>) {
    super(input.message, { cause: input.cause });
    this.name = "ApplicationError";
    this.code = input.code;
    this.kind = input.kind as KindFor<Code>;
    this.details = ("details" in input ? input.details : undefined) as DetailsFor<Code>;
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
