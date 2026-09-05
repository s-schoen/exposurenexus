import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

interface QueryState<TData> {
  data?: TData;
  isPending: boolean;
  isSuccess: boolean;
}

const userId = "1f9c36d2-1355-49d1-8464-b01ce955d88f";

const mocks = vi.hoisted(() => {
  const user: UserProfile = {
    id: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    roleIds: [],
  };
  const userQuery: QueryState<UserProfile> = {
    data: user,
    isPending: false,
    isSuccess: true,
  };

  return {
    navigate: vi.fn(),
    user,
    userQuery,
    usePageMeta: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: (options: { queryKey: Array<string> }) =>
    options.queryKey[0] === "roles" ? { data: [] } : mocks.userQuery,
}));

vi.mock("@/features/users/queries/users.ts", () => ({
  createUserByIDQueryOptions: (id: string) => ({
    queryKey: ["users", id],
  }),
}));

vi.mock("@/features/roles", () => ({
  createListRolesQueryOptions: () => ({ queryKey: ["roles"] }),
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/features/users/components/user-detail-content.tsx", () => ({
  UserDetailContent: ({ titleAction, user }: { titleAction?: ReactNode; user: UserProfile }) => (
    <div>
      {titleAction}
      <div>User detail for {user.id}</div>
    </div>
  ),
}));

describe("UserDetailPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.userQuery = {
      data: mocks.user,
      isPending: false,
      isSuccess: true,
    };
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("uses loaded user data for page metadata and renders the back link", async () => {
    const { UserDetailPage } = await import("@/features/users/pages/user-detail-page.tsx");

    render(<UserDetailPage userId={userId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Alice Example",
      description: "Review account identity fields, status, and role assignments.",
      actions: [
        expect.objectContaining({
          label: "Edit user",
        }),
      ],
    });
    expect(screen.getByRole("link", { name: /back to users/i })).toHaveAttribute("href", "/users");
    expect(screen.getByText(`User detail for ${userId}`)).toBeVisible();
  });

  it("navigates to edit from the page action", async () => {
    const { UserDetailPage } = await import("@/features/users/pages/user-detail-page.tsx");

    render(<UserDetailPage userId={userId} />);

    const meta = mocks.usePageMeta.mock.calls[0][0];
    meta.actions[0].onClick();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users/$id/edit",
      params: { id: userId },
    });
  });
});
