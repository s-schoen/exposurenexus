import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { BuiltInRoleName, builtInRoleIds } from "@exposurenexus/types/model/rbac"
import type { ReactNode } from "react"
import type { Role } from "@exposurenexus/types/model/rbac"
import type { UserProfile } from "@exposurenexus/types/model/user"

interface QueryState<TData> {
  data?: TData
  error?: Error
  isPending: boolean
  isSuccess: boolean
}

const mocks = vi.hoisted(() => {
  const user: UserProfile = {
    id: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    roleIds: ["6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01"]
  }
  const roles: Array<Role> = [
    {
      id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
      name: "viewer",
      permissions: []
    },
    {
      id: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
      name: "editor",
      permissions: []
    }
  ]
  const rolesQuery: QueryState<Array<Role>> = {
    data: roles,
    isPending: false,
    isSuccess: true
  }
  const userQuery: QueryState<UserProfile> = {
    data: user,
    isPending: false,
    isSuccess: true
  }

  return {
    roles,
    rolesQuery,
    user,
    userQuery
  }
})

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "roles") {
      return mocks.rolesQuery
    }

    return mocks.userQuery
  }
}))

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"]
  })
}))

vi.mock("@/api/user.ts", () => ({
  createUserByIDQueryOptions: (id: string) => ({
    queryKey: ["users", id]
  })
}))

function renderUserDetail(
  UserDetailContent: (props: {
    userId: string
    titleAction?: ReactNode
  }) => ReactNode
) {
  return render(
    <UserDetailContent
      userId="1f9c36d2-1355-49d1-8464-b01ce955d88f"
      titleAction={<button type="button">Edit user</button>}
    />
  )
}

describe("UserDetailContent", () => {
  beforeEach(() => {
    mocks.userQuery = {
      data: mocks.user,
      isPending: false,
      isSuccess: true
    }
    mocks.rolesQuery = {
      data: mocks.roles,
      isPending: false,
      isSuccess: true
    }
  })

  afterEach(() => {
    cleanup()
  })

  it("renders a placeholder while the user is pending", async () => {
    const { UserDetailContent } =
      await import("@/components/user-detail-content.tsx")
    mocks.userQuery = {
      isPending: true,
      isSuccess: false
    }

    renderUserDetail(UserDetailContent)

    expect(screen.getByText("User details")).toBeTruthy()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })

  it("renders the user error state when no data is returned", async () => {
    const { UserDetailContent } =
      await import("@/components/user-detail-content.tsx")
    mocks.userQuery = {
      error: new Error("User request failed"),
      isPending: false,
      isSuccess: false
    }

    renderUserDetail(UserDetailContent)

    expect(screen.getByText("Unable to load user")).toBeTruthy()
    expect(screen.getByText("User request failed")).toBeTruthy()
  })

  it("renders enabled and disabled status badges", async () => {
    const { UserDetailContent } =
      await import("@/components/user-detail-content.tsx")
    const { rerender } = render(<UserDetailContent userId={mocks.user.id} />)

    expect(screen.getAllByText("Enabled").length).toBeGreaterThan(0)

    mocks.userQuery = {
      data: {
        ...mocks.user,
        enabled: false
      },
      isPending: false,
      isSuccess: true
    }
    rerender(<UserDetailContent userId={mocks.user.id} />)

    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0)
  })

  it("renders no-role and loading-role fallbacks", async () => {
    const { UserDetailContent } =
      await import("@/components/user-detail-content.tsx")
    mocks.userQuery = {
      data: {
        ...mocks.user,
        roleIds: []
      },
      isPending: false,
      isSuccess: true
    }
    const { rerender } = render(<UserDetailContent userId={mocks.user.id} />)

    expect(screen.getAllByText("No roles").length).toBeGreaterThan(0)

    mocks.userQuery = {
      data: {
        ...mocks.user,
        roleIds: [builtInRoleIds.viewer]
      },
      isPending: false,
      isSuccess: true
    }
    mocks.rolesQuery = {
      isPending: true,
      isSuccess: false
    }
    rerender(<UserDetailContent userId={mocks.user.id} />)

    expect(screen.getAllByText("Loading roles...").length).toBeGreaterThan(0)
  })

  it("renders unresolved role counts when role data is unavailable", async () => {
    const { UserDetailContent } =
      await import("@/components/user-detail-content.tsx")
    mocks.userQuery = {
      data: {
        ...mocks.user,
        roleIds: [builtInRoleIds.viewer, builtInRoleIds.editor]
      },
      isPending: false,
      isSuccess: true
    }
    mocks.rolesQuery = {
      error: new Error("Roles request failed"),
      isPending: false,
      isSuccess: false
    }

    render(<UserDetailContent userId={mocks.user.id} />)

    expect(screen.getAllByText("2 roles assigned").length).toBeGreaterThan(0)
  })

  it("renders resolved role badges and unknown role counts", async () => {
    const { UserDetailContent } =
      await import("@/components/user-detail-content.tsx")
    mocks.userQuery = {
      data: {
        ...mocks.user,
        roleIds: [
          builtInRoleIds.viewer,
          builtInRoleIds.editor,
          "a1ed0f1c-28af-40f4-b08e-9fe9ab4a3223"
        ]
      },
      isPending: false,
      isSuccess: true
    }
    mocks.rolesQuery = {
      data: [
        {
          id: builtInRoleIds.viewer,
          name: BuiltInRoleName.Viewer,
          permissions: []
        },
        {
          id: builtInRoleIds.editor,
          name: BuiltInRoleName.Editor,
          permissions: []
        }
      ],
      isPending: false,
      isSuccess: true
    }

    render(<UserDetailContent userId={mocks.user.id} />)

    expect(screen.getAllByText("viewer").length).toBeGreaterThan(0)
    expect(screen.getAllByText("editor").length).toBeGreaterThan(0)
    expect(screen.getAllByText("+1 unknown").length).toBeGreaterThan(0)
  })
})
