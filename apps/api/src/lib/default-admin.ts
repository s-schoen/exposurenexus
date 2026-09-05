import { randomUUID } from "node:crypto";

import type { IdentityUsers } from "@exposurenexus/backend/identity";
import type { Logger } from "pino";

interface CreateDefaultAdminOptions {
  users: Pick<IdentityUsers, "createInitialAdmin">;
  logger: Logger;
}

export async function createDefaultAdmin({
  users,
  logger,
}: CreateDefaultAdminOptions): Promise<void> {
  const password = randomUUID();
  const admin = await users.createInitialAdmin(password);
  if (!admin) {
    logger.debug("admin user already exists");
    return;
  }
  logger.info(`created admin user: username=admin, password=${password}`);
}
