import type { Database } from "../../database/index.js";
import type { ImportSourceTable } from "./import-source-table.js";
import type { Kysely } from "kysely";

const metadataColumns = [
  "id",
  "createdBy",
  "originalFilename",
  "expectedSize",
  "actualSize",
  "retentionPolicy",
  "state",
  "createdAt",
  "availableAt",
  "failedAt",
  "deletedAt",
  "cleanupState",
] as const;

export async function reserve(database: Kysely<Database>, record: ImportSourceTable) {
  await database.insertInto("import_source").values(record).execute();
}

export async function finalize(database: Kysely<Database>, id: string, actualSize: number) {
  return await database
    .updateTable("import_source")
    .set({
      state: "available",
      actualSize,
      availableAt: new Date(),
      cleanupState: "not_needed",
    })
    .where("id", "=", id)
    .returning(metadataColumns)
    .executeTakeFirstOrThrow();
}

export async function getMetadata(database: Kysely<Database>, id: string) {
  return (
    (await database
      .selectFrom("import_source")
      .select(metadataColumns)
      .where("id", "=", id)
      .executeTakeFirst()) ?? null
  );
}

export async function recordFailure(
  database: Kysely<Database>,
  id: string,
  actualSize: number | null,
  cleanupState: "pending" | "completed" | "failed",
) {
  await database
    .updateTable("import_source")
    .set({
      state: "incomplete",
      availableAt: null,
      actualSize,
      failedAt: new Date(),
      cleanupState,
    })
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
