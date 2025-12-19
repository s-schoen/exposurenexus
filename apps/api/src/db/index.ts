import { Pool } from "pg"
import { env } from "../env.js"
import { Kysely, PostgresDialect } from "kysely"
import { createLogger } from "../logging.js"
import type { UserTable } from "./schema/auth.js"

export const logger = createLogger("db")

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10
})

export interface Database {
  user: UserTable
}

const dialect = new PostgresDialect({
  pool: pool
})

export const db = new Kysely<Database>({ dialect })
