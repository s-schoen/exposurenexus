import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { Kysely, sql } from "kysely"
import { PGliteDialect } from "kysely-pglite-dialect"
import { migrateToLatest } from "../db/migration.js"
import type { Database } from "../db/index.js"

export interface TestDatabase {
  db: Kysely<Database>
  start(): Promise<void>
  dispose(): Promise<void>
}

export function createTestDatabase(): TestDatabase {
  let pgLite: PGlite | null = null
  let db: Kysely<Database> | null = null

  return {
    get db(): Kysely<Database> {
      if (!db) {
        throw new Error("test database has not been started")
      }

      return db
    },

    async start(): Promise<void> {
      pgLite = new PGlite("memory://", {
        extensions: {
          pgcrypto
        }
      })
      await pgLite.waitReady

      db = new Kysely<Database>({
        dialect: new PGliteDialect(pgLite)
      })

      await db.executeQuery(
        sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.compile(db)
      )
      await migrateToLatest(db, {
        info: () => {},
        error: () => {}
      } as never)
    },

    async dispose(): Promise<void> {
      if (db) {
        await db.destroy()
      }

      if (pgLite && !pgLite.closed) {
        await pgLite.close()
      }
    }
  }
}

export async function resetTestDatabase(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("finding").execute()
  await db.deleteFrom("vulnerability_source_mapping").execute()
  await db.deleteFrom("vulnerability").execute()
  await db.deleteFrom("asset").execute()
  await db.deleteFrom("user_session").execute()
  await db.deleteFrom("user_role_assignment").execute()
  await db.deleteFrom("user_profile").execute()
  await db.executeQuery(sql`DELETE FROM "account"`.compile(db))
  await db.executeQuery(sql`DELETE FROM "session"`.compile(db))
  await db.executeQuery(sql`DELETE FROM "verification"`.compile(db))
  await db.executeQuery(sql`DELETE FROM "user"`.compile(db))
}
