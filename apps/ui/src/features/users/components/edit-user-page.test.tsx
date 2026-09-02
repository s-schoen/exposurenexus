import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditUserPage } from "@/features/users/components/edit-user-page.tsx";

import type { UserFormValues } from "@/components/user-form.tsx";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

interface QueryState<TData> {
  data?: TData;
  error?: Error;
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
    roleIds: ["6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01"],
  };
  const roles: Array<Role> = [
    {
      id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
      name: "viewer",
      permissions: [],
    },
    {
      id: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
      name: "editor",
      permissions: [],
    },
  ];
  const submitValues: UserFormValues = {
    displayName: "  Alice Changed  ",
    username: "ignored",
    email: "  alice.changed@example.com  ",
    enabled: false,
    password: "",
    roleIds: ["5d5f5c6f-a9d6-4d49-9f4d-9462b873a902"],
  };
  const rolesQuery: QueryState<Array<Role>> = {
    data: roles,
    isPending: false,
    isSuccess: true,
  };
  const userQuery: QueryState<UserProfile> = {
    data: user,
    isPending: false,
    isSuccess: true,
  };

  return {
    navigate: vi.fn(),
    roles,
    rolesQuery,
    submitValues,
    updateUser: vi.fn(),
    usePageMeta: vi.fn(),
    user,
    userQuery,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "roles") {
      return mocks.rolesQuery;
    }

    return mocks.userQuery;
  },
}));

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"],
  }),
}));

vi.mock("@/api/user.ts", () => ({
  createUserByIDQueryOptions: (id: string) => ({
    queryKey: ["users", id],
  }),
}));

vi.mock("@/hooks/use-user-lifecycle.ts", () => ({
  useUserLifecycle: () => ({
    updateUser: mocks.updateUser,
  }),
}));

vi.mock("@/components/user-form.tsx", async (importOriginal) => {
  const actual = await importOriginal();

  return Object.assign({}, actual, {
    UserForm: ({
      defaultValues,
      mode,
      onCancel,
      onSubmit,
      roles,
    }: {
      defaultValues?: Partial<UserFormValues>;
      mode: string;
      onCancel: () => void;
      onSubmit: (values: UserFormValues) => Promise<void> | void;
      roles: Array<Role>;
    }) => (
      <div>
        <div data-testid="mode">{mode}</div>
        <div data-testid="roles">{roles.map((role) => role.name).join(",")}</div>
        <div data-testid="default-values">{JSON.stringify(defaultValues)}</div>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
        <button type="button" onClick={() => void onSubmit(mocks.submitValues)}>
          submit
        </button>
      </div>
    ),
  });
});

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

function resetQueries() {
  mocks.userQuery = {
    data: mocks.user,
    isPending: false,
    isSuccess: true,
  };
  mocks.rolesQuery = {
    data: mocks.roles,
    isPending: false,
    isSuccess: true,
  };
}

describe("EditUserPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    resetQueries();
    mocks.updateUser.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the loading state while the user is pending", () => {
    mocks.userQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<EditUserPage userId={userId} />);

    expect(screen.getAllByText("Loading user details and roles.").length).toBeGreaterThan(0);
  });

  it("renders the loading state while roles are pending", () => {
    mocks.rolesQuery = {
      isPending: true,
      isSuccess: false,
    };

    render(<EditUserPage userId={userId} />);

    expect(screen.getAllByText("Loading user details and roles.").length).toBeGreaterThan(0);
  });

  it("renders the user loading error state", () => {
    mocks.userQuery = {
      error: new Error("User request failed"),
      isPending: false,
      isSuccess: false,
    };

    render(<EditUserPage userId={userId} />);

    expect(screen.getByText("Unable to load edit form")).toBeTruthy();
    expect(screen.getByText("User request failed")).toBeTruthy();
  });

  it("renders the roles loading error state", () => {
    mocks.rolesQuery = {
      error: new Error("Roles request failed"),
      isPending: false,
      isSuccess: false,
    };

    render(<EditUserPage userId={userId} />);

    expect(screen.getByText("Unable to load edit form")).toBeTruthy();
    expect(screen.getByText("Roles request failed")).toBeTruthy();
  });

  it("passes default form values from the loaded user", () => {
    render(<EditUserPage userId={userId} />);

    expect(screen.getByTestId("mode").textContent).toBe("edit");
    expect(screen.getByTestId("roles").textContent).toBe("viewer,editor");
    expect(JSON.parse(screen.getByTestId("default-values").textContent)).toEqual({
      displayName: "Alice Example",
      email: "alice@example.com",
      enabled: true,
      password: "",
      roleIds: [builtInRoleIds.viewer],
      username: "alice",
    });
  });

  it("updates a user through the lifecycle hook and navigates back to detail", async () => {
    mocks.updateUser.mockResolvedValueOnce({
      ...mocks.user,
      displayName: "Alice Changed",
    });

    render(<EditUserPage userId={userId} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith(userId, {
        displayName: "Alice Changed",
        email: "alice.changed@example.com",
        enabled: false,
        roleIds: [builtInRoleIds.editor],
      });
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users/$id",
      params: {
        id: userId,
      },
    });
  });

  it("does not navigate when the lifecycle hook handles update failures", async () => {
    mocks.updateUser.mockResolvedValueOnce(null);

    render(<EditUserPage userId={userId} />);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalled();
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("cancels back to the user detail page", async () => {
    render(<EditUserPage userId={userId} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/users/$id",
        params: {
          id: userId,
        },
      });
    });
  });
});
