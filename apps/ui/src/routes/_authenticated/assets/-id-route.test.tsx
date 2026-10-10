import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createAssetByIDQueryOptions } from "@/features/assets";
import { SEED_ASSETS } from "@/mocks/fixtures/index.ts";
import { Route } from "@/routes/_authenticated/assets/$id.tsx";
import { recordApiRequests } from "@/test/msw.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
}));

type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
}) => Promise<unknown>;

const [asset] = SEED_ASSETS;

describe("assets id route", () => {
  it("ensures exactly the requested asset before rendering the detail page", async () => {
    const requests = recordApiRequests();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ensure = vi.spyOn(client, "ensureQueryData");

    await expect(
      (Route.options.loader as unknown as Loader)({
        context: { queryClient: client },
        params: { id: asset.id },
      }),
    ).resolves.toEqual(asset);

    expect(ensure.mock.calls.map(([options]) => options)).toEqual([
      { ...createAssetByIDQueryOptions(asset.id), queryFn: expect.any(Function) },
    ]);
    expect(requests).toEqual([`GET /api/assets/${asset.id}`]);
  });
});
