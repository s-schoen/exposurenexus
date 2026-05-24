import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type { UserProfile } from "@exposurenexus/types/model/user"

const mocks = vi.hoisted(() => {
  const user: UserProfile = {
    id: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    username: "alice",
    displayName: "Alice Example",
    email: "alice@example.com",
    enabled: true,
    roleIds: []
  }

  return {
    dialogProps: undefined as undefined | Record<string, unknown>,
    navigate: vi.fn(),
    usePageMeta: vi.fn(),
    user
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/user-table", () => ({
  UserTable: ({
    filterState,
    onCreateUser,
    onFilterStateChange,
    onSelectUser,
    selectedUserId
  }: {
    filterState?: unknown
    onCreateUser?: () => void
    onFilterStateChange?: (filterState: {
      globalFilter: string
      selectFilters: Record<string, Array<string>>
    }) => void
    onSelectUser?: (user: UserProfile) => void
    selectedUserId?: string
  }) => (
    <div>
      <div data-testid="selected-user">{selectedUserId}</div>
      <div data-testid="filter-state">{JSON.stringify(filterState)}</div>
      <button type="button" onClick={() => onSelectUser?.(mocks.user)}>
        select user
      </button>
      <button type="button" onClick={onCreateUser}>
        create user
      </button>
      <button
        type="button"
        onClick={() =>
          onFilterStateChange?.({
            globalFilter: "bob",
            selectFilters: {
              enabled: ["false"]
            }
          })
        }
      >
        change filters
      </button>
    </div>
  )
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
        <div data-testid="full-page-href">{props.fullPageHref}</div>
        <button type="button" onClick={props.onClose}>
          close dialog
        </button>
        {props.children}
      </section>
    )
  }
}))

vi.mock("@/components/user-detail-content.tsx", () => ({
  UserDetailContent: ({ userId }: { userId: string }) => (
    <div>Detail for {userId}</div>
  )
}))

describe("UsersRouteComponent", () => {
  beforeEach(() => {
    mocks.dialogProps = undefined
    mocks.navigate.mockReset()
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("passes route-owned filters and preview metadata to the table", async () => {
    const { UsersRouteComponent } = await import(
      "@/routes/_authenticated/users/-index-route-component.tsx"
    )

    render(
      <UsersRouteComponent
        search={{ enabled: "true,false", filter: "alice" }}
      />
    )

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Users",
      description: "Browse users with access to the platform."
    })
    expect(JSON.parse(screen.getByTestId("filter-state").textContent)).toEqual(
      {
        globalFilter: "alice",
        selectFilters: {
          enabled: ["true", "false"]
        }
      }
    )
    expect(screen.getByTestId("selected-user").textContent).toBe("")
    expect(screen.getByTestId("full-page-href").textContent).toBe("")
  })

  it("selects users and renders selected preview content", async () => {
    const { UsersRouteComponent } = await import(
      "@/routes/_authenticated/users/-index-route-component.tsx"
    )

    render(<UsersRouteComponent selected={mocks.user.id} />)

    expect(screen.getByTestId("selected-user").textContent).toBe(mocks.user.id)
    expect(screen.getByTestId("full-page-href").textContent).toBe(
      `/users/${mocks.user.id}`
    )
    expect(screen.getByText(`Detail for ${mocks.user.id}`)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /select user/i }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users",
      search: expect.any(Function)
    })

    const selectSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(selectSearch({ filter: "alice" })).toEqual({
      filter: "alice",
      selected: mocks.user.id
    })
  })

  it("updates route-owned filters and preserves unrelated search params", async () => {
    const { UsersRouteComponent } = await import(
      "@/routes/_authenticated/users/-index-route-component.tsx"
    )

    render(<UsersRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users",
      replace: true,
      search: expect.any(Function)
    })

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(search({ page: "2", selected: "user-1" })).toEqual({
      enabled: "false",
      filter: "bob",
      page: "2",
      selected: "user-1"
    })
  })

  it("navigates to the create user route", async () => {
    const { UsersRouteComponent } = await import(
      "@/routes/_authenticated/users/-index-route-component.tsx"
    )

    render(<UsersRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /create user/i }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users/new"
    })
  })
})
