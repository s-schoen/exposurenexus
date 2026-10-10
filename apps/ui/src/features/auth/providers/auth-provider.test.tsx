import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/features/auth/providers/auth-provider.tsx";
import { AUTH_SESSION_QUERY_KEY } from "@/features/auth/queries/session.ts";
import { createAppQueryClient } from "@/lib/query-client.ts";
import { SEED_USERS } from "@/mocks/fixtures/index.ts";
import { db, mockApiError, recordApiRequests, seedScenario } from "@/test/msw.ts";

import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Auth state against the MSW mock API: the default scenario is signed in as the seeded admin.

const [ROBIN, MORGAN] = SEED_USERS;
const protectedKeys = [["assets"], ["findings"], ["users"], ["roles"]];

function renderAuth() {
  const queryClient = createAppQueryClient({ retry: false });
  for (const key of protectedKeys) {
    queryClient.setQueryData(key, []);
  }
  const view = renderHook(() => useAuth(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
  return { queryClient, ...view };
}

function expectSignedOutCaches(queryClient: QueryClient) {
  for (const key of protectedKeys) {
    expect(queryClient.getQueryData(key)).toBeUndefined();
  }
  expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AuthProvider", () => {
  it("loads the current session on mount", async () => {
    const { result } = renderAuth();

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    expect(result.current.user).toEqual(ROBIN);
  });

  it("is unauthenticated without a session", async () => {
    seedScenario("loggedOut");
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
    expect(result.current.user).toBeNull();
  });

  it.each([
    ["finds no session", () => (db.session = null)],
    ["fails", () => mockApiError("get", "/auth/session", 500)],
  ])("clears auth and protected caches when ensureSession %s", async (_name, expire) => {
    const { queryClient, result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
    const requests = recordApiRequests();
    expire();

    let hasSession: boolean | undefined;
    await act(async () => {
      hasSession = await result.current.ensureSession();
    });

    expect(hasSession).toBe(false);
    expectSignedOutCaches(queryClient);
    expect(requests).not.toContain("DELETE /api/auth");
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
  });

  it("signs in and out", async () => {
    seedScenario("loggedOut");
    const { queryClient, result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));

    await act(async () => {
      await result.current.login(` ${MORGAN.username} `, "secret");
    });
    await waitFor(() => expect(result.current.user).toEqual(MORGAN));

    for (const key of protectedKeys) {
      queryClient.setQueryData(key, []);
    }
    await act(async () => {
      await result.current.logout();
    });

    expect(db.session).toBeNull();
    expectSignedOutCaches(queryClient);
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
  });

  it("clears local auth state without signing out on the server", async () => {
    const { queryClient, result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe("authenticated"));

    act(() => result.current.clearSession());

    expectSignedOutCaches(queryClient);
    expect(db.session).not.toBeNull();
    await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
  });

  it("throws when useAuth is used outside the provider", () => {
    expect(() => renderHook(() => useAuth())).toThrow();
  });
});
