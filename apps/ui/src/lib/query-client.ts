import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { APIError } from "@/lib/api-client.ts";

import type { Mutation, Query } from "@tanstack/react-query";

export const DEFAULT_QUERY_STALE_TIME = 1000 * 60 * 5;

export const SKIP_UNAUTHORIZED_ERROR_META = {
  skipUnauthorizedError: true,
} as const;

export interface UnauthorizedAPIErrorEvent {
  source: "query" | "mutation";
}

type UnauthorizedAPIErrorHandler = (event: UnauthorizedAPIErrorEvent) => void;

const unauthorizedAPIErrorHandlers = new Set<UnauthorizedAPIErrorHandler>();

function isUnauthorizedAPIError(error: unknown): boolean {
  return error instanceof APIError && error.statusCode === 401;
}

function shouldSkipUnauthorizedError(meta: unknown): boolean {
  return (
    typeof meta === "object" &&
    meta !== null &&
    "skipUnauthorizedError" in meta &&
    meta.skipUnauthorizedError === true
  );
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return !isUnauthorizedAPIError(error) && failureCount < 3;
}

function notifyUnauthorizedAPIError(event: UnauthorizedAPIErrorEvent): void {
  for (const handler of unauthorizedAPIErrorHandlers) {
    handler(event);
  }
}

function handleQueryError(error: unknown, query: Query<unknown, unknown, unknown>): void {
  if (isUnauthorizedAPIError(error) && !shouldSkipUnauthorizedError(query.meta)) {
    notifyUnauthorizedAPIError({ source: "query" });
  }
}

function handleMutationError(error: unknown, mutation: Mutation<unknown, unknown, unknown>): void {
  if (isUnauthorizedAPIError(error) && !shouldSkipUnauthorizedError(mutation.meta)) {
    notifyUnauthorizedAPIError({ source: "mutation" });
  }
}

export function subscribeUnauthorizedAPIError(handler: UnauthorizedAPIErrorHandler): () => void {
  unauthorizedAPIErrorHandlers.add(handler);

  return () => {
    unauthorizedAPIErrorHandlers.delete(handler);
  };
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
      },
    },
    queryCache: new QueryCache({
      onError: handleQueryError,
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        handleMutationError(error, mutation);
      },
    }),
  });
}

export function invalidateTaggedQueries(queryClient: QueryClient, tag: string): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const invalidationTags = query.meta?.invalidationTags;
      return Array.isArray(invalidationTags) && invalidationTags.includes(tag);
    },
  });
}
