import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { getUserByID } from "@/features/users/api/users.ts";
import { UsersPage } from "@/features/users/pages/users-page.tsx";
import { ROLE_FIXTURES, STORY_USERS } from "@/test/fixtures.ts";

import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/features/users/hooks/use-user-lifecycle.ts", () => ({ useUserLifecycle: () => ({}) }));
vi.mock("@/features/users/api/users.ts", () => ({ getUserByID: vi.fn(), listUsers: vi.fn() }));
vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: ({ children }: { children: ReactNode }) => (
    <section aria-label="User preview">{children}</section>
  ),
}));
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("does not fetch a preview until selected and keeps the table usable after preview failure", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(["users"], [STORY_USERS[1]]);
  client.setQueryData(["roles"], ROLE_FIXTURES);
  vi.mocked(getUserByID).mockRejectedValue(new Error("Preview request failed"));
  const { rerender } = render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
  expect(screen.getByText(STORY_USERS[1].displayName)).toBeVisible();
  expect(getUserByID).not.toHaveBeenCalled();
  rerender(
    <QueryClientProvider client={client}>
      <UsersPage selected={STORY_USERS[1].id} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Unable to load user")).toBeVisible();
  expect(screen.getByText("Preview request failed")).toBeVisible();
  expect(screen.getByText(STORY_USERS[1].displayName)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "New user" }));
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/users/new" });
  expect(getUserByID).toHaveBeenCalledExactlyOnceWith(STORY_USERS[1].id);
});
