import { sql } from "kysely";

import type { Kysely } from "kysely";

export async function up(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("import_source").addColumn("uploadStartedAt", "timestamptz").execute();
  // Only unused scanner registrations remain eligible; legacy creation already owned its key.
  await sql`update import_source set "uploadStartedAt" = "createdAt"
    where source is null or state <> 'incomplete' or "availableAt" is not null
      or "failedAt" is not null or "deletedAt" is not null or "ingestionId" is not null`.execute(
    db,
  );
}

export async function down(db: Kysely<object>): Promise<void> {
  await db.schema.alterTable("import_source").dropColumn("uploadStartedAt").execute();
}
