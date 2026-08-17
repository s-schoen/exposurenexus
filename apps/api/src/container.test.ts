import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAppMock,
  createAuthRouteMock,
  createAuthAnnotateMock,
  createAuthCookiePolicyMock,
  createCsrfProtectionMock,
  authNRequireMock,
  createRequireDomainPermissionMock,
  createDefaultAdminMock,
  createAssetRouteMock,
  createRoleRouteMock,
  createUserRouteMock,
  createVulnerabilityRouteMock,
  createFindingStatsRouteMock,
  createFindingRouteMock,
  createImportRouteMock,
  registerEventHandlersMock,
  createAuthServiceMock,
  createAssetCustomFieldServiceMock,
  createAssetServiceMock,
  createRoleServiceMock,
  createUserProfileServiceMock,
  createFindingServiceMock,
  createObservationRepositoryMock,
  createVulnerabilityServiceMock,
  roleRepositoryMock,
  userRoleRepositoryMock,
} = vi.hoisted(() => ({
  createAppMock: vi.fn(() => ({ fetch: vi.fn() })),
  createAuthRouteMock: vi.fn(() => ({ route: "auth" })),
  createAuthAnnotateMock: vi.fn(() => vi.fn()),
  createAuthCookiePolicyMock: vi.fn(() => ({ secure: true })),
  createCsrfProtectionMock: vi.fn(() => ({
    middleware: vi.fn(),
    issueToken: vi.fn(),
    clearToken: vi.fn(),
  })),
  authNRequireMock: vi.fn(() => vi.fn()),
  createRequireDomainPermissionMock: vi.fn(() => vi.fn(() => vi.fn())),
  createDefaultAdminMock: vi.fn(),
  createAssetRouteMock: vi.fn(() => ({ route: "assets" })),
  createRoleRouteMock: vi.fn(() => ({ route: "roles" })),
  createUserRouteMock: vi.fn(() => ({ route: "users" })),
  createVulnerabilityRouteMock: vi.fn(() => ({ route: "vulnerabilities" })),
  createFindingStatsRouteMock: vi.fn(() => ({ route: "stats" })),
  createFindingRouteMock: vi.fn(() => ({ route: "findings" })),
  createImportRouteMock: vi.fn(() => ({ route: "import" })),
  registerEventHandlersMock: vi.fn(),
  createAuthServiceMock: vi.fn(() => ({
    kind: "auth-service",
    userHasPermission: vi.fn(),
    validateSession: vi.fn(),
    createSessionForCredentials: vi.fn(),
    revokeSession: vi.fn(),
  })),
  createAssetCustomFieldServiceMock: vi.fn(() => ({
    kind: "asset-custom-field-service",
  })),
  createAssetServiceMock: vi.fn(() => ({ kind: "asset-service" })),
  createRoleServiceMock: vi.fn(() => ({ kind: "role-service" })),
  createUserProfileServiceMock: vi.fn(() => ({ kind: "user-profile-service" })),
  createFindingServiceMock: vi.fn(() => ({ kind: "finding-service" })),
  createObservationRepositoryMock: vi.fn(() => ({ kind: "observation-repo" })),
  createVulnerabilityServiceMock: vi.fn(() => ({
    kind: "vulnerability-service",
  })),
  roleRepositoryMock: {
    list: vi.fn(),
    getByID: vi.fn(),
    getByIDs: vi.fn(),
    getByNames: vi.fn(),
    create: vi.fn(),
    updateByID: vi.fn(),
    deleteByID: vi.fn(),
    hasUsersWithRoleID: vi.fn(),
  },
  userRoleRepositoryMock: {
    listPermissionsByUserID: vi.fn(),
  },
}));

vi.mock("./app.js", () => ({
  createApp: createAppMock,
}));

vi.mock("./logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false })),
}));

vi.mock("./lib/default-admin.js", () => ({
  createDefaultAdmin: createDefaultAdminMock,
}));

vi.mock("./middleware/auth.js", () => ({
  createAuthAnnotate: createAuthAnnotateMock,
  createAuthCookiePolicy: createAuthCookiePolicyMock,
  authNRequire: authNRequireMock,
  createRequireDomainPermission: createRequireDomainPermissionMock,
}));

vi.mock("./middleware/csrf.js", () => ({
  createCsrfProtection: createCsrfProtectionMock,
}));

vi.mock("./routes/health.js", () => ({
  default: { route: "health" },
}));

vi.mock("./routes/auth.js", () => ({
  createAuthRoute: createAuthRouteMock,
}));

vi.mock("./routes/assets.js", () => ({
  createAssetRoute: createAssetRouteMock,
}));

vi.mock("./routes/roles.js", () => ({
  createRoleRoute: createRoleRouteMock,
}));

vi.mock("./routes/users.js", () => ({
  createUserRoute: createUserRouteMock,
}));

vi.mock("./routes/vulnerabilities.js", () => ({
  createVulnerabilityRoute: createVulnerabilityRouteMock,
}));

vi.mock("./routes/stats.js", () => ({
  createFindingStatsRoute: createFindingStatsRouteMock,
}));

vi.mock("./routes/findings.js", () => ({
  createFindingRoute: createFindingRouteMock,
}));

vi.mock("./routes/import.js", () => ({
  createImportRoute: createImportRouteMock,
}));

vi.mock("./repository/index.js", () => ({
  createAssetCustomFieldRepository: vi.fn(() => ({
    kind: "asset-custom-field-repo",
  })),
  createAssetRepository: vi.fn(() => ({ kind: "asset-repo" })),
  createFindingRepository: vi.fn(() => ({ kind: "finding-repo" })),
  createFindingPersistenceRepository: vi.fn(() => ({ kind: "finding-persistence-repo" })),
  createFindingVulnerabilityRepository: vi.fn(() => ({ kind: "finding-vulnerability-repo" })),
  createObservationRepository: createObservationRepositoryMock,
  createRoleRepository: vi.fn(() => roleRepositoryMock),
  createUserRoleRepository: vi.fn(() => userRoleRepositoryMock),
  createUserProfileRepository: vi.fn(() => ({ kind: "user-profile-repo" })),
  createUserSessionRepository: vi.fn(() => ({ kind: "user-session-repo" })),
  createVulnerabilityPersistenceRepository: vi.fn(() => ({
    kind: "vulnerability-persistence-repo",
  })),
}));

vi.mock("./service/index.js", () => ({
  createAssetCustomFieldService: createAssetCustomFieldServiceMock,
  createAuthService: createAuthServiceMock,
  createAssetService: createAssetServiceMock,
  createFindingService: createFindingServiceMock,
  createRoleService: createRoleServiceMock,
  createStatsService: vi.fn(() => ({ kind: "stats-service" })),
  createUserProfileService: createUserProfileServiceMock,
  createVulnerabilityService: createVulnerabilityServiceMock,
}));

vi.mock("./event-handler/index.js", () => ({
  registerEventHandlers: registerEventHandlersMock,
}));

import { createAppContainer } from "./container.js";

describe("app container", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wires custom auth services and routes", async () => {
    const logger = pino({ enabled: false });

    const container = createAppContainer({
      db: {} as never,
      appOrigin: "http://localhost:3000",
      staticDir: "/app/public",
      authSessionLifetimeHours: 12,
      authSessionHmacSecret: "012345678901234567890123456789012345678901234567890123456789",
      authCookieSecure: true,
      authTrustedProxies: ["127.0.0.1"],
      apiTimeoutMs: 5000,
      logger,
      accessLogger: logger,
      dbLogger: logger,
      loggerFactory: () => logger,
    });

    expect(createAuthCookiePolicyMock).toHaveBeenCalledWith({
      secure: true,
    });
    expect(createCsrfProtectionMock).toHaveBeenCalledWith({
      allowedOrigins: ["http://localhost:3000"],
      tokenSecret: "012345678901234567890123456789012345678901234567890123456789",
      cookiePolicy: createAuthCookiePolicyMock.mock.results[0]?.value,
    });
    expect(createAuthServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userRoleRepository: userRoleRepositoryMock,
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(registerEventHandlersMock).toHaveBeenCalledWith({
      eventBus: expect.objectContaining({
        emit: expect.any(Function),
        on: expect.any(Function),
      }),
      loggerFactory: expect.any(Function),
    });
    expect(createAuthRouteMock).toHaveBeenCalledWith(createAuthServiceMock.mock.results[0]?.value, {
      csrf: createCsrfProtectionMock.mock.results[0]?.value,
      cookiePolicy: createAuthCookiePolicyMock.mock.results[0]?.value,
      trustedProxies: ["127.0.0.1"],
    });
    expect(createAuthAnnotateMock).toHaveBeenCalledWith(
      createAuthServiceMock.mock.results[0]?.value,
      createAuthCookiePolicyMock.mock.results[0]?.value,
    );
    expect(createRequireDomainPermissionMock).toHaveBeenCalledWith(expect.any(Function));
    expect(createUserProfileServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(createAssetServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetCustomFieldReader: createAssetCustomFieldServiceMock.mock.results[0]?.value,
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(createAssetCustomFieldServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        assetRepository: { kind: "asset-repo" },
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(createAssetRouteMock).toHaveBeenCalledWith(
      createAssetServiceMock.mock.results[0]?.value,
      createAssetCustomFieldServiceMock.mock.results[0]?.value,
      { requireDomainPermission: expect.any(Function) },
    );
    expect(createRoleServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        roleRepository: roleRepositoryMock,
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(createFindingServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        observationRepository: { kind: "observation-repo" },
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(createVulnerabilityServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        domainEventEmitter: expect.objectContaining({
          emit: expect.any(Function),
        }),
      }),
    );
    expect(createImportRouteMock).toHaveBeenCalledWith({
      requireDomainPermission: expect.any(Function),
    });
    expect(createRoleRouteMock).toHaveBeenCalledOnce();
    expect(createUserRouteMock).toHaveBeenCalledWith(
      { kind: "user-profile-service" },
      { requireDomainPermission: expect.any(Function) },
    );
    expect(createAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appOrigin: "http://localhost:3000",
        staticDir: "/app/public",
      }),
    );

    await container.createDefaultAdmin();

    expect(createDefaultAdminMock).toHaveBeenCalledWith({
      db: {},
      logger,
    });
  });

  it("fails fast when auth cookies are configured as insecure", () => {
    const logger = pino({ enabled: false });

    createAuthCookiePolicyMock.mockImplementationOnce(() => {
      throw new Error("__Host auth cookies require AUTH_COOKIE_SECURE=true");
    });

    expect(() =>
      createAppContainer({
        db: {} as never,
        appOrigin: "http://localhost:3000",
        authSessionLifetimeHours: 12,
        authSessionHmacSecret: "012345678901234567890123456789012345678901234567890123456789",
        authCookieSecure: false,
        authTrustedProxies: [],
        apiTimeoutMs: 5000,
        logger,
        accessLogger: logger,
        dbLogger: logger,
        loggerFactory: () => logger,
      }),
    ).toThrow("__Host auth cookies require AUTH_COOKIE_SECURE=true");
    expect(createAuthCookiePolicyMock).toHaveBeenCalledWith({
      secure: false,
    });
  });
});
