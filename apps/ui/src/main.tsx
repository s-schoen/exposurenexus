import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";

import { AuthProvider, useAuth } from "@/context/auth.tsx";
import { PageProvider, usePage } from "@/context/page.tsx";

import "@/styles.css";
import * as TanStackQueryProvider from "@/integrations/tanstack-query/root-provider.tsx";
import { createUserSessionExpiredRedirectHandler } from "@/lib/auth-session-expiry.ts";
import { createRouterLoginRedirects } from "@/lib/login-redirect.ts";
import { subscribeUnauthorizedAPIError } from "@/lib/query-client.ts";
// Import the generated route tree
import { routeTree } from "@/routeTree.gen.ts";

// Create a new router instance

const TanStackQueryProviderContext = TanStackQueryProvider.getContext();
const router = createRouter({
  routeTree,
  context: {
    ...TanStackQueryProviderContext,
    // auth will be passed down from App component
    auth: undefined!,
    page: undefined!,
    redirects: undefined!,
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
});
const redirects = createRouterLoginRedirects(router);

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
        <App />
      </TanStackQueryProvider.Provider>
    </StrictMode>,
  );
}

function InnerApp() {
  const auth = useAuth();
  const page = usePage();

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
    [auth],
  );

  return <RouterProvider router={router} context={{ auth, page, redirects }} />;
}

function App() {
  return (
    <AuthProvider>
      <PageProvider>
        <InnerApp />
      </PageProvider>
    </AuthProvider>
  );
}
