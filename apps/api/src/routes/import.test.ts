import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import { pino } from "pino"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"
import { createImportRoute } from "./import.js"

describe("finding import routes", () => {
  const user = createTestUser()
  const logger = pino({ enabled: false })
  const importer = {
    parseFindingsFromFile: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 for unauthenticated requests", async () => {
    const requestId = "findings-import-unauthorized-request"
    const form = new FormData()
    form.set("type", "nuclei")
    form.set(
      "file",
      new File(['{"template-id":"test"}\n'], "findings.jsonl", {
        type: "application/json"
      })
    )

    const app = createTestApp({
      importerRoute: createImportRoute({ importer, logger }),
      requireAuth: requireAuthenticatedUser
    })

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId
      },
      body: form
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      correlationId: requestId,
      status: 401,
      error: "Unauthorized"
    })
    expect(importer.parseFindingsFromFile).not.toHaveBeenCalled()
  })

  it("returns 400 when the import type is missing", async () => {
    const requestId = "findings-import-missing-type-request"
    const form = new FormData()
    form.set(
      "file",
      new File(['{"template-id":"test"}\n'], "findings.jsonl", {
        type: "application/json"
      })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute({ importer, logger })
    })

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId
      },
      body: form
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "expected type in form data"
    })
    expect(importer.parseFindingsFromFile).not.toHaveBeenCalled()
  })

  it("returns 400 when the import file is missing", async () => {
    const requestId = "findings-import-missing-file-request"
    const form = new FormData()
    form.set("type", "nuclei")

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute({ importer, logger })
    })

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId
      },
      body: form
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "expected file in form data"
    })
    expect(importer.parseFindingsFromFile).not.toHaveBeenCalled()
  })

  it("passes the uploaded file to the importer", async () => {
    const requestId = "findings-import-success-request"
    const fileContents = '{"template-id":"test"}\n'
    const form = new FormData()

    form.set("type", "nuclei")
    form.set(
      "file",
      new File([fileContents], "findings.jsonl", {
        type: "application/json"
      })
    )

    importer.parseFindingsFromFile.mockResolvedValue([])

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute({ importer, logger })
    })

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId
      },
      body: form
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(importer.parseFindingsFromFile).toHaveBeenCalledTimes(1)
    expect(importer.parseFindingsFromFile.mock.calls[0]?.[0]).toEqual({
      user
    })
    expect(importer.parseFindingsFromFile.mock.calls[0]?.[1]).toBe("nuclei")
    expect(importer.parseFindingsFromFile.mock.calls[0]?.[2]?.toString()).toBe(
      fileContents
    )
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        status: "ok"
      }
    })
  })

  it("maps importer parsing failures to the standard error reply", async () => {
    const requestId = "findings-import-parse-error-request"
    const form = new FormData()

    form.set("type", "nuclei")
    form.set(
      "file",
      new File(['{"template-id":"broken"}\n'], "findings.jsonl", {
        type: "application/json"
      })
    )

    importer.parseFindingsFromFile.mockRejectedValue(
      new HTTPException(400, { message: "failed to parse line 1" })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: createImportRoute({ importer, logger })
    })

    const response = await app.request("/api/findings/import", {
      method: "POST",
      headers: {
        "X-Request-Id": requestId
      },
      body: form
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      correlationId: requestId,
      status: 400,
      error: "failed to parse line 1"
    })
  })
})
