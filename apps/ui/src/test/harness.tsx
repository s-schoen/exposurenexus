import { QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { PageProvider } from "@/hooks/use-page-meta.tsx";
import { createAppQueryClient } from "@/lib/query-client.ts";

import type { AuthState, AuthStatus, LoginRedirects } from "@/features/auth";
import type { QueryClient } from "@tanstack/react-query";
import type { RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

// Data comes from the MSW mock API (src/test/setup.ts). Use renderApp from
// src/test/render-app.tsx for whole pages; these helpers are for components and hooks.

const testQueryClients = new Set<QueryClient>();

/**
 * The app's real QueryClient without retries. `cancelTestQueries` cancels its queries when the
 * test ends.
 */
export function createTestQueryClient(): QueryClient {
  const queryClient = createAppQueryClient({ retry: false });
  testQueryClients.add(queryClient);
  return queryClient;
}

/**
 * Cancels the current test's queries, so a request still in flight (e.g. a page the test
 * navigated to just before it ended) can't fail, and log, once the mock DB is reset. Called by
 * `setup.ts` after each test.
 */
export async function cancelTestQueries(): Promise<void> {
  const queryClients = [...testQueryClients];
  testQueryClients.clear();
  await Promise.all(queryClients.map((queryClient) => queryClient.cancelQueries()));
}

function AppProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <PageProvider>{children}</PageProvider>
    </QueryClientProvider>
  );
}

/** Renders a component with the app's real QueryClient (no retries) and page meta provider. */
export function renderWithAppProviders(
  ui: ReactElement,
  renderOptions: Omit<RenderOptions, "wrapper"> = {},
) {
  const queryClient = createTestQueryClient();
  const view = render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppProviders queryClient={queryClient}>{children}</AppProviders>
    ),
    ...renderOptions,
  });

  return { user: userEvent.setup(), queryClient, ...view };
}

/**
 * Renders a hook with the app's real QueryClient (no retries), e.g. for lifecycle hooks.
 * Seed unrelated cache entries through the returned `queryClient`.
 */
export function renderHookWithApp<Result>(hook: () => Result) {
  const queryClient = createTestQueryClient();
  const view = renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppProviders queryClient={queryClient}>{children}</AppProviders>
    ),
  });
  return { queryClient, ...view };
}

/** Auth state for components that take it as a prop, such as the login page. */
export function createTestAuthState(overrides: Partial<AuthState> = {}): AuthState {
  const status: AuthStatus =
    overrides.status ?? (overrides.user ? "authenticated" : "unauthenticated");
  const user = overrides.user ?? null;
  const isAuthenticated = overrides.isAuthenticated ?? status === "authenticated";

  return {
    status,
    isAuthenticated,
    user,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ensureSession: vi.fn().mockResolvedValue(isAuthenticated),
    clearSession: vi.fn(),
    ...overrides,
  };
}

export function createTestRedirects(overrides: Partial<LoginRedirects> = {}): LoginRedirects {
  return {
    safeLoginRedirect: vi.fn((redirect: unknown) =>
      typeof redirect === "string" ? redirect : "/",
    ),
    ...overrides,
  };
}
