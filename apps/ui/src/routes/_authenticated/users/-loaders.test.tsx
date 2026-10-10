import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { expect, it, vi } from "vitest";

import { createListRolesQueryOptions } from "@/features/roles";
import { createListUsersQueryOptions, createUserByIDQueryOptions } from "@/features/users";
import { PageProvider } from "@/hooks/use-page-meta.tsx";
import { SEED_ROLES, SEED_USERS } from "@/mocks/fixtures/seed.ts";
import { Route as EditRoute } from "@/routes/_authenticated/users/$id.edit.tsx";
import { Route as DetailRoute } from "@/routes/_authenticated/users/$id.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/users/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/users/new.tsx";
import { recordApiRequests } from "@/test/msw.ts";

import type { ComponentType } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ id: SEED_USERS[1].id }),
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
}));

type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
  deps?: { selected: string };
}) => Promise<unknown>;

const user = SEED_USERS[1];
const cases = [
  ["index", IndexRoute, [createListUsersQueryOptions(), createListRolesQueryOptions()]],
  [
    "parent detail",
    DetailRoute,
    [createUserByIDQueryOptions(user.id), createListRolesQueryOptions()],
  ],
  ["new", NewRoute, [createListRolesQueryOptions()]],
] as const;

it.each(cases)(
  "%s starts exactly its critical query set in parallel and waits for all",
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
      params: { id: user.id },
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
          params: { id: user.id },
        }),
      ).rejects.toBe(error);
    }
  },
);

it("fetches users and roles once across index loading and suspense rendering", async () => {
  // Use production query defaults, so a stale-time regression causes a duplicate request.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const requests = recordApiRequests();
  await (IndexRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: user.id },
  });
  const Component = IndexRoute.options.component as ComponentType;
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <PageProvider>
          <Suspense fallback="Loading">
            <Component />
          </Suspense>
        </PageProvider>
      </QueryClientProvider>,
    );
  });
  expect(await screen.findByText(user.displayName)).toBeVisible();
  expect(
    screen.getByText(SEED_ROLES.find((role) => user.roleIds.includes(role.id))!.name),
  ).toBeVisible();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect([...requests].sort()).toEqual(["GET /api/roles", "GET /api/users"]);
});

it("nested edit renders parent-loaded user and roles without a duplicate loader", async () => {
  expect(EditRoute.options.loader).toBeUndefined();
  // Entity queries retain their default stale policy; fresh seeded data isolates parent reuse.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const requests = recordApiRequests();
  await (DetailRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: user.id },
  });
  const Component = EditRoute.options.component as ComponentType;
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <PageProvider>
          <Suspense fallback="Loading">
            <Component />
          </Suspense>
        </PageProvider>
      </QueryClientProvider>,
    );
  });
  expect(await screen.findByDisplayValue(user.displayName)).toBeVisible();
  expect(screen.getByDisplayValue(user.email)).toBeVisible();
  expect(client.isFetching()).toBe(0);
  expect([...requests].sort()).toEqual(["GET /api/roles", `GET /api/users/${user.id}`]);
});
