import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rawIdentity = { kind: "raw-identity" };
  const identity = {
    users: { kind: "identity-users", getByID: vi.fn() },
    roles: { kind: "identity-roles" },
    authorization: { userHasPermission: vi.fn() },
  };

  return {
    rawIdentity,
    identity,
    createIdentity: vi.fn(() => rawIdentity),
    decorateIdentityWithEvents: vi.fn(() => identity),
    createApp: vi.fn(() => ({ fetch: vi.fn() })),
    createAuthRoute: vi.fn(() => ({ route: "auth" })),
    createAuthAnnotate: vi.fn(() => vi.fn()),
    createAuthCookiePolicy: vi.fn(() => ({ secure: true })),
    createCsrfProtection: vi.fn(() => ({ middleware: vi.fn() })),
    authNRequire: vi.fn(() => vi.fn()),
    createRequireDomainPermission: vi.fn(() => vi.fn(() => vi.fn())),
    createDefaultAdmin: vi.fn(),
    createAssetRoute: vi.fn(() => ({ route: "assets" })),
    createRoleRoute: vi.fn(() => ({ route: "roles" })),
    createUserRoute: vi.fn(() => ({ route: "users" })),
    createVulnerabilityRoute: vi.fn(() => ({ route: "vulnerabilities" })),
    createFindingStatsRoute: vi.fn(() => ({ route: "stats" })),
    createFindingRoute: vi.fn(() => ({ route: "findings" })),
    createImportRoute: vi.fn(() => ({ route: "import" })),
    registerEventHandlers: vi.fn(),
    createAuthService: vi.fn(() => ({
      kind: "auth-service",
      validateSession: vi.fn(),
      createSessionForCredentials: vi.fn(),
      revokeSession: vi.fn(),
    })),
    createAssetCustomFieldService: vi.fn(() => ({
      kind: "asset-custom-field-service",
    })),
    createAssetService: vi.fn(() => ({ kind: "asset-service" })),
    createFindingService: vi.fn(() => ({ kind: "finding-service" })),
    createStatsService: vi.fn(() => ({ kind: "stats-service" })),
    createObservationRepository: vi.fn(() => ({ kind: "observation-repo" })),
    createVulnerabilityService: vi.fn(() => ({ kind: "vulnerability-service" })),
    createAuthUserRepository: vi.fn(() => ({ kind: "auth-user-repo" })),
  };
});

vi.mock("@exposurenexus/backend/identity", () => ({
  createIdentity: mocks.createIdentity,
}));
vi.mock("./lib/identity-events.js", () => ({
  decorateIdentityWithEvents: mocks.decorateIdentityWithEvents,
}));
vi.mock("./app.js", () => ({ createApp: mocks.createApp }));
vi.mock("./logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false })),
}));
vi.mock("./lib/default-admin.js", () => ({
  createDefaultAdmin: mocks.createDefaultAdmin,
}));
vi.mock("./middleware/auth.js", () => ({
  createAuthAnnotate: mocks.createAuthAnnotate,
  createAuthCookiePolicy: mocks.createAuthCookiePolicy,
  authNRequire: mocks.authNRequire,
  createRequireDomainPermission: mocks.createRequireDomainPermission,
}));
vi.mock("./middleware/csrf.js", () => ({
  createCsrfProtection: mocks.createCsrfProtection,
}));
vi.mock("./routes/health.js", () => ({ default: { route: "health" } }));
vi.mock("./routes/auth.js", () => ({ createAuthRoute: mocks.createAuthRoute }));
vi.mock("./routes/assets.js", () => ({ createAssetRoute: mocks.createAssetRoute }));
vi.mock("./routes/roles.js", () => ({ createRoleRoute: mocks.createRoleRoute }));
vi.mock("./routes/users.js", () => ({ createUserRoute: mocks.createUserRoute }));
vi.mock("./routes/vulnerabilities.js", () => ({
  createVulnerabilityRoute: mocks.createVulnerabilityRoute,
}));
vi.mock("./routes/stats.js", () => ({
  createFindingStatsRoute: mocks.createFindingStatsRoute,
}));
vi.mock("./routes/findings.js", () => ({ createFindingRoute: mocks.createFindingRoute }));
vi.mock("./routes/import.js", () => ({ createImportRoute: mocks.createImportRoute }));
vi.mock("./repository/index.js", () => ({
  createAssetCustomFieldRepository: vi.fn(() => ({ kind: "asset-custom-field-repo" })),
  createAssetRepository: vi.fn(() => ({ kind: "asset-repo" })),
  createAuthUserRepository: mocks.createAuthUserRepository,
  createFindingRepository: vi.fn(() => ({ kind: "finding-repo" })),
  createObservationRepository: mocks.createObservationRepository,
  createUserSessionRepository: vi.fn(() => ({ kind: "user-session-repo" })),
  createVulnerabilityRepository: vi.fn(() => ({ kind: "vulnerability-repo" })),
}));
vi.mock("./service/index.js", () => ({
  createAssetCustomFieldService: mocks.createAssetCustomFieldService,
  createAuthService: mocks.createAuthService,
  createAssetService: mocks.createAssetService,
  createFindingService: mocks.createFindingService,
  createStatsService: mocks.createStatsService,
  createVulnerabilityService: mocks.createVulnerabilityService,
}));
vi.mock("./event-handler/index.js", () => ({
  registerEventHandlers: mocks.registerEventHandlers,
}));

import { createAppContainer } from "./container.js";

const authSessionHmacSecret = "012345678901234567890123456789012345678901234567890123456789";

function createContainerOptions() {
  const logger = pino({ enabled: false });
  return {
    db: {} as never,
    appOrigin: "http://localhost:3000",
    staticDir: "/app/public",
    authSessionLifetimeHours: 12,
    authSessionHmacSecret,
    authCookieSecure: true,
    authTrustedProxies: ["127.0.0.1"],
    apiTimeoutMs: 5000,
    logger,
    accessLogger: logger,
    dbLogger: logger,
    loggerFactory: () => logger,
  };
}

describe("app container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes identity once and uses its nested interfaces", async () => {
    const options = createContainerOptions();
    const container = createAppContainer(options);

    expect(mocks.createIdentity).toHaveBeenCalledOnce();
    expect(mocks.decorateIdentityWithEvents).toHaveBeenCalledWith(
      mocks.rawIdentity,
      expect.objectContaining({ emit: expect.any(Function) }),
    );
    expect(mocks.createAuthUserRepository).toHaveBeenCalledWith(options.db);
    expect(mocks.createAuthService).toHaveBeenCalledWith(
      expect.objectContaining({
        userProfileRepository: { kind: "auth-user-repo" },
        domainEventEmitter: expect.objectContaining({ emit: expect.any(Function) }),
      }),
    );
    expect((mocks.createAuthService.mock.calls as unknown[][])[0]?.[0]).not.toHaveProperty(
      "userRoleRepository",
    );
    expect(mocks.createRequireDomainPermission).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.createUserRoute).toHaveBeenCalledWith(mocks.identity.users, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createRoleRoute).toHaveBeenCalledWith(mocks.identity.roles, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createAssetService).toHaveBeenCalledWith(
      expect.objectContaining({ userProfileService: mocks.identity.users }),
    );
    expect(mocks.createFindingService).toHaveBeenCalledWith(
      expect.objectContaining({ userProfileService: mocks.identity.users }),
    );
    expect(container.services.identity).toBe(mocks.identity);

    await container.createDefaultAdmin();
    expect(mocks.createDefaultAdmin).toHaveBeenCalledWith({
      db: options.db,
      logger: options.dbLogger,
    });
  });

  it("fails fast when auth cookies are configured as insecure", () => {
    mocks.createAuthCookiePolicy.mockImplementationOnce(() => {
      throw new Error("__Host auth cookies require AUTH_COOKIE_SECURE=true");
    });

    expect(() =>
      createAppContainer({
        ...createContainerOptions(),
        authCookieSecure: false,
        authTrustedProxies: [],
      }),
    ).toThrow("__Host auth cookies require AUTH_COOKIE_SECURE=true");
  });
});
