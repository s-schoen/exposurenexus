import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod/v4"
import {
  APIError,
  apiRequest,
  buildApiUrl,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply
} from "./common.ts"

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: object, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  })
}

function requestInit(): RequestInit {
  const init = fetchMock.mock.calls[0]?.[1]
  if (!init) {
    throw new Error("fetch was not called")
  }

  return init
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  document.cookie = "__Host-exposurenexus-csrf=; Max-Age=0; path=/"
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("api common helpers", () => {
  it("sends GET requests with browser credentials and no csrf header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))

    await apiRequest("/api/assets")

    const init = requestInit()
    const headers = init.headers as Headers

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/assets",
      expect.objectContaining({
        method: "GET",
        credentials: "include"
      })
    )
    expect(headers.get("X-CSRF-Token")).toBeNull()
  })

  it("builds same-origin API URLs without duplicating the API prefix", () => {
    expect(buildApiUrl("/api/assets", "/api")).toBe("/api/assets")
    expect(buildApiUrl("api/assets", "/api/")).toBe("/api/assets")
  })

  it("supports split local development with an explicit API origin", () => {
    expect(buildApiUrl("/api/assets", "http://localhost:3001")).toBe(
      "http://localhost:3001/api/assets"
    )
  })

  it("adds csrf headers to unsafe JSON requests", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-exposurenexus-csrf=csrf-token"
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))

    await apiRequest("/api/assets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: "api.example.com" })
    })

    const init = requestInit()
    const headers = init.headers as Headers

    expect(init.credentials).toBe("include")
    expect(headers.get("Content-Type")).toBe("application/json")
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token")
  })

  it("adds csrf headers to delete requests", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-exposurenexus-csrf=csrf-token"
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))

    await apiRequest("/api/assets/asset-id", {
      method: "DELETE"
    })

    const headers = requestInit().headers as Headers

    expect(headers.get("X-CSRF-Token")).toBe("csrf-token")
  })

  it("does not force content-type for form data uploads", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-exposurenexus-csrf=csrf-token"
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))
    const formData = new FormData()
    formData.append("file", new File(["finding"], "finding.jsonl"))

    await apiRequest("/api/findings/import", {
      method: "POST",
      body: formData
    })

    const init = requestInit()
    const headers = init.headers as Headers

    expect(init.body).toBe(formData)
    expect(headers.get("Content-Type")).toBeNull()
    expect(headers.get("X-CSRF-Token")).toBe("csrf-token")
  })

  it("can disable csrf headers for login", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-exposurenexus-csrf=csrf-token"
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))

    await apiRequest(
      "/api/auth",
      {
        method: "POST"
      },
      { csrf: false }
    )

    const headers = requestInit().headers as Headers

    expect(headers.get("X-CSRF-Token")).toBeNull()
  })

  it("parses API error replies as APIError", async () => {
    const error = await parseErrorReply(
      jsonResponse(
        {
          correlationId: "api-test-request",
          status: 403,
          error: "Forbidden",
          reason: "forbidden"
        },
        { status: 403 }
      )
    )

    expect(error).toBeInstanceOf(APIError)
    expect(error).toMatchObject({
      statusCode: 403,
      message: "Forbidden",
      reason: "forbidden"
    })
  })

  it("parses object replies", async () => {
    await expect(
      parseObjectReply<{ ok: boolean }>(
        jsonResponse({
          correlationId: "api-test-request",
          data: { ok: true }
        })
      )
    ).resolves.toEqual({ ok: true })
  })

  it("parses object replies with a schema", async () => {
    await expect(
      parseObjectReply(
        jsonResponse({
          correlationId: "api-test-request",
          data: { ok: true }
        }),
        z.strictObject({ ok: z.boolean() })
      )
    ).resolves.toEqual({ ok: true })
  })

  it("parses array replies with a schema", async () => {
    await expect(
      parseArrayReply(
        jsonResponse({
          correlationId: "api-test-request",
          data: {
            items: [{ ok: true }]
          }
        }),
        z.strictObject({ ok: z.boolean() })
      )
    ).resolves.toEqual([{ ok: true }])
  })
})
