import type {
  AssetCustomFieldAssignmentTable,
  AssetCustomFieldOptionTable,
  AssetCustomFieldTable,
  AssetCustomFieldValueTable,
} from "../features/assets/custom-fields/asset-custom-field-table.js";
import type { AssetIdentifierTable, AssetTable } from "../features/assets/inventory/asset-table.js";
import type { UserSessionTable } from "../features/authentication/session-table.js";
import type {
  FindingTable,
  FindingVulnerabilityTable,
} from "../features/findings/finding-table.js";
import type { ObservationTable } from "../features/findings/observation-table.js";
import type {
  RolePermissionAssignmentTable,
  RoleTable,
  UserRoleAssignmentTable,
} from "../features/identity/roles/rbac-table.js";
import type { UserProfileTable } from "../features/identity/users/user-table.js";
import type { ImportSourceTable } from "../features/import-sources/import-source-table.js";
import type { VulnerabilityTable } from "../features/vulnerabilities/vulnerability-table.js";
import type { IngestionTable } from "./schema/ingestion.js";
import type { JobTable } from "@exposurenexus/jobs/postgres";

export { createDatabase, createPostgresDatabase, createPostgresPool } from "./factory.js";
export { checkDatabaseMigrations, migrateToLatest } from "./migration.js";

export interface Database {
  import_source: ImportSourceTable;
  job: JobTable;
  user_profile: UserProfileTable;
  role: RoleTable;
  role_permission_assignment: RolePermissionAssignmentTable;
  user_role_assignment: UserRoleAssignmentTable;
  user_session: UserSessionTable;
  asset: AssetTable;
  asset_identifier: AssetIdentifierTable;
  asset_custom_field: AssetCustomFieldTable;
  asset_custom_field_assignment: AssetCustomFieldAssignmentTable;
  asset_custom_field_option: AssetCustomFieldOptionTable;
  asset_custom_field_value: AssetCustomFieldValueTable;
  finding: FindingTable;
  finding_vulnerability: FindingVulnerabilityTable;
  vulnerability: VulnerabilityTable;
  observation: ObservationTable;
  ingestion: IngestionTable;
}
