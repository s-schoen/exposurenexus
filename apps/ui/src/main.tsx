import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createRouter } from "@tanstack/react-router"

import * as TanStackQueryProvider from "@/integrations/tanstack-query/root-provider.tsx"

// Import the generated route tree
import { routeTree } from "@/routeTree.gen.ts"

import "@/styles.css"
import { AuthProvider, useAuth } from "@/context/auth.tsx"
import { PageProvider, usePage } from "@/context/page.tsx"
import { createRouterLoginRedirects } from "@/lib/login-redirect.ts"

// Create a new router instance

const TanStackQueryProviderContext = TanStackQueryProvider.getContext()
const router = createRouter({
  routeTree,
  context: {
    ...TanStackQueryProviderContext,
    // auth will be passed down from App component
    auth: undefined!,
    page: undefined!,
    redirects: undefined!
  },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0
})
const redirects = createRouterLoginRedirects(router)

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById("app")
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <TanStackQueryProvider.Provider {...TanStackQueryProviderContext}>
        <App />
      </TanStackQueryProvider.Provider>
    </StrictMode>
  )
}

function InnerApp() {
  const auth = useAuth()
  const page = usePage()
  return <RouterProvider router={router} context={{ auth, page, redirects }} />
}

function App() {
  return (
    <AuthProvider>
      <PageProvider>
        <InnerApp />
      </PageProvider>
    </AuthProvider>
  )
}
