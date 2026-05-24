import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import {
  PermissionResource,
  PermissionVerb
} from "@exposurenexus/types/model/rbac"
import type { Role } from "@exposurenexus/types/model/rbac"
import type { RoleFormValues } from "@/components/role-form.tsx"
import { CreateRoleRouteComponent } from "@/routes/_authenticated/roles/-new-route-component.tsx"

interface QueryState<TData> {
  data?: TData
  error?: Error
  isPending: boolean
  isSuccess: boolean
}

const mocks = vi.hoisted(() => {
  const roles: Array<Role> = [
    {
      id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
      name: "viewer",
      permissions: [
        { resource: "asset", verb: "read" },
        { resource: "finding", verb: "read" }
      ]
    },
    {
      id: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
      name: "editor",
      permissions: [
        { resource: "asset", verb: "read" },
        { resource: "asset", verb: "write" },
        { resource: "finding", verb: "read" }
      ]
    }
  ] as Array<Role>
  const submitValues: RoleFormValues = {
    name: "  security-analyst  ",
    permissions: [
      { resource: "asset", verb: "read" },
      { resource: "asset", verb: "read" },
      { resource: "asset", verb: "write" }
    ]
  } as RoleFormValues
  const rolesQuery: QueryState<Array<Role>> = {
    data: roles,
    isPending: false,
    isSuccess: true
  }

  return {
    createRole: vi.fn(),
    navigate: vi.fn(),
    roles,
    rolesQuery,
    submitValues,
    usePageMeta: vi.fn()
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.rolesQuery
}))

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"]
  })
}))

vi.mock("@/hooks/use-role-lifecycle.ts", () => ({
  useRoleLifecycle: () => ({
    createRole: mocks.createRole
  })
}))

vi.mock("@/components/role-form.tsx", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    RoleForm: ({
      availablePermissions,
      mode,
      onCancel,
      onSubmit
    }: {
      availablePermissions: Array<RoleFormValues["permissions"][number]>
      mode: string
      onCancel: () => void
      onSubmit: (values: RoleFormValues) => Promise<void> | void
    }) => (
      <div>
        <div data-testid="mode">{mode}</div>
        <div data-testid="permission-count">{availablePermissions.length}</div>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
        <button type="button" onClick={() => void onSubmit(mocks.submitValues)}>
          submit
        </button>
      </div>
    )
  })
})

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

describe("CreateRoleRouteComponent", () => {
  beforeEach(() => {
    mocks.createRole.mockReset()
    mocks.navigate.mockReset()
    mocks.rolesQuery = {
      data: mocks.roles,
      isPending: false,
      isSuccess: true
    }
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders the loading state while roles are pending", () => {
    mocks.rolesQuery = {
      isPending: true,
      isSuccess: false
    }

    render(<CreateRoleRouteComponent />)

    expect(
      screen.getAllByText("Loading available permissions.").length
    ).toBeGreaterThan(0)
  })

  it("renders the role loading error state", () => {
    mocks.rolesQuery = {
      error: new Error("Roles request failed"),
      isPending: false,
      isSuccess: false
    }

    render(<CreateRoleRouteComponent />)

    expect(screen.getByText("Unable to load permissions")).toBeTruthy()
    expect(screen.getByText("Roles request failed")).toBeTruthy()
  })

  it("renders the role form in create mode", () => {
    render(<CreateRoleRouteComponent />)

    expect(screen.getByTestId("mode").textContent).toBe("create")
    expect(Number(screen.getByTestId("permission-count").textContent)).toBe(3)
  })

  it("creates a role through the lifecycle hook and navigates to the created role", async () => {
    mocks.createRole.mockResolvedValueOnce({
      id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830",
      name: "security-analyst",
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read }
      ]
    })

    render(<CreateRoleRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.createRole).toHaveBeenCalledWith({
        name: "security-analyst",
        permissions: [
          { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
          { resource: PermissionResource.Asset, verb: PermissionVerb.Write }
        ]
      })
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/roles/$id",
      params: { id: "9f5c0b37-7d1d-42ce-9e1a-51906b9e6830" }
    })
  })

  it("does not navigate when the lifecycle handles create failures", async () => {
    mocks.createRole.mockResolvedValueOnce(null)

    render(<CreateRoleRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.createRole).toHaveBeenCalled()
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("cancels back to the roles list", async () => {
    render(<CreateRoleRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/roles",
        search: expect.any(Function)
      })
    })
    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(search({ filter: "security", kind: "custom", selected: "role-1" })).toEqual({
      filter: "security",
      kind: "custom",
      selected: undefined
    })
  })
})
