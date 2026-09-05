import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  createListVulnerabilitiesQueryOptions,
  createVulnerabilityByIDQueryOptions,
} from "@/features/vulnerabilities";
import {
  getVulnerabilityByID,
  listVulnerabilities,
} from "@/features/vulnerabilities/api/vulnerabilities.ts";
import { Route as EditRoute } from "@/routes/_authenticated/vulnerabilities/$id.edit.tsx";
import { Route as DetailRoute } from "@/routes/_authenticated/vulnerabilities/$id.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/vulnerabilities/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/vulnerabilities/new.tsx";
import { STORY_VULNERABILITIES } from "@/test/fixtures.ts";

import type { ComponentType } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ id: STORY_VULNERABILITIES[1].id }),
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/features/vulnerabilities/hooks/use-vulnerability-lifecycle.ts", () => ({
  useVulnerabilityLifecycle: () => ({}),
}));
vi.mock("@/features/vulnerabilities/api/vulnerabilities.ts", () => ({
  getVulnerabilityByID: vi.fn(),
  listVulnerabilities: vi.fn(),
}));
vi.mock("@/components/detail-preview-dialog.tsx", () => ({ DetailPreviewDialog: () => null }));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
  deps?: { selected: string };
}) => Promise<unknown>;

const vulnerability = STORY_VULNERABILITIES[1];
const cases = [
  ["index", IndexRoute, [createListVulnerabilitiesQueryOptions()]],
  ["parent detail", DetailRoute, [createVulnerabilityByIDQueryOptions(vulnerability.id)]],
] as const;

it.each(cases)(
  "%s ensures exactly its critical query and waits for completion",
  async (_, route, options) => {
    const client = new QueryClient();
    const requests = options.map(() => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise((res) => {
        resolve = res;
      });
      return { promise, resolve };
    });
    const ensure = vi.spyOn(client, "ensureQueryData");
    requests.forEach((request) => ensure.mockImplementationOnce(() => request.promise));
    const completed = vi.fn();
    const loading = (route.options.loader as unknown as Loader)({
      context: { queryClient: client },
      params: { id: vulnerability.id },
      deps: { selected: "unrequested-preview" },
    }).then(completed);
    expect(ensure.mock.calls.map(([option]) => option)).toEqual(
      options.map((option) => ({ ...option, queryFn: expect.any(Function) })),
    );
    for (const request of requests.slice(0, -1)) request.resolve([]);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    requests.at(-1)!.resolve([]);
    await loading;
    expect(completed).toHaveBeenCalledOnce();
  },
);

it.each(cases)(
  "%s propagates each critical request failure to the router",
  async (_, route, options) => {
    for (let failedIndex = 0; failedIndex < options.length; failedIndex++) {
      const client = new QueryClient();
      const error = new Error("Critical request failed");
      const ensure = vi.spyOn(client, "ensureQueryData");
      options.forEach((_option, index) =>
        ensure.mockImplementationOnce(() =>
          index === failedIndex ? Promise.reject(error) : Promise.resolve([]),
        ),
      );
      await expect(
        (route.options.loader as unknown as Loader)({
          context: { queryClient: client },
          params: { id: vulnerability.id },
        }),
      ).rejects.toBe(error);
    }
  },
);

it("fetches catalog entries once across index loading and suspense rendering", async () => {
  // Use production query defaults, so a stale-time regression causes a duplicate request.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(listVulnerabilities).mockResolvedValue([vulnerability]);
  await (IndexRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: vulnerability.id },
  });
  const Component = IndexRoute.options.component as ComponentType;
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback="Loading">
          <Component />
        </Suspense>
      </QueryClientProvider>,
    );
  });
  expect(await screen.findByText(vulnerability.title)).toBeVisible();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(listVulnerabilities).toHaveBeenCalledTimes(1);
  expect(getVulnerabilityByID).not.toHaveBeenCalled();
});

it("nested edit renders parent-loaded catalog entry without a duplicate loader", async () => {
  expect(EditRoute.options.loader).toBeUndefined();
  // Entity queries retain their default stale policy; fresh seeded data isolates parent reuse.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  vi.mocked(getVulnerabilityByID).mockResolvedValue(vulnerability);
  await (DetailRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: vulnerability.id },
  });
  const Component = EditRoute.options.component as ComponentType;
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback="Loading">
          <Component />
        </Suspense>
      </QueryClientProvider>,
    );
  });
  expect(await screen.findByDisplayValue(vulnerability.title)).toBeVisible();
  expect(screen.getByDisplayValue(vulnerability.identifier)).toBeVisible();
  expect(client.isFetching()).toBe(0);
  expect(getVulnerabilityByID).toHaveBeenCalledExactlyOnceWith(vulnerability.id);
  expect(listVulnerabilities).not.toHaveBeenCalled();
});

it("keeps new loader-free", () => {
  expect(NewRoute.options.loader).toBeUndefined();
});
