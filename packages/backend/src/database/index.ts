import type {
  AssetCustomFieldAssignmentTable,
  AssetCustomFieldOptionTable,
  AssetCustomFieldTable,
  AssetCustomFieldValueTable,
} from "./schema/asset-custom-field.js";
import type { AssetIdentifierTable, AssetTable } from "./schema/asset.js";
import type { UserProfileTable, UserSessionTable } from "./schema/auth.js";
import type { FindingTable, FindingVulnerabilityTable } from "./schema/finding.js";
import type { IngestionTable } from "./schema/ingestion.js";
import type { ObservationTable } from "./schema/observation.js";
import type {
  RolePermissionAssignmentTable,
  RoleTable,
  UserRoleAssignmentTable,
} from "./schema/rbac.js";
import type { VulnerabilityTable } from "./schema/vulnerability.js";
import type { JobTable } from "@exposurenexus/jobs/postgres";

export { createDatabase, createPostgresDatabase, createPostgresPool } from "./factory.js";
export { migrateToLatest } from "./migration.js";

export interface Database {
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
