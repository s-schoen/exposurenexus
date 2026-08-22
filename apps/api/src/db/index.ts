import { Kysely } from "kysely";
import { Pool } from "pg";

import { env } from "../env.js";
import { createDatabase } from "./factory.js";

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

export interface Database {
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

const database = createDatabase(env.DATABASE_URL);

export const logger = database.logger;
export const pool: Pool = database.pool;
export const db: Kysely<Database> = database.db;
