import { beforeEach, describe, expect, it, vi } from "vitest"
import { pino } from "pino"

const {
  createAppMock,
  createAuthRouteMock,
  createAuthAnnotateMock,
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
  createAuthServiceMock
} = vi.hoisted(() => ({
  createAppMock: vi.fn(() => ({ fetch: vi.fn() })),
  createAuthRouteMock: vi.fn(() => ({ route: "auth" })),
  createAuthAnnotateMock: vi.fn(() => vi.fn()),
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
  createAuthServiceMock: vi.fn(() => ({
    kind: "auth-service",
    userHasPermission: vi.fn(),
    validateSession: vi.fn(),
    createSessionForCredentials: vi.fn(),
    revokeSession: vi.fn()
  }))
}))

vi.mock("./app.js", () => ({
  createApp: createAppMock
}))

vi.mock("./logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false }))
}))

vi.mock("./lib/default-admin.js", () => ({
  createDefaultAdmin: createDefaultAdminMock
}))

vi.mock("./middleware/auth.js", () => ({
  createAuthAnnotate: createAuthAnnotateMock,
  authNRequire: authNRequireMock,
  createRequireDomainPermission: createRequireDomainPermissionMock
}))

vi.mock("./routes/health.js", () => ({
  default: { route: "health" }
}))

vi.mock("./routes/auth.js", () => ({
  createAuthRoute: createAuthRouteMock
}))

vi.mock("./routes/assets.js", () => ({
  createAssetRoute: createAssetRouteMock
}))

vi.mock("./routes/roles.js", () => ({
  createRoleRoute: createRoleRouteMock
}))

vi.mock("./routes/users.js", () => ({
  createUserRoute: createUserRouteMock
}))

vi.mock("./routes/vulnerabilities.js", () => ({
  createVulnerabilityRoute: createVulnerabilityRouteMock
}))

vi.mock("./routes/stats.js", () => ({
  createFindingStatsRoute: createFindingStatsRouteMock
}))

vi.mock("./routes/findings.js", () => ({
  createFindingRoute: createFindingRouteMock
}))

vi.mock("./routes/import.js", () => ({
  createImportRoute: createImportRouteMock
}))

vi.mock("./repository/index.js", () => ({
  createAssetRepository: vi.fn(() => ({ kind: "asset-repo" })),
  createFindingRepository: vi.fn(() => ({ kind: "finding-repo" })),
  createRoleRepository: vi.fn(() => ({ kind: "role-repo" })),
  createUserRoleRepository: vi.fn(() => ({ kind: "user-role-repo" })),
  createUserProfileRepository: vi.fn(() => ({ kind: "user-profile-repo" })),
  createUserSessionRepository: vi.fn(() => ({ kind: "user-session-repo" })),
  createVulnerabilityRepository: vi.fn(() => ({ kind: "vulnerability-repo" }))
}))

vi.mock("./service/index.js", () => ({
  createAuthService: createAuthServiceMock,
  createAssetService: vi.fn(() => ({ kind: "asset-service" })),
  createFindingService: vi.fn(() => ({ kind: "finding-service" })),
  createRoleService: vi.fn(() => ({ kind: "role-service" })),
  createStatsService: vi.fn(() => ({ kind: "stats-service" })),
  createUserProfileService: vi.fn(() => ({ kind: "user-profile-service" })),
  createVulnerabilityService: vi.fn(() => ({ kind: "vulnerability-service" }))
}))

vi.mock("./import/util.js", () => ({
  createGetOrCreateAsset: vi.fn(() => ({ kind: "get-or-create-asset" }))
}))

vi.mock("./import/nuclei.js", () => ({
  createNucleiFindingParser: vi.fn(() => ({ kind: "nuclei-parser" }))
}))

vi.mock("./import/importer.js", () => ({
  createFindingImporter: vi.fn(() => ({ kind: "importer" }))
}))

import { createAppContainer } from "./container.js"

describe("app container", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("wires custom auth services and routes", () => {
    const logger = pino({ enabled: false })

    const container = createAppContainer({
      db: {} as never,
      corsOrigin: "http://localhost:3000",
      authSessionLifetimeHours: 12,
      authSessionHmacSecret:
        "012345678901234567890123456789012345678901234567890123456789",
      apiTimeoutMs: 5000,
      logger,
      accessLogger: logger,
      dbLogger: logger,
      loggerFactory: () => logger
    })

    expect(createAuthRouteMock).toHaveBeenCalledWith(
      createAuthServiceMock.mock.results[0]?.value
    )
    expect(createAuthAnnotateMock).toHaveBeenCalledWith(
      createAuthServiceMock.mock.results[0]?.value
    )
    expect(createRequireDomainPermissionMock).toHaveBeenCalledWith(
      createAuthServiceMock.mock.results[0]?.value.userHasPermission
    )
    expect(createRoleRouteMock).toHaveBeenCalledOnce()
    expect(createUserRouteMock).toHaveBeenCalledWith(
      { kind: "user-profile-service" },
      { requireDomainPermission: expect.any(Function) }
    )

    container.createDefaultAdmin()

    expect(createDefaultAdminMock).toHaveBeenCalledWith({
      db: {},
      logger
    })
  })
})
