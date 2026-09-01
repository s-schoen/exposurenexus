import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { FileMigrationProvider, Migrator } from "kysely/migration";

import type { Database } from "./index.js";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function createMigrationProvider(): FileMigrationProvider {
  return new FileMigrationProvider({
    fs,
    path,
    migrationFolder,
  });
}

export async function migrateToLatest(database: Kysely<Database>, logger: Logger): Promise<void> {
  const migrator = new Migrator({
    db: database,
    provider: createMigrationProvider(),
  });

  logger.info("migrating database");
  const { error, results } = await migrator.migrateToLatest();

  if (results && results.length === 0) {
    logger.info("no migrations to apply");
  }

  results?.forEach((it) => {
    if (it.status === "Success") {
      logger.info(`migration "${it.migrationName}" applied successfully`);
    } else if (it.status === "Error") {
      logger.error(`failed to apply migration "${it.migrationName}"`);
    }
  });

  if (error) {
    logger.error("failed to migrate");
    logger.error(error);
    throw error;
  }
}
