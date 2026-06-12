import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactNode } from "react"
import type { Role } from "@exposurenexus/types/model/rbac"
import type { UserProfile } from "@exposurenexus/types/model/user"
import { UsersPage } from "@/features/users/components/users-page.tsx"

type NavigateCall = {
  params?: Record<string, unknown>
  replace?: boolean
  search?: unknown
  to?: string
}

type SearchUpdater = (
  previous: Record<string, unknown>
) => Record<string, unknown>

interface RouteState {
  search: Record<string, unknown>
  selected?: string
}

interface QueryOptionsLike {
  queryKey: ReadonlyArray<unknown>
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
  const users: Array<UserProfile> = [
    {
      id: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
      username: "alice",
      displayName: "Alice Example",
      email: "alice@example.com",
      enabled: true,
      roleIds: [roles[0].id]
    },
    {
      id: "7b413aba-5164-456b-8ffd-88fb6b99bbed",
      username: "casey",
      displayName: "Casey Disabled",
      email: "casey@example.com",
      enabled: false,
      roleIds: []
    }
  ]

  return {
    navigate: vi.fn(),
    roles,
    users,
    usePageMeta: vi.fn()
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptionsLike) => {
    const queryKey = options.queryKey.join("/")

    if (queryKey === "users") {
      return {
        data: mocks.users,
        isFetching: false,
        isPending: false,
        isSuccess: true,
        refetch: vi.fn()
      }
    }

    if (queryKey === "roles") {
      return {
        data: mocks.roles,
        isFetching: false,
        isPending: false,
        isSuccess: true,
        refetch: vi.fn()
      }
    }

    throw new Error(`Unhandled query key ${queryKey}`)
  }
}))

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"]
  })
}))

vi.mock("@/api/role.ts", () => ({
  createListRolesQueryOptions: () => ({
    queryKey: ["roles"]
  })
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: ({
    children,
    description,
    fullPageHref,
    onClose,
    selectedId,
    title
  }: {
    children: ReactNode
    description: string
    fullPageHref?: string
    onClose: () => void
    selectedId?: string
    title: string
  }) =>
    selectedId ? (
      <section aria-label={title} role="dialog">
        <p>{description}</p>
        {fullPageHref && <a href={fullPageHref}>Open full page</a>}
        <button type="button" onClick={onClose}>
          Close
        </button>
        {children}
      </section>
    ) : null
}))

vi.mock("@/components/user-detail-content.tsx", () => ({
  UserDetailContent: ({ userId }: { userId: string }) => (
    <div>User detail for {userId}</div>
  )
}))

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock
HTMLElement.prototype.scrollIntoView = vi.fn()

function StatefulUsersRoute({
  initialSearch = {},
  initialSelected
}: {
  initialSearch?: Record<string, unknown>
  initialSelected?: string
}) {
  const [routeState, setRouteState] = useState<RouteState>({
    search: initialSearch,
    selected: initialSelected
  })

  mocks.navigate.mockImplementation((options: NavigateCall) => {
    if (options.to !== "/users" || typeof options.search !== "function") {
      return
    }

    const updateSearch = options.search as SearchUpdater

    setRouteState((current) => {
      const nextSearch = updateSearch({
        ...current.search,
        selected: current.selected
      })

      return {
        search: nextSearch,
        selected:
          typeof nextSearch.selected === "string" ? nextSearch.selected : undefined
      }
    })
  })

  return (
    <UsersPage
      search={routeState.search}
      selected={routeState.selected}
    />
  )
}

function renderUsersRoute({
  initialSearch,
  initialSelected
}: {
  initialSearch?: Record<string, unknown>
  initialSelected?: string
} = {}) {
  return render(
    <StatefulUsersRoute
      initialSearch={initialSearch}
      initialSelected={initialSelected}
    />
  )
}

describe("UsersPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("opens and closes the selected user preview", async () => {
    const user = userEvent.setup()

    renderUsersRoute()

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Users",
      description: "Browse users with access to the platform."
    })

    const userRow = screen.getByText("Alice Example").closest("tr")

    if (!userRow) {
      throw new Error("Expected user row")
    }

    fireEvent.click(userRow)

    expect(
      await screen.findByText(`User detail for ${mocks.users[0].id}`)
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: /open full page/i })
    ).toHaveAttribute("href", `/users/${mocks.users[0].id}`)

    await user.click(screen.getByRole("button", { name: /close/i }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(screen.queryByTestId("data-table-active-row")).not.toBeInTheDocument()
    })
  })

  it("updates visible user results from route-owned search state", async () => {
    const user = userEvent.setup()

    renderUsersRoute()
    await user.type(
      screen.getByRole("textbox", { name: /search across visible columns/i }),
      "casey"
    )

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1"
      )
      expect(screen.getByText("Casey Disabled")).toBeVisible()
      expect(screen.queryByText("Alice Example")).not.toBeInTheDocument()
    })
  })

  it("navigates from the new user action", async () => {
    const user = userEvent.setup()

    renderUsersRoute()
    await user.click(screen.getByRole("button", { name: /new user/i }))

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/users/new"
    })
  })
})
