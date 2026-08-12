import { promises as fs } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { FileMigrationProvider, Migrator } from "kysely/migration"
import type { Database } from "./index.js"
import type { Kysely } from "kysely"
import type { Logger } from "pino"

const migrationFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations"
)

export function createMigrationProvider(): FileMigrationProvider {
  return new FileMigrationProvider({
    fs,
    path,
    migrationFolder
  })
}

export async function migrateToLatest(
  targetDb?: Kysely<Database>,
  targetLogger?: Logger
) {
  if (!targetDb || !targetLogger) {
    const defaultDb = await import("./index.js")
    targetDb ??= defaultDb.db
    targetLogger ??= defaultDb.logger
  }

  const migrator = new Migrator({
    db: targetDb,
    provider: createMigrationProvider()
  })

  targetLogger.info("migrating database")
  const { error, results } = await migrator.migrateToLatest()

  if (results && results.length === 0) {
    targetLogger.info("no migrations to apply")
  }

  results?.forEach((it) => {
    if (it.status === "Success") {
      targetLogger.info(`migration "${it.migrationName}" applied successfully`)
    } else if (it.status === "Error") {
      targetLogger.error(`failed to apply migration "${it.migrationName}"`)
    }
  })

  if (error) {
    targetLogger.error("failed to migrate")
    targetLogger.error(error)
    process.exit(1)
  }
}
