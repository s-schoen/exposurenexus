import { RouterProvider, createRouter } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { RouteErrorState } from "@/components/route-error-state.tsx";
import { RoutePendingState } from "@/components/route-pending-state.tsx";
import {
  AuthProvider,
  createRouterLoginRedirects,
  createUserSessionExpiredRedirectHandler,
  useAuth,
} from "@/features/auth";
import { PageProvider } from "@/hooks/use-page-meta.tsx";
import { subscribeUnauthorizedAPIError } from "@/lib/query-client.ts";
import { routeTree } from "@/routeTree.gen.ts";

import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";

interface CreateAppRouterOptions {
  queryClient: QueryClient;
  /** Defaults to browser history; tests pass a memory history. */
  history?: RouterHistory;
}

export function createAppRouter({ queryClient, history }: CreateAppRouterOptions) {
  return createRouter({
    routeTree,
    history,
    context: {
      queryClient,
      // auth and redirects are passed down from App
      auth: undefined!,
      redirects: undefined!,
    },
    defaultPreload: "intent",
    defaultErrorComponent: RouteErrorState,
    defaultPendingComponent: RoutePendingState,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

function InnerApp({ router }: { router: AppRouter }) {
  const auth = useAuth();
  const redirects = useMemo(() => createRouterLoginRedirects(router), [router]);

  useEffect(
    () =>
      subscribeUnauthorizedAPIError(
        createUserSessionExpiredRedirectHandler({
          clearSession: auth.clearSession,
          getLocation: () => router.state.location,
          navigateToLogin: (redirect) =>
            router.navigate({
              to: "/login",
              replace: true,
              search: {
                redirect,
              },
            }),
          safeLoginRedirect: redirects.safeLoginRedirect,
        }),
      ),
    [auth, redirects, router],
  );

  return <RouterProvider router={router} context={{ auth, redirects }} />;
}

/** The app below the QueryClientProvider: auth, page meta and the router. */
export function App({ router }: { router: AppRouter }) {
  return (
    <AuthProvider>
      <PageProvider>
        <InnerApp router={router} />
      </PageProvider>
    </AuthProvider>
  );
}
