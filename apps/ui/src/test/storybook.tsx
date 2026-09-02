import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { useMemo } from "react";

import { createRouterLoginRedirects } from "@/features/auth/index.ts";
import { routeTree } from "@/routeTree.gen.ts";

import type { ReactNode } from "react";

export function createStoryLoginRedirects() {
  return createRouterLoginRedirects(
    {
      getMatchedRoutes: () => [[], {}, routeTree],
    },
    {
      origin: "http://localhost",
    },
  );
}

const storyRedirects = createStoryLoginRedirects();

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
  return new Response(JSON.stringify({ data }), createJsonResponseInit(init));
}

export function createArrayResponse(data: Array<unknown>, init?: ResponseInit) {
  return new Response(JSON.stringify({ data: { items: data } }), createJsonResponseInit(init));
}

function createJsonResponseInit(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return {
    ...init,
    headers,
  };
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
