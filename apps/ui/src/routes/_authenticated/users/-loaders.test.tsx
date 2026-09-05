import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createListRolesQueryOptions } from "@/features/roles";
import { createListUsersQueryOptions, createUserByIDQueryOptions } from "@/features/users";
import { Route as EditRoute } from "@/routes/_authenticated/users/$id.edit.tsx";
import { Route as DetailRoute } from "@/routes/_authenticated/users/$id.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/users/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/users/new.tsx";
import { ROLE_FIXTURES, STORY_USERS } from "@/test/fixtures.ts";

import type { ComponentType } from "react";

const listRoles = vi.fn<(...args: Array<string>) => Promise<unknown>>();
const getUserByID = vi.fn<(...args: Array<string>) => Promise<unknown>>();
const listUsers = vi.fn<(...args: Array<string>) => Promise<unknown>>();

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (input === "/api/roles") return Response.json({ data: { items: await listRoles() } });
      if (input.startsWith("/api/users/"))
        return Response.json({ data: await getUserByID(input.split("/").at(-1)!) });
      if (input === "/api/users") return Response.json({ data: { items: await listUsers() } });
      throw new Error(`Unexpected request: ${input}`);
    }),
  );
});

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useParams: () => ({ id: STORY_USERS[1].id }),
    useSearch: () => ({}),
  }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/components/detail-preview-dialog.tsx", () => ({ DetailPreviewDialog: () => null }));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
  deps?: { selected: string };
}) => Promise<unknown>;

const user = STORY_USERS[1];
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
  vi.mocked(listUsers).mockResolvedValue([user]);
  vi.mocked(listRoles).mockResolvedValue(ROLE_FIXTURES);
  await (IndexRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: user.id },
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
  expect(await screen.findByText(user.displayName)).toBeVisible();
  expect(
    screen.getByText(ROLE_FIXTURES.find((role) => user.roleIds.includes(role.id))!.name),
  ).toBeVisible();
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(listUsers).toHaveBeenCalledTimes(1);
  expect(listRoles).toHaveBeenCalledTimes(1);
  expect(getUserByID).not.toHaveBeenCalled();
});

it("nested edit renders parent-loaded user and roles without a duplicate loader", async () => {
  expect(EditRoute.options.loader).toBeUndefined();
  // Entity queries retain their default stale policy; fresh seeded data isolates parent reuse.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  vi.mocked(getUserByID).mockResolvedValue(user);
  vi.mocked(listRoles).mockResolvedValue(ROLE_FIXTURES);
  await (DetailRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: user.id },
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
  expect(await screen.findByDisplayValue(user.displayName)).toBeVisible();
  expect(screen.getByDisplayValue(user.email)).toBeVisible();
  expect(client.isFetching()).toBe(0);
  expect(getUserByID).toHaveBeenCalledExactlyOnceWith(user.id);
  expect(listRoles).toHaveBeenCalledTimes(1);
  expect(listUsers).not.toHaveBeenCalled();
});
