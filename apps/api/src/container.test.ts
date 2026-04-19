import { beforeEach, describe, expect, it, vi } from "vitest"
import { pino } from "pino"

const {
  createAppMock,
  createAuthRouteMock,
  createAuthAnnotateMock,
  authNRequireMock,
  createRequireDomainPermissionMock,
  createDefaultAdminMock,
  createAuthMock,
  createAssetRouteMock,
  createUserRouteMock,
  createVulnerabilityRouteMock,
  createFindingStatsRouteMock,
  createFindingRouteMock,
  createImportRouteMock
} = vi.hoisted(() => ({
  createAppMock: vi.fn(() => ({ fetch: vi.fn() })),
  createAuthRouteMock: vi.fn(() => ({ route: "auth" })),
  createAuthAnnotateMock: vi.fn(() => vi.fn()),
  authNRequireMock: vi.fn(() => vi.fn()),
  createRequireDomainPermissionMock: vi.fn(() => vi.fn(() => vi.fn())),
  createDefaultAdminMock: vi.fn(),
  createAuthMock: vi.fn(),
  createAssetRouteMock: vi.fn(() => ({ route: "assets" })),
  createUserRouteMock: vi.fn(() => ({ route: "users" })),
  createVulnerabilityRouteMock: vi.fn(() => ({ route: "vulnerabilities" })),
  createFindingStatsRouteMock: vi.fn(() => ({ route: "stats" })),
  createFindingRouteMock: vi.fn(() => ({ route: "findings" })),
  createImportRouteMock: vi.fn(() => ({ route: "import" }))
}))

vi.mock("./app.js", () => ({
  createApp: createAppMock
}))

vi.mock("./logging.js", () => ({
  createLogger: vi.fn(() => pino({ enabled: false }))
}))

vi.mock("./lib/auth.js", () => ({
  createAuth: createAuthMock,
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
  createUserRepository: vi.fn(() => ({ kind: "user-repo" })),
  createVulnerabilityRepository: vi.fn(() => ({ kind: "vulnerability-repo" }))
}))

vi.mock("./service/index.js", () => ({
  createAssetService: vi.fn(() => ({ kind: "asset-service" })),
  createFindingService: vi.fn(() => ({ kind: "finding-service" })),
  createStatsService: vi.fn(() => ({ kind: "stats-service" })),
  createUserService: vi.fn(() => ({ kind: "user-service" })),
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

  it("uses an injected auth instance instead of creating one", () => {
    const logger = pino({ enabled: false })
    const auth = {
      api: {
        getSession: vi.fn(),
        userHasPermission: vi.fn(),
        signUpEmail: vi.fn(),
        setUserPassword: vi.fn()
      },
      handler: vi.fn()
    }

    const container = createAppContainer({
      db: {} as never,
      auth: auth as never,
      authUrl: "http://localhost:3000",
      apiTimeoutMs: 5000,
      logger,
      accessLogger: logger,
      dbLogger: logger,
      loggerFactory: () => logger
    })

    expect(createAuthMock).not.toHaveBeenCalled()
    expect(createAuthRouteMock).toHaveBeenCalledWith(auth)
    expect(createAuthAnnotateMock).toHaveBeenCalledWith(auth.api)
    expect(createRequireDomainPermissionMock).toHaveBeenCalledWith(
      auth.api.userHasPermission
    )
    expect(container.auth).toBe(auth)
  })
})
