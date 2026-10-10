import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createListAssetsQueryOptions } from "@/features/assets";
import { createFindingStatsQueryOptions } from "@/features/findings";
import { Route } from "@/routes/_authenticated/index.tsx";
import { recordApiRequests } from "@/test/msw.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
}));

type Loader = (args: { context: { queryClient: QueryClient } }) => Promise<unknown>;

describe("dashboard route", () => {
  it("ensures assets and finding statistics in parallel", async () => {
    const requests = recordApiRequests();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ensure = vi.spyOn(client, "ensureQueryData");

    const loading = (Route.options.loader as unknown as Loader)({
      context: { queryClient: client },
    });

    // Both queries start before either resolves.
    expect(ensure.mock.calls.map(([options]) => options.queryKey)).toEqual([
      createListAssetsQueryOptions().queryKey,
      createFindingStatsQueryOptions().queryKey,
    ]);
    await loading;
    expect([...requests].sort()).toEqual(["GET /api/assets", "GET /api/findings/stats"]);
  });
});
