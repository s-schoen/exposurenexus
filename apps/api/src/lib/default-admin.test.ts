import { createBackendRuntime } from "@exposurenexus/backend";
import { createAuthentication } from "@exposurenexus/backend/authentication";
import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { pino } from "pino";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDatabase, resetTestDatabase } from "../test/db.js";
import { createDefaultAdmin } from "./default-admin.js";

vi.mock("../env.js", () => ({
  env: {
    PORT: 3001,
    LOG_LEVEL: "info",
    APP_ORIGIN: "http://localhost:3000",
    AUTH_SESSION_LIFETIME: 12,
    AUTH_COOKIE_SECURE: true,
    AUTH_SECRET: "012345678901234567890123456789012345678901234567890123456789",
    DATABASE_URL: "postgres://exposurenexus:exposurenexus@localhost:5432/exposurenexus",
    API_TIMEOUT_MS: 5000,
  },
}));

describe("default admin", () => {
  const testDb = createTestDatabase();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
  };

  beforeAll(async () => {
    await testDb.start();
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTestDatabase(testDb.db);
  });

  it("creates an initial admin profile and role assignment", async () => {
    await createDefaultAdmin({
      db: testDb.db,
      logger: logger as never,
    });

    const admin = await testDb.db
      .selectFrom("user_profile")
      .selectAll()
      .where("username", "=", "admin")
      .executeTakeFirstOrThrow();
    const assignments = await testDb.db
      .selectFrom("user_role_assignment")
      .selectAll()
      .where("userId", "=", admin.id)
      .execute();
    const logMessage = logger.info.mock.calls[0]?.[0] as string;
    const password = logMessage.replace("created admin user: username=admin, password=", "");

    expect(admin).toMatchObject({
      username: "admin",
      displayName: "Administrator",
      email: "admin@localhost.loc",
      enabled: true,
    });
    expect(assignments).toEqual([
      {
        userId: admin.id,
        roleId: builtInRoleIds.admin,
      },
    ]);
    const authentication = createAuthentication(
      createBackendRuntime({ database: testDb.db, logger: pino({ enabled: false }) }),
      {
        sessionLifetimeHours: 12,
        sessionHmacSecret: "012345678901234567890123456789012345678901234567890123456789",
      },
    );
    await expect(
      authentication.createSessionForCredentials({
        username: admin.username,
        password,
      }),
    ).resolves.toMatchObject({ authenticated: true });
  });

  it("does not create another admin when a profile already exists", async () => {
    await testDb.db
      .insertInto("user_profile")
      .values({
        username: "existing",
        displayName: "Existing User",
        email: "existing@example.com",
        enabled: true,
        passwordHash: "hash",
      })
      .execute();

    await createDefaultAdmin({
      db: testDb.db,
      logger: logger as never,
    });

    const profiles = await testDb.db.selectFrom("user_profile").selectAll().execute();

    expect(profiles).toHaveLength(1);
    expect(logger.debug).toHaveBeenCalledWith("admin user already exists");
    expect(logger.info).not.toHaveBeenCalled();
  });
});
