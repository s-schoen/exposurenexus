import { QueryClientProvider } from "@tanstack/react-query";

import { createAppQueryClient } from "@/lib/query-client.ts";

import type { QueryClient } from "@tanstack/react-query";

export function getContext() {
  const queryClient = createAppQueryClient();
  return {
    queryClient,
  };
}

export function Provider({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
