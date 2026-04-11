import { beforeEach, describe, expect, it, vi } from "vitest"
import { HTTPException } from "hono/http-exception"
import {
  annotateAuthenticatedUser,
  createTestApp,
  createTestUser,
  requireAuthenticatedUser
} from "../test/app.js"

vi.mock("../logging.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock("../import/importer.js", () => ({
  parseFindingsFromFile: vi.fn()
}))

import importer from "./import.js"
import { parseFindingsFromFile } from "../import/importer.js"

describe("finding import routes", () => {
  const user = createTestUser()

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
      importerRoute: importer,
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
    expect(parseFindingsFromFile).not.toHaveBeenCalled()
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
      importerRoute: importer
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
    expect(parseFindingsFromFile).not.toHaveBeenCalled()
  })

  it("returns 400 when the import file is missing", async () => {
    const requestId = "findings-import-missing-file-request"
    const form = new FormData()
    form.set("type", "nuclei")

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: importer
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
    expect(parseFindingsFromFile).not.toHaveBeenCalled()
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

    vi.mocked(parseFindingsFromFile).mockResolvedValue([])

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: importer
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
    expect(parseFindingsFromFile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(parseFindingsFromFile).mock.calls[0]?.[0]).toEqual({
      user
    })
    expect(vi.mocked(parseFindingsFromFile).mock.calls[0]?.[1]).toBe("nuclei")
    expect(
      vi.mocked(parseFindingsFromFile).mock.calls[0]?.[2]?.toString()
    ).toBe(fileContents)
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

    vi.mocked(parseFindingsFromFile).mockRejectedValue(
      new HTTPException(400, { message: "failed to parse line 1" })
    )

    const app = createTestApp({
      annotateAuth: annotateAuthenticatedUser(user),
      requireAuth: requireAuthenticatedUser,
      importerRoute: importer
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
