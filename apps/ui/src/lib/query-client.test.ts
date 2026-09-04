import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { APIError } from "@/lib/api-client.ts";
import {
  SKIP_UNAUTHORIZED_ERROR_META,
  createAppQueryClient,
  invalidateTaggedQueries,
  subscribeUnauthorizedAPIError,
} from "@/lib/query-client.ts";

describe("query client infrastructure", () => {
  it("does not retry query 401s and notifies subscribers", async () => {
    const queryClient = createAppQueryClient();
    const handler = vi.fn();
    const unsubscribe = subscribeUnauthorizedAPIError(handler);
    const queryFn = vi.fn(() => {
      throw new APIError(401, "Unauthorized");
    });

    await expect(
      queryClient.fetchQuery({
        queryKey: ["protected"],
        queryFn,
      }),
    ).rejects.toThrow("Unauthorized");

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ source: "query" });
    unsubscribe();
  });

  it("retries other query failures while the failure count is below three", async () => {
    const queryClient = createAppQueryClient();
    const queryFn = vi.fn(() => {
      throw new APIError(500, "Internal Server Error");
    });

    await expect(
      queryClient.fetchQuery({
        queryKey: ["protected"],
        queryFn,
        retryDelay: 0,
      }),
    ).rejects.toThrow("Internal Server Error");

    expect(queryFn).toHaveBeenCalledTimes(4);
  });

  it("notifies for mutation 401s", async () => {
    const queryClient = createAppQueryClient();
    const handler = vi.fn();
    const unsubscribe = subscribeUnauthorizedAPIError(handler);

    await expect(
      queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationFn: () => {
            throw new APIError(401, "Unauthorized");
          },
        })
        .execute(undefined),
    ).rejects.toThrow("Unauthorized");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ source: "mutation" });
    unsubscribe();
  });

  it("skips query and mutation 401 notifications when requested by metadata", async () => {
    const queryClient = createAppQueryClient();
    const handler = vi.fn();
    const unsubscribe = subscribeUnauthorizedAPIError(handler);

    await expect(
      queryClient.fetchQuery({
        queryKey: ["session-probe"],
        meta: SKIP_UNAUTHORIZED_ERROR_META,
        queryFn: () => {
          throw new APIError(401, "Unauthorized");
        },
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      queryClient
        .getMutationCache()
        .build(queryClient, {
          meta: SKIP_UNAUTHORIZED_ERROR_META,
          mutationFn: () => {
            throw new APIError(401, "Unauthorized");
          },
        })
        .execute(undefined),
    ).rejects.toThrow("Unauthorized");

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("invalidates only exact metadata tags with default active and inactive behavior", async () => {
    const queryClient = createAppQueryClient();
    const activeQueryFn = vi.fn().mockResolvedValue("active");
    const inactiveQueryFn = vi.fn().mockResolvedValue("inactive");
    const similarQueryFn = vi.fn().mockResolvedValue("similar");
    const untaggedQueryFn = vi.fn().mockResolvedValue("untagged");
    const activeOptions = {
      queryKey: ["active-tagged"] as const,
      queryFn: activeQueryFn,
      meta: { invalidationTags: ["vulnerability"] },
      staleTime: Infinity,
    };

    await queryClient.fetchQuery(activeOptions);
    await queryClient.fetchQuery({
      queryKey: ["inactive-tagged"],
      queryFn: inactiveQueryFn,
      meta: { invalidationTags: ["vulnerability"] },
      staleTime: Infinity,
    });
    await queryClient.fetchQuery({
      queryKey: ["similar-tag"],
      queryFn: similarQueryFn,
      meta: { invalidationTags: ["vulnerability-detail"] },
      staleTime: Infinity,
    });
    await queryClient.fetchQuery({
      queryKey: ["untagged"],
      queryFn: untaggedQueryFn,
      staleTime: Infinity,
    });

    const observer = new QueryObserver(queryClient, activeOptions);
    const unsubscribe = observer.subscribe(() => undefined);

    await invalidateTaggedQueries(queryClient, "vulnerability");

    expect(activeQueryFn).toHaveBeenCalledTimes(2);
    expect(inactiveQueryFn).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(["inactive-tagged"])?.isInvalidated).toBe(true);
    expect(similarQueryFn).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(["similar-tag"])?.isInvalidated).toBe(false);
    expect(untaggedQueryFn).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(["untagged"])?.isInvalidated).toBe(false);
    unsubscribe();
  });
});
