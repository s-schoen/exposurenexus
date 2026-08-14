import { describe, expect, it } from "vitest";

import { createTestApp } from "../test/app.js";

describe("GET /health", () => {
  it("returns an ok status payload", async () => {
    const requestId = "test-request-id";
    const app = createTestApp();

    const response = await app.request("/api/health", {
      headers: {
        "X-Request-Id": requestId,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    expect(body.correlationId).toBe(requestId);
    expect(body).toEqual({
      correlationId: requestId,
      data: {
        status: "ok",
      },
    });
  });
});
