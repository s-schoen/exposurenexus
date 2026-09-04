import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createDatabase, migrateToLatest } from "@exposurenexus/backend/database";
import { PGliteDialect, sql } from "kysely";

import type { Database } from "@exposurenexus/backend/database";
import type { Asset, AssetIdentifier } from "@exposurenexus/contracts/model/asset";
import type { Kysely } from "kysely";

export interface TestDatabase {
  db: Kysely<Database>;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

export function createTestDatabase(): TestDatabase {
  let pgLite: PGlite | null = null;
  let db: Kysely<Database> | null = null;

  return {
    get db(): Kysely<Database> {
      if (!db) {
        throw new Error("test database has not been started");
      }

      return db;
    },

    async start(): Promise<void> {
      pgLite = new PGlite("memory://", {
        extensions: {
          pgcrypto,
        },
      });
      await pgLite.waitReady;

      db = createDatabase(new PGliteDialect({ pglite: pgLite }));

      await db.executeQuery(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.compile(db));
      await migrateToLatest(db, {
        info: () => {},
        error: () => {},
      } as never);
    },

    async dispose(): Promise<void> {
      if (db) {
        await db.destroy();
      }

      if (pgLite && !pgLite.closed) {
        await pgLite.close();
      }
    },
  };
}
export type CreateTestAssetRecord = Omit<Asset, "id" | "identifiers"> & {
  identifiers?: readonly AssetIdentifier[];
};

export async function insertTestAsset(
  db: Kysely<Database>,
  asset: CreateTestAssetRecord,
): Promise<Asset> {
  return await db.transaction().execute(async (trx) => {
    const { identifiers = [], ...record } = asset;
    const created = await trx
      .insertInto("asset")
      .values(record)
      .returningAll()
      .executeTakeFirstOrThrow();
    const identifierRows =
      identifiers.length === 0
        ? []
        : await trx
            .insertInto("asset_identifier")
            .values(identifiers.map((identifier) => ({ assetId: created.id, ...identifier })))
            .returningAll()
            .execute();

    return {
      ...created,
      identifiers: identifierRows.map((identifier) => ({
        id: identifier.id,
        type: identifier.type,
        namespace: identifier.namespace,
        value: identifier.value,
      })),
    };
  });
}

export async function resetTestDatabase(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("asset_identifier").execute();
  await db.deleteFrom("asset_custom_field_value").execute();
  await db.deleteFrom("asset_custom_field_option").execute();
  await db.deleteFrom("asset_custom_field").execute();
  await db.deleteFrom("observation").execute();
  await db.deleteFrom("finding_vulnerability").execute();
  await db.deleteFrom("ingestion").execute();
  await db.deleteFrom("finding").execute();
  await db.deleteFrom("vulnerability").execute();
  await db.deleteFrom("asset").execute();
  await db.deleteFrom("user_session").execute();
  await db.deleteFrom("user_role_assignment").execute();
  await db.deleteFrom("user_profile").execute();
}
