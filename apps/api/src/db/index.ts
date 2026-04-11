import { Pool } from "pg"
import { env } from "../env.js"
import { Kysely } from "kysely"
import type { UserTable } from "./schema/auth.js"
import type { AssetTable } from "./schema/asset.js"
import type { FindingTable } from "./schema/finding.js"
import type {
  VulnerabilitySourceMappingTable,
  VulnerabilityTable
} from "./schema/vulnerability.js"
import { createDatabase } from "./factory.js"

export interface Database {
  user: UserTable
  asset: AssetTable
  finding: FindingTable
  vulnerability: VulnerabilityTable
  vulnerability_source_mapping: VulnerabilitySourceMappingTable
}

const database = createDatabase(env.DATABASE_URL)

export const logger = database.logger
export const pool: Pool = database.pool
export const db: Kysely<Database> = database.db
