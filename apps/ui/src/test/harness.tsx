import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { AUTH_SESSION_QUERY_KEY, AuthProvider } from "@/features/auth";
import { PageProvider } from "@/hooks/use-page-meta.tsx";

import type { AuthSessionQueryData, AuthState, AuthStatus, LoginRedirects } from "@/features/auth";
import type { PageState } from "@/hooks/use-page-meta.tsx";
import type { AuthSessionDataReply } from "@exposurenexus/contracts/api";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { QueryClientConfig, QueryKey } from "@tanstack/react-query";
import type { RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

interface QueryDataSeed<TData = unknown> {
  queryKey: QueryKey;
  data: TData;
}

interface RenderWithQueryClientOptions extends Omit<RenderOptions, "wrapper"> {
  queryClient?: QueryClient;
  queryData?: Array<QueryDataSeed>;
}

interface RenderWithAppProvidersOptions extends RenderWithQueryClientOptions {
  authSession?: AuthSessionQueryData;
  withAuth?: boolean;
  withPage?: boolean;
}

export function createTestQueryClient(config: QueryClientConfig = {}) {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      mutations: {
        retry: false,
        ...config.defaultOptions?.mutations,
      },
      queries: {
        retry: false,
        ...config.defaultOptions?.queries,
      },
    },
  });
}

export function seedQueryData(queryClient: QueryClient, queryData: Array<QueryDataSeed>) {
  for (const { data, queryKey } of queryData) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function createTestAuthSession(
  user: UserProfile,
  session: Partial<AuthSessionDataReply["session"]> = {},
): AuthSessionDataReply {
  return {
    user,
    session: {
      id: "11111111-1111-4111-8111-111111111111",
      userId: user.id,
      sourceIp: null,
      userAgent: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-01-01T01:00:00.000Z"),
      ...session,
    },
  };
}

export function seedAuthSession(queryClient: QueryClient, authSession: AuthSessionQueryData) {
  queryClient.setQueryDefaults(AUTH_SESSION_QUERY_KEY, {
    staleTime: Infinity,
  });
  queryClient.setQueryData<AuthSessionQueryData>(AUTH_SESSION_QUERY_KEY, authSession);
}

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

export function createTestPageState(overrides: Partial<PageState> = {}): PageState {
  return {
    title: "",
    setTitle: vi.fn(),
    description: "",
    setDescription: vi.fn(),
    actions: [],
    setActions: vi.fn(),
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

export function createTestRouterControls({
  auth,
  page,
  redirects,
}: {
  auth?: AuthState;
  page?: PageState;
  redirects?: LoginRedirects;
} = {}) {
  return {
    auth: auth ?? createTestAuthState(),
    page: page ?? createTestPageState(),
    redirects: redirects ?? createTestRedirects(),
    navigate: vi.fn(),
  };
}

export function renderWithQueryClient(
  ui: ReactElement,
  {
    queryClient = createTestQueryClient(),
    queryData = [],
    ...renderOptions
  }: RenderWithQueryClientOptions = {},
) {
  seedQueryData(queryClient, queryData);

  const view = render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    ...renderOptions,
  });

  return {
    user: userEvent.setup(),
    queryClient,
    ...view,
  };
}

export function renderWithAppProviders(
  ui: ReactElement,
  {
    authSession,
    queryClient = createTestQueryClient(),
    queryData = [],
    withAuth = authSession !== undefined,
    withPage = true,
    ...renderOptions
  }: RenderWithAppProvidersOptions = {},
) {
  seedQueryData(queryClient, queryData);

  if (withAuth) {
    seedAuthSession(queryClient, authSession ?? null);
  }

  const view = render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => {
      let content = children;

      if (withPage) {
        content = <PageProvider>{content}</PageProvider>;
      }

      if (withAuth) {
        content = <AuthProvider>{content}</AuthProvider>;
      }

      return <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>;
    },
    ...renderOptions,
  });

  return {
    user: userEvent.setup(),
    queryClient,
    ...view,
  };
}
