import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createAssetByIDQueryOptions, createListAssetsQueryOptions } from "@/features/assets";
import { createFindingByIDQueryOptions, createListFindingsQueryOptions } from "@/features/findings";
import { createListUsersQueryOptions } from "@/features/users";
import { Route as DetailRoute } from "@/routes/_authenticated/findings/$id.tsx";
import { Route as ImportRoute } from "@/routes/_authenticated/findings/import.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/findings/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/findings/new.tsx";
import { Route as TriageRoute } from "@/routes/_authenticated/findings/triage.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
}));

type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
}) => Promise<unknown>;

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const optionsLike = (options: object) => ({ ...options, queryFn: expect.any(Function) });

describe("finding critical-data loaders", () => {
  it.each([
    [
      "list",
      IndexRoute,
      [
        createListFindingsQueryOptions(),
        createListAssetsQueryOptions(),
        createListUsersQueryOptions(),
      ],
    ],
    [
      "triage",
      TriageRoute,
      [
        createListFindingsQueryOptions(),
        createListAssetsQueryOptions(),
        createListUsersQueryOptions(),
      ],
    ],
    ["create", NewRoute, [createListAssetsQueryOptions(), createListUsersQueryOptions()]],
  ] as const)(
    "starts exactly the %s query set in parallel and waits for all",
    async (_, route, options) => {
      const client = new QueryClient();
      const requests = options.map(() => deferred());
      const ensure = vi.spyOn(client, "ensureQueryData");
      requests.forEach((request) => ensure.mockImplementationOnce(() => request.promise));
      const completed = vi.fn();
      const loading = (route.options.loader as unknown as Loader)({
        context: { queryClient: client },
        params: { id: "selected-preview" },
      }).then(completed);
      expect(ensure.mock.calls.map(([option]) => option)).toEqual(options.map(optionsLike));
      for (const request of requests.slice(0, -1)) request.resolve([]);
      await Promise.resolve();
      expect(completed).not.toHaveBeenCalled();
      requests.at(-1)!.resolve([]);
      await loading;
      expect(completed).toHaveBeenCalledOnce();
    },
  );

  it("loads asset-1 only after the concrete finding resolves and waits for the asset", async () => {
    const client = new QueryClient();
    const finding = deferred();
    const asset = deferred();
    const ensure = vi
      .spyOn(client, "ensureQueryData")
      .mockImplementationOnce(() => finding.promise)
      .mockImplementationOnce(() => asset.promise);
    const completed = vi.fn();
    const loading = (DetailRoute.options.loader as unknown as Loader)({
      context: { queryClient: client },
      params: { id: "finding-1" },
    }).then(completed);
    expect(ensure.mock.calls).toEqual([[optionsLike(createFindingByIDQueryOptions("finding-1"))]]);
    finding.resolve({ id: "finding-1", assetId: "asset-1" });
    await Promise.resolve();
    expect(ensure.mock.calls).toEqual([
      [optionsLike(createFindingByIDQueryOptions("finding-1"))],
      [optionsLike(createAssetByIDQueryOptions("asset-1"))],
    ]);
    expect(completed).not.toHaveBeenCalled();
    asset.resolve({ id: "asset-1" });
    await loading;
    expect(completed).toHaveBeenCalledOnce();
  });

  it("does not request an asset when finding loading fails", async () => {
    const client = new QueryClient();
    const ensure = vi
      .spyOn(client, "ensureQueryData")
      .mockRejectedValue(new Error("Finding failed"));
    await expect(
      (DetailRoute.options.loader as unknown as Loader)({
        context: { queryClient: client },
        params: { id: "finding-1" },
      }),
    ).rejects.toThrow("Finding failed");
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("keeps import loader-free", () => {
    expect(ImportRoute.options.loader).toBeUndefined();
  });
});
