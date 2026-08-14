import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { useMemo } from "react";

import { createLoginRedirects } from "@/lib/login-redirect.ts";
import { routeTree } from "@/routeTree.gen.ts";

import type { ReactNode } from "react";

const storyRedirects = createLoginRedirects({
  origin: "http://localhost",
  isKnownRoutePath: () => true,
});

export function createStoryQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

export function createObjectResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify({ data }), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export function createArrayResponse(data: Array<unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify({ data: { items: data } }), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

interface RouterStoryProviderProps {
  children: ReactNode;
  queryClient: QueryClient;
  initialPath?: string;
}

export function RouterStoryProvider({
  children,
  queryClient,
  initialPath = "/",
}: RouterStoryProviderProps) {
  const router = useMemo(
    () =>
      createRouter({
        routeTree,
        history: createMemoryHistory({
          initialEntries: [initialPath],
        }),
        context: {
          auth: undefined!,
          page: undefined!,
          redirects: storyRedirects,
          queryClient,
        },
      }),
    [initialPath, queryClient],
  );

  return (
    <RouterContextProvider router={router}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </RouterContextProvider>
  );
}
