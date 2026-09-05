import { beforeEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/_authenticated/assets/index.tsx";

const mocks = vi.hoisted(() => ({
  assets: [],
  customFieldDefinitions: [{ id: "field-1", key: "environment", type: "text" }],
  ensureQueryData: vi.fn(),
  users: [],
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  });
});

vi.mock("@/features/assets", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, { AssetsPage: () => null });
});

type QueryClient = {
  ensureQueryData: typeof mocks.ensureQueryData;
};

type LoaderArgs = {
  context: { queryClient: QueryClient };
  deps: Record<string, unknown>;
};

describe("assets index route", () => {
  beforeEach(() => {
    mocks.ensureQueryData.mockReset();
  });

  it("keeps filter and dynamic custom-field dependencies while excluding selected", () => {
    const loaderDeps = Route.options.loaderDeps as unknown as (args: {
      search: Record<string, unknown>;
    }) => Record<string, unknown>;
    const search = {
      filter: "api",
      assetType: "host",
      assetEnvironment: "production",
      assetLifecycleState: "active",
      assetOwnerId: "owner-1",
      deployment_tier: "production",
    };

    expect(loaderDeps({ search: { ...search, selected: "asset-1" } })).toEqual(search);
    expect(loaderDeps({ search: { ...search, selected: "asset-2" } })).toEqual(
      loaderDeps({ search: { ...search, selected: undefined } }),
    );
  });

  it("loads definitions before calculating options and prefetches assets and users in parallel", async () => {
    let resolveDefinitions: (value: typeof mocks.customFieldDefinitions) => void = () => undefined;
    let resolveAssets: (value: typeof mocks.assets) => void = () => undefined;
    let resolveUsers: (value: typeof mocks.users) => void = () => undefined;
    const definitionsPromise = new Promise<typeof mocks.customFieldDefinitions>((resolve) => {
      resolveDefinitions = resolve;
    });
    const assetsPromise = new Promise<typeof mocks.assets>((resolve) => {
      resolveAssets = resolve;
    });
    const usersPromise = new Promise<typeof mocks.users>((resolve) => {
      resolveUsers = resolve;
    });

    mocks.ensureQueryData.mockImplementation((options: unknown) => {
      const queryKey = (options as { queryKey: ReadonlyArray<unknown> }).queryKey;

      if (queryKey.length === 1 && queryKey[0] === "asset-custom-fields") {
        return definitionsPromise;
      }
      if (queryKey[0] === "assets") {
        return assetsPromise;
      }
      if (queryKey.length === 1 && queryKey[0] === "users") {
        return usersPromise;
      }

      throw new Error("Unexpected query options");
    });

    const loader = Route.options.loader as unknown as (args: LoaderArgs) => Promise<unknown>;
    const loaderPromise = loader({
      context: { queryClient: { ensureQueryData: mocks.ensureQueryData } },
      deps: {
        filter: "api",
        assetType: "host",
        assetEnvironment: "production",
        assetLifecycleState: "active",
        assetOwnerId: "owner-1",
        deployment_tier: "production",
      },
    });

    expect(mocks.ensureQueryData).toHaveBeenCalledTimes(1);

    resolveDefinitions(mocks.customFieldDefinitions);
    await vi.waitFor(() => {
      expect(mocks.ensureQueryData).toHaveBeenCalledTimes(3);
    });

    expect(mocks.ensureQueryData.mock.calls[1]?.[0]).toMatchObject({
      queryKey: [
        "assets",
        "with-custom-fields",
        "filter=api&assetType=host&assetEnvironment=production&assetLifecycleState=active&assetOwnerId=owner-1",
      ],
    });
    expect(mocks.ensureQueryData.mock.calls[2]?.[0]).toMatchObject({
      queryKey: ["users"],
    });

    resolveAssets(mocks.assets);
    resolveUsers(mocks.users);

    await expect(loaderPromise).resolves.toEqual([mocks.assets, mocks.users]);
  });
});
