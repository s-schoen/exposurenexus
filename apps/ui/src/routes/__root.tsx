import { Outlet, createRootRouteWithContext } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"

import type { QueryClient } from "@tanstack/react-query"
import type { AuthState } from "@/context/auth.tsx"
import type { PageState } from "@/context/page.tsx"
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools"

interface MyRouterContext {
  queryClient: QueryClient
  auth: AuthState
  page: PageState
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <>
      <Outlet />
      <TanStackDevtools
        config={{
          position: "bottom-right"
        }}
        plugins={[
          {
            name: "Tanstack Router",
            render: <TanStackRouterDevtoolsPanel />
          },
          TanStackQueryDevtools
        ]}
      />
    </>
  )
})
