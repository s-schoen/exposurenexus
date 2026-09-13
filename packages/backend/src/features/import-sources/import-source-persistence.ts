import type { Database } from "../../database/index.js";
import type { ImportSourceTable } from "./import-source-table.js";
import type { Kysely } from "kysely";

function toMetadata({ bucket: _bucket, objectKey: _objectKey, ...metadata }: ImportSourceTable) {
  return metadata;
}

export async function reserve(database: Kysely<Database>, record: ImportSourceTable) {
  await database.insertInto("import_source").values(record).execute();
}

export async function finalize(database: Kysely<Database>, id: string) {
  const record = await database
    .updateTable("import_source")
    .set({
      state: "available",
      availableAt: new Date(),
      cleanupRequired: false,
    })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
  return toMetadata(record);
}

export async function getMetadata(database: Kysely<Database>, id: string) {
  const record = await database
    .selectFrom("import_source")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return record ? toMetadata(record) : null;
}

export async function getMetadataByIngestionID(database: Kysely<Database>, ingestionId: string) {
  const record = await database
    .selectFrom("import_source")
    .selectAll()
    .where("ingestionId", "=", ingestionId)
    .executeTakeFirst();
  return record ? toMetadata(record) : null;
}

export async function recordFailure(
  database: Kysely<Database>,
  id: string,
  cleanupRequired: boolean,
) {
  await database
    .updateTable("import_source")
    .set({
      state: "incomplete",
      availableAt: null,
      failedAt: new Date(),
      cleanupRequired,
    })
    .where("id", "=", id)
    .returning("id")
    .executeTakeFirstOrThrow();
}

export async function recordDeletion(database: Kysely<Database>, id: string) {
  await database
    .updateTable("import_source")
    .set((eb) => ({
      state: "deleted",
      deletedAt: eb.fn.coalesce("deletedAt", eb.val(new Date())),
      cleanupRequired: false,
    }))
    .where("id", "=", id)
    .returning("id")
    .executeTakeFirstOrThrow();
}

export async function getRecord(database: Kysely<Database>, id: string) {
  return await database
    .selectFrom("import_source")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}
