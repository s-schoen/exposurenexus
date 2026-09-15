import { pino } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rawAuthentication = { kind: "raw-authentication" };
  const authentication = {
    kind: "authentication",
    validateSession: vi.fn(),
    createSessionForCredentials: vi.fn(),
    createSession: vi.fn(),
    revokeSession: vi.fn(),
  };
  const rawIdentity = { kind: "raw-identity", users: { createInitialAdmin: vi.fn() } };
  const identity = {
    users: { kind: "identity-users", getByID: vi.fn() },
    roles: { kind: "identity-roles" },
    authorization: { userHasPermission: vi.fn() },
  };
  const rawAssets = { kind: "raw-assets" };
  const assets = {
    inventory: { kind: "asset-inventory" },
    customFields: { kind: "asset-custom-fields" },
  };
  const rawFindings = { kind: "raw-findings" };
  const findings = { kind: "findings" };
  const rawVulnerabilities = { kind: "raw-vulnerabilities" };
  const vulnerabilities = { kind: "vulnerabilities" };
  const statistics = { kind: "statistics" };
  const importSources = { kind: "import-sources" };

  return {
    createBackendRuntime: vi.fn(() => ({})),
    rawAuthentication,
    authentication,
    createAuthentication: vi.fn(() => rawAuthentication),
    decorateAuthenticationWithEvents: vi.fn(() => authentication),
    rawIdentity,
    identity,
    createIdentity: vi.fn(() => rawIdentity),
    decorateIdentityWithEvents: vi.fn(() => identity),
    rawAssets,
    assets,
    createAssets: vi.fn(() => rawAssets),
    decorateAssetsWithEvents: vi.fn(() => assets),
    rawFindings,
    findings,
    createFindings: vi.fn(() => rawFindings),
    decorateFindingsWithEvents: vi.fn(() => findings),
    rawVulnerabilities,
    vulnerabilities,
    createVulnerabilities: vi.fn(() => rawVulnerabilities),
    decorateVulnerabilitiesWithEvents: vi.fn(() => vulnerabilities),
    statistics,
    createStatistics: vi.fn(() => statistics),
    importSources,
    createImportSources: vi.fn(() => importSources),
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
  };
});

vi.mock("@exposurenexus/backend", () => ({ createBackendRuntime: mocks.createBackendRuntime }));

vi.mock("@exposurenexus/backend/identity", () => ({
  createIdentity: mocks.createIdentity,
}));
vi.mock("@exposurenexus/backend/authentication", () => ({
  createAuthentication: mocks.createAuthentication,
}));
vi.mock("@exposurenexus/backend/assets", () => ({
  createAssets: mocks.createAssets,
}));
vi.mock("@exposurenexus/backend/findings", () => ({
  createFindings: mocks.createFindings,
}));
vi.mock("@exposurenexus/backend/vulnerabilities", () => ({
  createVulnerabilities: mocks.createVulnerabilities,
}));
vi.mock("@exposurenexus/backend/statistics", () => ({
  createStatistics: mocks.createStatistics,
}));
vi.mock("@exposurenexus/backend/import-sources", () => ({
  createImportSources: mocks.createImportSources,
}));
vi.mock("./lib/authentication-events.js", () => ({
  decorateAuthenticationWithEvents: mocks.decorateAuthenticationWithEvents,
}));
vi.mock("./lib/identity-events.js", () => ({
  decorateIdentityWithEvents: mocks.decorateIdentityWithEvents,
}));
vi.mock("./lib/assets-events.js", () => ({
  decorateAssetsWithEvents: mocks.decorateAssetsWithEvents,
}));
vi.mock("./lib/findings-events.js", () => ({
  decorateFindingsWithEvents: mocks.decorateFindingsWithEvents,
}));
vi.mock("./lib/vulnerabilities-events.js", () => ({
  decorateVulnerabilitiesWithEvents: mocks.decorateVulnerabilitiesWithEvents,
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
vi.mock("./event-handler/index.js", () => ({
  registerEventHandlers: mocks.registerEventHandlers,
}));

import { createAppContainer } from "./container.js";

const authSessionHmacSecret = "012345678901234567890123456789012345678901234567890123456789";

function createContainerOptions() {
  const logger = pino({ enabled: false });
  return {
    db: {} as never,
    storage: {
      bucket: "private-imports",
      write: vi.fn(),
      read: vi.fn(),
      delete: vi.fn(),
      close: vi.fn(),
    },
    importSourcesConfiguration: { maxSizeBytes: 42, retentionPolicy: "keep" as const },
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

  it("composes authentication and identity through backend capabilities", async () => {
    const options = createContainerOptions();
    const container = createAppContainer(options);

    expect(mocks.createBackendRuntime).toHaveBeenCalledExactlyOnceWith({
      database: options.db,
      logger: options.logger,
    });
    const runtime = mocks.createBackendRuntime.mock.results[0]!.value;
    expect(mocks.createIdentity).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(mocks.createAssets).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(mocks.createFindings).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(mocks.createVulnerabilities).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(mocks.createStatistics).toHaveBeenCalledExactlyOnceWith(runtime);
    expect(mocks.createImportSources).toHaveBeenCalledExactlyOnceWith(
      runtime,
      options.storage,
      options.importSourcesConfiguration,
    );
    expect(mocks.createImportRoute).toHaveBeenCalledExactlyOnceWith(mocks.importSources, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createAuthentication).toHaveBeenCalledWith(runtime, {
      sessionLifetimeHours: options.authSessionLifetimeHours,
      sessionHmacSecret: options.authSessionHmacSecret,
    });
    expect(mocks.decorateAuthenticationWithEvents).toHaveBeenCalledWith(
      mocks.rawAuthentication,
      expect.objectContaining({ emit: expect.any(Function) }),
    );
    expect(mocks.createIdentity).toHaveBeenCalledOnce();
    expect(mocks.decorateIdentityWithEvents).toHaveBeenCalledWith(
      mocks.rawIdentity,
      expect.objectContaining({ emit: expect.any(Function) }),
    );
    expect(mocks.createAssets).toHaveBeenCalledOnce();
    expect(mocks.decorateAssetsWithEvents).toHaveBeenCalledWith(
      mocks.rawAssets,
      expect.objectContaining({ emit: expect.any(Function) }),
    );
    const eventBus = expect.objectContaining({ emit: expect.any(Function) });
    expect(mocks.decorateFindingsWithEvents).toHaveBeenCalledExactlyOnceWith(
      mocks.rawFindings,
      eventBus,
    );
    expect(mocks.decorateVulnerabilitiesWithEvents).toHaveBeenCalledExactlyOnceWith(
      mocks.rawVulnerabilities,
      eventBus,
    );
    expect(mocks.createRequireDomainPermission).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.createUserRoute).toHaveBeenCalledWith(mocks.identity.users, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createRoleRoute).toHaveBeenCalledWith(mocks.identity.roles, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createAssetRoute).toHaveBeenCalledWith(
      mocks.assets.inventory,
      mocks.assets.customFields,
      { requireDomainPermission: expect.any(Function) },
    );
    expect(container.services.identity).toBe(mocks.identity);
    expect(container.services.authentication).toBe(mocks.authentication);
    expect(container.services.assets).toBe(mocks.assets);
    expect(container.services).not.toHaveProperty("exposures");
    expect(container.services.findings).toBe(mocks.findings);
    expect(container.services.vulnerabilities).toBe(mocks.vulnerabilities);
    expect(container.services.statistics).toBe(mocks.statistics);
    expect(mocks.createVulnerabilityRoute).toHaveBeenCalledWith(mocks.vulnerabilities, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createFindingStatsRoute).toHaveBeenCalledWith(mocks.statistics, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createFindingRoute).toHaveBeenCalledWith(mocks.findings, {
      requireDomainPermission: expect.any(Function),
    });

    await container.createDefaultAdmin();
    expect(mocks.createDefaultAdmin).toHaveBeenCalledWith({
      users: mocks.rawIdentity.users,
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
