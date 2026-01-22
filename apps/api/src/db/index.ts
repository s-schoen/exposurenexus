import { Pool } from "pg"
import { env } from "../env.js"
import { Kysely, PostgresDialect } from "kysely"
import { createLogger } from "../logging.js"
import type { UserTable } from "./schema/auth.js"
import type { AssetTable } from "./schema/asset.js"
import type { FindingTable } from "./schema/finding.js"
import type {
  VulnerabilitySourceMappingTable,
  VulnerabilityTable
} from "./schema/vulnerability.js"

export const logger = createLogger("db")

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10
})

export interface Database {
  user: UserTable
  asset: AssetTable
  finding: FindingTable
  vulnerability: VulnerabilityTable
  vulnerability_source_mapping: VulnerabilitySourceMappingTable
}

const dialect = new PostgresDialect({
  pool: pool
})

export const db = new Kysely<Database>({ dialect })
