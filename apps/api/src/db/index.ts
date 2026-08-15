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
import type { FindingTable } from "./schema/finding.js";
import type {
  RolePermissionAssignmentTable,
  RoleTable,
  UserRoleAssignmentTable,
} from "./schema/rbac.js";
import type {
  VulnerabilitySourceMappingTable,
  VulnerabilityTable,
} from "./schema/vulnerability.js";

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
  vulnerability: VulnerabilityTable;
  vulnerability_source_mapping: VulnerabilitySourceMappingTable;
}

const database = createDatabase(env.DATABASE_URL);

export const logger = database.logger;
export const pool: Pool = database.pool;
export const db: Kysely<Database> = database.db;
