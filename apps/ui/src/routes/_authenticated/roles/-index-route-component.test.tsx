import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import type { Role } from "@exposurenexus/types/model/rbac"

const mocks = vi.hoisted(() => {
  const builtInRole = {
    id: "6d0d8a47-0f6d-47b6-9b9a-d8f0d3f4dd01",
    name: "viewer",
    permissions: []
  }
  const customRole = {
    id: "8f74bc56-0ac3-47ef-b7e6-8df2c42fb3c0",
    name: "security-auditor",
    permissions: []
  }
  const failingRole = {
    id: "d4db4a45-9082-4280-9a55-4316963822f7",
    name: "failing-role",
    permissions: []
  }

  return {
    builtInRole,
    confirmDialogCall: vi.fn(),
    customRole,
    deleteRole: vi.fn(),
    dialogProps: undefined as undefined | Record<string, unknown>,
    failingRole,
    invalidateQueries: vi.fn(),
    navigate: vi.fn(),
    setFilter: vi.fn(),
    setKindFilter: vi.fn(),
    toastActionError: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    usePageMeta: vi.fn(),
    useQuery: vi.fn()
  }
})

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries
  })
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("nuqs", () => ({
  parseAsArrayOf: () => ({
    withDefault: () => ({})
  }),
  parseAsString: {},
  useQueryState: (key: string) =>
    key === "kind" ? [[], mocks.setKindFilter] : [null, mocks.setFilter]
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess
  }
}))

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"]
  }),
  deleteRole: mocks.deleteRole
}))

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDialogCall
  }
}))

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: (props: {
    children?: ReactNode
    description: string
    fullPageHref?: string
    onClose: () => void
    selectedId?: string
    title: string
  }) => {
    mocks.dialogProps = props

    return (
      <section>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div data-testid="selected-role">{props.selectedId}</div>
        <div data-testid="full-page-href">{props.fullPageHref}</div>
        <button type="button" onClick={props.onClose}>
          close dialog
        </button>
        {props.children}
      </section>
    )
  }
}))

vi.mock("@/components/role-detail-content.tsx", () => ({
  RoleDetailContent: ({ roleId }: { roleId: string }) => (
    <div>Detail for role {roleId}</div>
  )
}))

vi.mock("@/components/role-table", () => ({
  RoleTable: ({
    onCreateRole,
    onDeleteRoles,
    selectedRoleId
  }: {
    onCreateRole?: () => void
    onDeleteRoles?: (roles: Array<Role>) => Promise<void>
    selectedRoleId?: string
  }) => (
    <div>
      <div data-testid="table-selected-role">{selectedRoleId}</div>
      <button type="button" onClick={onCreateRole}>
        New role
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteRoles?.([mocks.builtInRole])
        }}
      >
        delete built-in
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteRoles?.([mocks.builtInRole, mocks.customRole])
        }}
      >
        delete mixed
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteRoles?.([mocks.failingRole])
        }}
      >
        delete failing
      </button>
    </div>
  )
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/lib/action-error-toast.ts", () => ({
  toastActionError: mocks.toastActionError
}))

describe("RoleIndexRouteComponent", () => {
  beforeEach(() => {
    mocks.confirmDialogCall.mockReset()
    mocks.confirmDialogCall.mockResolvedValue(true)
    mocks.deleteRole.mockReset()
    mocks.deleteRole.mockResolvedValue(mocks.customRole)
    mocks.dialogProps = undefined
    mocks.invalidateQueries.mockReset()
    mocks.navigate.mockReset()
    mocks.setFilter.mockReset()
    mocks.setKindFilter.mockReset()
    mocks.toastActionError.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.usePageMeta.mockReset()
    mocks.useQuery.mockReset()
    mocks.useQuery.mockReturnValue({
      data: [mocks.builtInRole, mocks.customRole],
      isFetching: false,
      isPending: false,
      refetch: vi.fn()
    })
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("navigates to the create route from the table toolbar", async () => {
    const { RoleIndexRouteComponent } = await import(
      "@/routes/_authenticated/roles/-index-route-component.tsx"
    )

    render(<RoleIndexRouteComponent />)

    fireEvent.click(screen.getByRole("button", { name: /^new role$/i }))

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/roles/new" })
  })

  it("skips built-in-only delete selections without calling the API", async () => {
    const { RoleIndexRouteComponent } = await import(
      "@/routes/_authenticated/roles/-index-route-component.tsx"
    )

    render(<RoleIndexRouteComponent />)

    fireEvent.click(screen.getByRole("button", { name: /delete built-in/i }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Built-in roles cannot be deleted"
      )
    })
    expect(mocks.confirmDialogCall).not.toHaveBeenCalled()
    expect(mocks.deleteRole).not.toHaveBeenCalled()
  })

  it("confirms mixed selections and deletes only custom roles", async () => {
    const { RoleIndexRouteComponent } = await import(
      "@/routes/_authenticated/roles/-index-route-component.tsx"
    )

    render(<RoleIndexRouteComponent />)

    fireEvent.click(screen.getByRole("button", { name: /delete mixed/i }))

    await waitFor(() => {
      expect(mocks.deleteRole).toHaveBeenCalledWith(mocks.customRole.id)
    })
    expect(mocks.deleteRole).not.toHaveBeenCalledWith(mocks.builtInRole.id)
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["roles"]
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Deleted 1 role(s)!")
  })

  it("uses the action-error toast and leaves the preview open on delete failure", async () => {
    const failure = new Error("request failed")
    mocks.deleteRole.mockRejectedValueOnce(failure)
    const { RoleIndexRouteComponent } = await import(
      "@/routes/_authenticated/roles/-index-route-component.tsx"
    )

    render(<RoleIndexRouteComponent selected={mocks.failingRole.id} />)

    fireEvent.click(screen.getByRole("button", { name: /delete failing/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        failure,
        `Failed to delete role ${mocks.failingRole.name}: ${failure}`
      )
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["roles"]
    })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("closes the selected role preview after deleting that role", async () => {
    const { RoleIndexRouteComponent } = await import(
      "@/routes/_authenticated/roles/-index-route-component.tsx"
    )

    render(<RoleIndexRouteComponent selected={mocks.customRole.id} />)

    fireEvent.click(screen.getByRole("button", { name: /delete mixed/i }))

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/roles",
        replace: true,
        search: expect.any(Function)
      })
    })

    const clearSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(clearSearch({ filter: "security", selected: mocks.customRole.id })).toEqual({
      filter: "security",
      selected: undefined
    })
  })
})
