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
import * as m10 from "./migrations/20260427-drop-better-auth-tables.js"
import * as m11 from "./migrations/20260427-asset-custom-fields.js"
import * as m12 from "./migrations/20260430-01-rbac-custom-field-permissions.js"
import * as m13 from "./migrations/20260430-02-rbac-custom-field-built-in-roles.js"
import * as m14 from "./migrations/20260430-03-asset-custom-field-assignments.js"
import * as m15 from "./migrations/20260503-asset-owner.js"
import * as m16 from "./migrations/20260506-finding-assignee.js"
import * as m17 from "./migrations/20260506-finding-due-date.js"
import * as m18 from "./migrations/20260509-vulnerability-source-mapping-unique.js"
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
      },
      "20260428-drop-better-auth-tables": {
        up: m10.up,
        down: m10.down
      },
      "20260429-asset-custom-fields": {
        up: m11.up,
        down: m11.down
      },
      "20260430-01-rbac-custom-field-permissions": {
        up: m12.up,
        down: m12.down
      },
      "20260430-02-rbac-custom-field-built-in-roles": {
        up: m13.up,
        down: m13.down
      },
      "20260430-03-asset-custom-field-assignments": {
        up: m14.up,
        down: m14.down
      },
      "20260503-asset-owner": {
        up: m15.up,
        down: m15.down
      },
      "20260506-finding-assignee": {
        up: m16.up,
        down: m16.down
      },
      "20260506-finding-due-date": {
        up: m17.up,
        down: m17.down
      },
      "20260509-vulnerability-source-mapping-unique": {
        up: m18.up,
        down: m18.down
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
  let appliedMigration = false

  while (true) {
    const { error, results } = await migrator.migrateUp()

    if (results && results.length === 0) {
      if (!appliedMigration) {
        targetLogger.info("no migrations to apply")
      }
      break
    }

    results?.forEach((it) => {
      if (it.status === "Success") {
        appliedMigration = true
        targetLogger.info(
          `migration "${it.migrationName}" applied successfully`
        )
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
}
