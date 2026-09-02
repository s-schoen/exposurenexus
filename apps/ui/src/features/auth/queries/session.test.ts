import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_SESSION_QUERY_KEY,
  createAuthSessionQueryOptions,
} from "@/features/auth/queries/session.ts";
import { APIError } from "@/lib/api-client.ts";
import { createTestAuthSession } from "@/test/harness.tsx";

import type { UserProfile } from "@exposurenexus/contracts/model/user";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/features/auth/api/auth.ts", () => ({
  getSession: mocks.getSession,
}));

const user: UserProfile = {
  id: "7b413aba-5164-456b-8ffd-88fb6b99bbed",
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: [],
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

beforeEach(() => {
  mocks.getSession.mockReset();
});

describe("auth session query", () => {
  it("loads the current session under the stable auth query key", async () => {
    const authSession = createTestAuthSession(user);
    mocks.getSession.mockResolvedValueOnce({ data: authSession });
    const queryConfig = createAuthSessionQueryOptions();

    await expect(createQueryClient().fetchQuery(queryConfig)).resolves.toEqual(authSession);
    expect(queryConfig.queryKey).toEqual(AUTH_SESSION_QUERY_KEY);
  });

  it("maps unauthenticated session reads to null", async () => {
    mocks.getSession.mockRejectedValueOnce(new APIError(401, "Unauthorized"));

    await expect(
      createQueryClient().fetchQuery(createAuthSessionQueryOptions()),
    ).resolves.toBeNull();
  });
});
