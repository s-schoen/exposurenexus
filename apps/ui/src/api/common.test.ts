import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  APIError,
  apiRequest,
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
  document.cookie = "__Host-openvlp-csrf=; Max-Age=0; path=/"
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
      "http://localhost:3001/api/assets",
      expect.objectContaining({
        method: "GET",
        credentials: "include"
      })
    )
    expect(headers.get("X-CSRF-Token")).toBeNull()
  })

  it("adds csrf headers to unsafe JSON requests", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(
      "__Host-openvlp-csrf=csrf-token"
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
      "__Host-openvlp-csrf=csrf-token"
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
      "__Host-openvlp-csrf=csrf-token"
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
      "__Host-openvlp-csrf=csrf-token"
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
          error: "Forbidden"
        },
        { status: 403 }
      )
    )

    expect(error).toBeInstanceOf(APIError)
    expect(error).toMatchObject({
      statusCode: 403,
      message: "Forbidden"
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
})
