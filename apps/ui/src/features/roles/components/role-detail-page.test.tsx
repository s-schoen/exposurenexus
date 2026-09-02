import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { ReactNode } from "react";

interface QueryState<TData> {
  data?: TData;
  isPending: boolean;
  isSuccess: boolean;
}

const roleId = "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830";

const mocks = vi.hoisted(() => {
  const role: Role = {
    id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
    name: "security-analyst",
    permissions: [
      { resource: "asset", verb: "read" },
      { resource: "asset", verb: "write" },
    ],
  } as Role;
  const roleQuery: QueryState<Role> = {
    data: role,
    isPending: false,
    isSuccess: true,
  };

  return {
    navigate: vi.fn(),
    role,
    roleQuery,
    usePageMeta: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className} href="/roles">
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.roleQuery,
}));

vi.mock("@/api/role.ts", () => ({
  createRoleByIDQueryOptions: (id: string) => ({
    queryKey: ["roles", id],
  }),
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/components/role-detail-content.tsx", () => ({
  RoleDetailContent: ({
    roleId: renderedRoleId,
    titleAction,
  }: {
    roleId: string;
    titleAction?: ReactNode;
  }) => (
    <div>
      {titleAction}
      <div>Detail for {renderedRoleId}</div>
    </div>
  ),
}));

describe("RoleDetailPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.usePageMeta.mockReset();
    mocks.roleQuery = {
      data: mocks.role,
      isPending: false,
      isSuccess: true,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("adds an edit action for custom roles", async () => {
    const { RoleDetailPage } = await import("@/features/roles/components/role-detail-page.tsx");

    render(<RoleDetailPage roleId={roleId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "security-analyst",
      description:
        "Inspect the selected role and review how its permissions map to protected resources.",
      actions: [
        expect.objectContaining({
          label: "Edit role",
        }),
      ],
    });

    const action = mocks.usePageMeta.mock.calls[0]?.[0].actions[0];
    action.onClick();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles/$id/edit",
      params: { id: roleId },
    });
    expect(screen.getByRole("link", { name: /back to roles/i })).toBeTruthy();
    expect(screen.getByText(`Detail for ${roleId}`)).toBeTruthy();
  });

  it("does not add an edit action for built-in roles", async () => {
    const { RoleDetailPage } = await import("@/features/roles/components/role-detail-page.tsx");
    mocks.roleQuery = {
      data: {
        id: builtInRoleIds.viewer,
        name: "viewer",
        permissions: [{ resource: PermissionResource.Asset, verb: PermissionVerb.Read }],
      },
      isPending: false,
      isSuccess: true,
    };

    render(<RoleDetailPage roleId={builtInRoleIds.viewer} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "viewer",
      description:
        "Inspect the selected role and review how its permissions map to protected resources.",
      actions: [],
    });
  });

  it("uses fallback metadata before role data is available", async () => {
    const { RoleDetailPage } = await import("@/features/roles/components/role-detail-page.tsx");
    mocks.roleQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<RoleDetailPage roleId={roleId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Role",
      description:
        "Inspect the selected role and review how its permissions map to protected resources.",
      actions: [],
    });
  });
});
