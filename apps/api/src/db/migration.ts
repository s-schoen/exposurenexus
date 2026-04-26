import { type Migration, type MigrationProvider, Migrator } from "kysely"
import * as m1 from "./migrations/20251219-init-better-auth.js"
import * as m2 from "./migrations/20251220-assets.js"
import * as m3 from "./migrations/20260118-vulnerability-mapping.js"
import * as m4 from "./migrations/20260414-better-auth-admin.js"
import * as m5 from "./migrations/20260418-rbac-role-default.js"
import * as m6 from "./migrations/20260419-rbac-role-permissions.js"
import * as m7 from "./migrations/20260422-custom-auth.js"
import * as m8 from "./migrations/20260426-user-session-id-text.js"
import * as m9 from "./migrations/20260427-user-role-assignment-primary-key.js"
import { db, logger } from "./index.js"
import type { Database } from "./index.js"
import type { Kysely } from "kysely"
import type { Logger } from "pino"

class ManualMigrationProvider implements MigrationProvider {
  getMigrations(): Promise<Record<string, Migration>> {
    const migrations: Record<string, Migration> = {
      "20251219-init-better-auth": { up: m1.up, down: m1.down },
      "20251220-assets": { up: m2.up, down: m2.down },
      "20260118-vulnerability-mapping": { up: m3.up, down: m3.down },
      "20260414-better-auth-admin": { up: m4.up, down: m4.down },
      "20260418-rbac-role-default": { up: m5.up, down: m5.down },
      "20260419-rbac-role-permissions": { up: m6.up, down: m6.down },
      "20260422-custom-auth": { up: m7.up, down: m7.down },
      "20260426-user-session-id-text": { up: m8.up, down: m8.down },
      "20260427-user-role-assignment-primary-key": {
        up: m9.up,
        down: m9.down
      }
    }

    return Promise.resolve(migrations)
  }
}

export async function migrateToLatest(
  targetDb: Kysely<Database> = db,
  targetLogger: Logger = logger
) {
  const migrator = new Migrator({
    db: targetDb,
    provider: new ManualMigrationProvider()
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
