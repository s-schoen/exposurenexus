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
  const rawIdentity = { kind: "raw-identity" };
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
  const rawExposures = { kind: "raw-exposures" };
  const exposures = {
    findings: { kind: "exposure-findings" },
    vulnerabilities: { kind: "exposure-vulnerabilities" },
    statistics: { kind: "exposure-statistics" },
  };

  return {
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
    rawExposures,
    exposures,
    createExposures: vi.fn(() => rawExposures),
    decorateExposuresWithEvents: vi.fn(() => exposures),
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

vi.mock("@exposurenexus/backend/identity", () => ({
  createIdentity: mocks.createIdentity,
}));
vi.mock("@exposurenexus/backend/authentication", () => ({
  createAuthentication: mocks.createAuthentication,
}));
vi.mock("@exposurenexus/backend/assets", () => ({
  createAssets: mocks.createAssets,
}));
vi.mock("@exposurenexus/backend/exposures", () => ({
  createExposures: mocks.createExposures,
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
vi.mock("./lib/exposures-events.js", () => ({
  decorateExposuresWithEvents: mocks.decorateExposuresWithEvents,
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

    expect(mocks.createAuthentication).toHaveBeenCalledWith(expect.any(Object), {
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
    expect(mocks.createExposures).toHaveBeenCalledOnce();
    expect(mocks.decorateExposuresWithEvents).toHaveBeenCalledWith(
      mocks.rawExposures,
      expect.objectContaining({ emit: expect.any(Function) }),
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
    expect(container.services.exposures).toBe(mocks.exposures);
    expect(mocks.createVulnerabilityRoute).toHaveBeenCalledWith(mocks.exposures.vulnerabilities, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createFindingStatsRoute).toHaveBeenCalledWith(mocks.exposures.statistics, {
      requireDomainPermission: expect.any(Function),
    });
    expect(mocks.createFindingRoute).toHaveBeenCalledWith(mocks.exposures.findings, {
      requireDomainPermission: expect.any(Function),
    });

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
