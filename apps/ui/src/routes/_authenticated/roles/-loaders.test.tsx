import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createListRolesQueryOptions, createRoleByIDQueryOptions } from "@/features/roles";
import { getRoleByID, listRoles } from "@/features/roles/api/roles.ts";
import { EditRolePage } from "@/features/roles/pages/edit-role-page.tsx";
import { Route as EditRoute } from "@/routes/_authenticated/roles/$id.edit.tsx";
import { Route as DetailRoute } from "@/routes/_authenticated/roles/$id.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/roles/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/roles/new.tsx";
import { CUSTOM_AUDITOR_ROLE } from "@/test/fixtures.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/features/roles/hooks/use-role-lifecycle.ts", () => ({
  useRoleLifecycle: () => ({}),
}));
vi.mock("@/features/roles/api/roles.ts", () => ({
  getRoleByID: vi.fn(),
  listRoles: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
  deps?: { selected: string };
}) => Promise<unknown>;
const role = CUSTOM_AUDITOR_ROLE;

it.each([
  ["index", IndexRoute],
  ["new", NewRoute],
  ["edit child", EditRoute],
])("%s ensures only the role list", async (_name, route) => {
  const client = new QueryClient();
  const ensure = vi.spyOn(client, "ensureQueryData").mockResolvedValue([]);
  await (route.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: role.id },
    deps: { selected: role.id },
  });
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(ensure.mock.calls[0][0]).toEqual({
    ...createListRolesQueryOptions(),
    queryFn: expect.any(Function),
  });
});

it("ensures exactly the requested role and lets nested edit reuse its parent cache", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  vi.mocked(getRoleByID).mockResolvedValue(role);
  vi.mocked(listRoles).mockResolvedValue([role]);
  const ensure = vi.spyOn(client, "ensureQueryData");
  const args = { context: { queryClient: client }, params: { id: role.id } };
  await expect((DetailRoute.options.loader as unknown as Loader)(args)).resolves.toEqual(role);
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(ensure.mock.calls[0][0]).toEqual({
    ...createRoleByIDQueryOptions(role.id),
    queryFn: expect.any(Function),
  });
  await (EditRoute.options.loader as unknown as Loader)(args);
  expect(ensure).toHaveBeenCalledTimes(2);
  expect(ensure.mock.calls[1][0]).toEqual({
    ...createListRolesQueryOptions(),
    queryFn: expect.any(Function),
  });
  render(
    <QueryClientProvider client={client}>
      <EditRolePage roleId={role.id} />
    </QueryClientProvider>,
  );
  expect(screen.getByDisplayValue(role.name)).toBeVisible();
  expect(client.isFetching()).toBe(0);
  expect(getRoleByID).toHaveBeenCalledExactlyOnceWith(role.id);
  expect(listRoles).toHaveBeenCalledTimes(1);
});

it.each([IndexRoute, NewRoute, DetailRoute, EditRoute])(
  "propagates critical loader failures to the router",
  async (route) => {
    const client = new QueryClient();
    const error = new Error("Role request failed");
    vi.spyOn(client, "ensureQueryData").mockRejectedValue(error);
    await expect(
      (route.options.loader as unknown as Loader)({
        context: { queryClient: client },
        params: { id: role.id },
      }),
    ).rejects.toBe(error);
  },
);
