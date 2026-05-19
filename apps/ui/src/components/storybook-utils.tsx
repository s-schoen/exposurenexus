import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  RouterContextProvider,
  createMemoryHistory,
  createRouter
} from "@tanstack/react-router"
import { NuqsAdapter } from "nuqs/adapters/tanstack-router"
import { useMemo } from "react"
import type { ReactNode } from "react"
import { routeTree } from "@/routeTree.gen.ts"

export function createStoryQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY
      }
    }
  })
}

export function createObjectResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify({ data }), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  })
}

export function createArrayResponse(data: Array<unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify({ data: { items: data } }), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  })
}

interface RouterStoryProviderProps {
  children: ReactNode
  queryClient: QueryClient
  initialPath?: string
  withNuqs?: boolean
}

export function RouterStoryProvider({
  children,
  queryClient,
  initialPath = "/",
  withNuqs = false
}: RouterStoryProviderProps) {
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: [initialPath]
        }),
        context: {
          auth: undefined!,
          page: undefined!,
          queryClient
        }
      }),
    [initialPath, queryClient]
  )

  return (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={queryClient}>
        {withNuqs ? <NuqsAdapter>{children}</NuqsAdapter> : children}
      </QueryClientProvider>
    </RouterContextProvider>
  )
}
