import { beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/_authenticated/index.tsx";

const mocks = vi.hoisted(() => ({
  assetOptions: { queryKey: ["assets"] },
  findingStatsOptions: { queryKey: ["findings", "stats"] },
  ensureQueryData: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
    }),
  });
});

vi.mock("@/features/assets", () => ({
  createListAssetsQueryOptions: () => mocks.assetOptions,
}));

vi.mock("@/features/dashboard", () => ({
  DashboardPage: () => null,
}));

vi.mock("@/features/findings", () => ({
  createFindingStatsQueryOptions: () => mocks.findingStatsOptions,
}));

describe("dashboard route", () => {
  beforeEach(() => {
    mocks.ensureQueryData.mockReset();
  });

  it("ensures asset and finding statistics queries in parallel", async () => {
    let resolveAsset: (value: typeof mocks.assetOptions) => void = () => undefined;
    let resolveFindingStats: (value: typeof mocks.findingStatsOptions) => void = () => undefined;
    const assetPromise = new Promise<typeof mocks.assetOptions>((resolve) => {
      resolveAsset = resolve;
    });
    const findingStatsPromise = new Promise<typeof mocks.findingStatsOptions>((resolve) => {
      resolveFindingStats = resolve;
    });

    mocks.ensureQueryData.mockImplementation((options: typeof mocks.assetOptions) => {
      if (options === mocks.assetOptions) {
        return assetPromise;
      }

      return findingStatsPromise;
    });

    const loader = Route.options.loader as unknown as (args: {
      context: {
        queryClient: {
          ensureQueryData: typeof mocks.ensureQueryData;
        };
      };
    }) => Promise<unknown>;
    const loaderResult = loader({
      context: {
        queryClient: {
          ensureQueryData: mocks.ensureQueryData,
        },
      },
    });

    expect(mocks.ensureQueryData).toHaveBeenCalledTimes(2);
    expect(mocks.ensureQueryData).toHaveBeenNthCalledWith(1, mocks.assetOptions);
    expect(mocks.ensureQueryData).toHaveBeenNthCalledWith(2, mocks.findingStatsOptions);

    resolveAsset(mocks.assetOptions);
    resolveFindingStats(mocks.findingStatsOptions);

    await expect(loaderResult).resolves.toEqual([mocks.assetOptions, mocks.findingStatsOptions]);
  });
});
