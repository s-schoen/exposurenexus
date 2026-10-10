import { QueryClient } from "@tanstack/react-query";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import {
  AUTH_SESSION_QUERY_KEY,
  createAuthSessionQueryOptions,
} from "@/features/auth/queries/session.ts";
import { APIError } from "@/lib/api-client.ts";
import { SEED_AUTH_SESSION } from "@/mocks/fixtures/index.ts";
import { apiPath } from "@/mocks/handlers/shared.ts";
import { mockApiError, seedScenario, server } from "@/test/msw.ts";

const fetchSession = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } }).fetchQuery(
    createAuthSessionQueryOptions(),
  );

describe("auth session query", () => {
  it("loads the current session under the stable auth query key", async () => {
    await expect(fetchSession()).resolves.toEqual(SEED_AUTH_SESSION);
    expect(createAuthSessionQueryOptions().queryKey).toEqual(AUTH_SESSION_QUERY_KEY);
  });

  it("maps unauthenticated session reads to null", async () => {
    seedScenario("loggedOut");

    await expect(fetchSession()).resolves.toBeNull();
  });

  it("rejects other API errors unchanged", async () => {
    mockApiError("get", "/auth/session", 403, "Forbidden", "session access denied");

    const request = fetchSession();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 403,
      reason: "session access denied",
    });
  });

  it("rejects network errors", async () => {
    server.use(http.get(apiPath("/auth/session"), () => HttpResponse.error()));

    await expect(fetchSession()).rejects.toThrow(TypeError);
  });
});
