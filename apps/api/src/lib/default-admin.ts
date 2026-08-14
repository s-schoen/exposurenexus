import { randomUUID } from "node:crypto";

import { builtInRoleIds } from "@exposurenexus/types/model/rbac";

import { hashPlaintextPassword } from "./argon2.js";

import type { Database } from "../db/index.js";
import type { Kysely } from "kysely";
import type { Logger } from "pino";

interface CreateDefaultAdminOptions {
  db: Kysely<Database>;
  logger: Logger;
}

export async function createDefaultAdmin({ db, logger }: CreateDefaultAdminOptions): Promise<void> {
  const { count } = await db
    .selectFrom("user_profile")
    .select(db.fn.countAll<number>().as("count"))
    .executeTakeFirstOrThrow();

  if (count > 0) {
    logger.debug("admin user already exists");
    return;
  }

  const password = randomUUID();

  await db.transaction().execute(async (trx) => {
    const created = await trx
      .insertInto("user_profile")
      .values({
        username: "admin",
        displayName: "Administrator",
        email: "admin@localhost.loc",
        enabled: true,
        passwordHash: await hashPlaintextPassword(password),
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await trx
      .insertInto("user_role_assignment")
      .values({
        userId: created.id,
        roleId: builtInRoleIds.admin,
      })
      .execute();
  });

  logger.info(`created admin user: username=admin, password=${password}`);
}
