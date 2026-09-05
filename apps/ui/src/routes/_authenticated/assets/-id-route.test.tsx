import { beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/_authenticated/assets/$id.tsx";

const mocks = vi.hoisted(() => ({
  asset: { id: "asset-1", displayName: "API" },
  assetId: "asset-1",
  assetOptions: { queryKey: ["assets", "asset-1"] },
  createAssetByIDQueryOptions: vi.fn(),
  ensureQueryData: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useParams: () => ({ id: mocks.assetId }),
    }),
  });
});

vi.mock("@/features/assets", () => ({
  AssetDetailPage: () => null,
  createAssetByIDQueryOptions: mocks.createAssetByIDQueryOptions,
}));

type LoaderArgs = {
  context: {
    queryClient: {
      ensureQueryData: typeof mocks.ensureQueryData;
    };
  };
  params: { id: string };
};

describe("assets id route", () => {
  beforeEach(() => {
    mocks.createAssetByIDQueryOptions.mockReset();
    mocks.createAssetByIDQueryOptions.mockReturnValue(mocks.assetOptions);
    mocks.ensureQueryData.mockReset();
    mocks.ensureQueryData.mockResolvedValue(mocks.asset);
  });

  it("ensures the requested asset before rendering the detail page", async () => {
    const loader = Route.options.loader as unknown as (args: LoaderArgs) => Promise<unknown>;

    await expect(
      loader({
        context: { queryClient: { ensureQueryData: mocks.ensureQueryData } },
        params: { id: mocks.assetId },
      }),
    ).resolves.toBe(mocks.asset);

    expect(mocks.createAssetByIDQueryOptions).toHaveBeenCalledWith(mocks.assetId);
    expect(mocks.ensureQueryData).toHaveBeenCalledWith(mocks.assetOptions);
  });
});
