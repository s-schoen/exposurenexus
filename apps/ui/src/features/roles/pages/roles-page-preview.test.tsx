import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { getRoleByID } from "@/features/roles/api/roles.ts";
import { RolesPage } from "@/features/roles/pages/roles-page.tsx";
import { CUSTOM_AUDITOR_ROLE } from "@/test/fixtures.ts";

import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/features/roles/hooks/use-role-lifecycle.ts", () => ({ useRoleLifecycle: () => ({}) }));
vi.mock("@/features/roles/api/roles.ts", () => ({ getRoleByID: vi.fn(), listRoles: vi.fn() }));
vi.mock("@/features/roles/components/role-table", () => ({
  RoleTable: ({
    query,
    onCreateRole,
  }: {
    query: { data: Array<{ name: string }> };
    onCreateRole: () => void;
  }) => (
    <div>
      <table>
        <tbody>
          {query.data.map((role) => (
            <tr key={role.name}>
              <td>{role.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onCreateRole}>New role</button>
    </div>
  ),
}));
vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: ({ children }: { children: ReactNode }) => (
    <section aria-label="Role preview">{children}</section>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("does not fetch a preview until selected and keeps the table usable after preview failure", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["roles"], [CUSTOM_AUDITOR_ROLE]);
  vi.mocked(getRoleByID).mockRejectedValue(new Error("Preview request failed"));
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <RolesPage />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("cell", { name: CUSTOM_AUDITOR_ROLE.name })).toBeVisible();
  expect(getRoleByID).not.toHaveBeenCalled();
  rerender(
    <QueryClientProvider client={client}>
      <RolesPage selected={CUSTOM_AUDITOR_ROLE.id} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Unable to load role")).toBeVisible();
  expect(screen.getByText("Preview request failed")).toBeVisible();
  expect(screen.getByRole("cell", { name: CUSTOM_AUDITOR_ROLE.name })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "New role" }));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/roles/new" });
  expect(getRoleByID).toHaveBeenCalledExactlyOnceWith(CUSTOM_AUDITOR_ROLE.id);
});
