import { type Migration, type MigrationProvider, Migrator } from "kysely"
import * as m1 from "./migrations/20251219-init-better-auth.js"
import * as m2 from "./migrations/20251220-assets.js"
import * as m3 from "./migrations/20260118-vulnerability-mapping.js"
import { db, logger } from "./index.js"

class ManualMigrationProvider implements MigrationProvider {
  getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {
      "20251219-init-better-auth": { up: m1.up, down: m1.down },
      "20251220-assets": { up: m2.up, down: m2.down },
      "20260118-vulnerability-mapping": { up: m3.up, down: m3.down }
    }

    return Promise.resolve(migrations)
  }
}

export async function migrateToLatest() {
  const migrator = new Migrator({
    db,
    provider: new ManualMigrationProvider()
  })

  logger.info("migrating database")
  const { error, results } = await migrator.migrateToLatest()

  if (results && results.length === 0) {
    logger.info("no migrations to apply")
  }

  results?.forEach((it) => {
    if (it.status === "Success") {
      logger.info(`migration "${it.migrationName}" applied successfully`)
    } else if (it.status === "Error") {
      logger.error(`failed to apply migration "${it.migrationName}"`)
    }
  })

  if (error) {
    logger.error("failed to migrate")
    logger.error(error)
    process.exit(1)
  }
}
