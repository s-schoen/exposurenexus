import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { builtInRoleIds } from "@exposurenexus/types/model/rbac"
import type { Role } from "@exposurenexus/types/model/rbac"
import type { UserFormValues } from "@/components/user-form.tsx"
import { CreateUserRouteComponent } from "@/routes/_authenticated/users/-new-route-component.tsx"

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
      permissions: []
    },
    {
      id: "5d5f5c6f-a9d6-4d49-9f4d-9462b873a902",
      name: "editor",
      permissions: []
    }
  ]
  const submitValues: UserFormValues = {
    displayName: "  Alice Example  ",
    username: "  alice  ",
    email: "  alice@example.com  ",
    enabled: true,
    password: "correct horse battery staple",
    roleIds: ["5d5f5c6f-a9d6-4d49-9f4d-9462b873a902"]
  }
  const rolesQuery: QueryState<Array<Role>> = {
    data: roles,
    isPending: false,
    isSuccess: true
  }

  return {
    createUser: vi.fn(),
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

vi.mock("@/hooks/use-user-lifecycle.ts", () => ({
  useUserLifecycle: () => ({
    createUser: mocks.createUser
  })
}))

vi.mock("@/components/user-form.tsx", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    UserForm: ({
      defaultValues,
      mode,
      onCancel,
      onSubmit,
      roles
    }: {
      defaultValues?: Partial<UserFormValues>
      mode: string
      onCancel: () => void
      onSubmit: (values: UserFormValues) => Promise<void> | void
      roles: Array<Role>
    }) => (
      <div>
        <div data-testid="mode">{mode}</div>
        <div data-testid="roles">
          {roles.map((role) => role.name).join(",")}
        </div>
        <div data-testid="default-values">{JSON.stringify(defaultValues)}</div>
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

describe("CreateUserRouteComponent", () => {
  beforeEach(() => {
    mocks.createUser.mockReset()
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

    render(<CreateUserRouteComponent />)

    expect(
      screen.getAllByText("Loading available roles.").length
    ).toBeGreaterThan(0)
  })

  it("renders the role loading error state", () => {
    mocks.rolesQuery = {
      error: new Error("Roles request failed"),
      isPending: false,
      isSuccess: false
    }

    render(<CreateUserRouteComponent />)

    expect(screen.getByText("Unable to load roles")).toBeTruthy()
    expect(screen.getByText("Roles request failed")).toBeTruthy()
  })

  it("uses the viewer role as the create form default", () => {
    render(<CreateUserRouteComponent />)

    expect(screen.getByTestId("mode").textContent).toBe("create")
    expect(screen.getByTestId("roles").textContent).toBe("viewer,editor")
    expect(screen.getByTestId("default-values").textContent).toBe(
      JSON.stringify({ roleIds: [builtInRoleIds.viewer] })
    )
  })

  it("creates a user through the lifecycle hook and navigates back to the user list", async () => {
    mocks.createUser.mockResolvedValueOnce({
      id: "1f9c36d2-1355-49d1-8464-b01ce955d88f"
    })

    render(<CreateUserRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.createUser).toHaveBeenCalledWith({
        displayName: "Alice Example",
        email: "alice@example.com",
        enabled: true,
        password: "correct horse battery staple",
        roleIds: [builtInRoleIds.editor],
        username: "alice"
      })
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users",
      search: { selected: undefined }
    })
  })

  it("does not navigate when the lifecycle hook handles create failures", async () => {
    mocks.createUser.mockResolvedValueOnce(null)

    render(<CreateUserRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.createUser).toHaveBeenCalled()
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("cancels back to the user list", async () => {
    render(<CreateUserRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/users",
        search: { selected: undefined }
      })
    })
  })
})
