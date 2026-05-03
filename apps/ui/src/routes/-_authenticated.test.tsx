import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
  actionClick: vi.fn(),
  page: {
    actions: [] as Array<{
      disabled?: boolean
      label: string
      onClick: () => void
      variant?: "default" | "outline" | "ghost" | "destructive"
    }>,
    description: "Page description",
    title: "Page title"
  },
  redirect: vi.fn((options: unknown) => ({
    redirect: true,
    options
  }))
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options
    }),
    Outlet: () => <div>Outlet</div>,
    redirect: mocks.redirect
  })
})

vi.mock("@/components/app-sidebar.tsx", () => ({
  AppSidebar: () => <aside>Sidebar</aside>
}))

vi.mock("@/components/app-header.tsx", () => ({
  default: () => <header>Header</header>
}))

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    Root: () => null
  }
}))

vi.mock("@/components/asset-dialog.tsx", () => ({
  AssetDialog: {
    Root: () => null
  }
}))

vi.mock("@/components/ui/sonner.tsx", () => ({
  Toaster: () => null
}))

vi.mock("@/components/ui/sidebar.tsx", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )
}))

vi.mock("nuqs/adapters/tanstack-router", () => ({
  NuqsAdapter: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock("@/context/page.tsx", () => ({
  usePage: () => mocks.page
}))

describe("authenticated route guard", () => {
  beforeEach(() => {
    mocks.actionClick.mockReset()
    mocks.redirect.mockClear()
    mocks.page = {
      actions: [],
      description: "Page description",
      title: "Page title"
    }
  })

  afterEach(() => {
    cleanup()
  })

  it("redirects unauthenticated users to login with the current location", async () => {
    const { Route } = await import("@/routes/_authenticated.tsx")
    const ensureSession = vi.fn().mockResolvedValue(false)

    await expect(
      (
        Route.options.beforeLoad as (args: {
          context: { auth: { ensureSession: () => Promise<boolean> } }
          location: { href: string }
        }) => Promise<void>
      )({
        context: {
          auth: {
            ensureSession
          }
        },
        location: {
          href: "/findings/triage?status=active"
        }
      })
    ).rejects.toEqual({
      options: {
        search: {
          redirect: "/findings/triage?status=active"
        },
        to: "/login"
      },
      redirect: true
    })
    expect(ensureSession).toHaveBeenCalledTimes(1)
    expect(mocks.redirect).toHaveBeenCalledWith({
      search: {
        redirect: "/findings/triage?status=active"
      },
      to: "/login"
    })
  })

  it("allows users with a valid session through", async () => {
    const { Route } = await import("@/routes/_authenticated.tsx")
    const ensureSession = vi.fn().mockResolvedValue(true)

    await expect(
      (
        Route.options.beforeLoad as (args: {
          context: { auth: { ensureSession: () => Promise<boolean> } }
          location: { href: string }
        }) => Promise<void>
      )({
        context: {
          auth: {
            ensureSession
          }
        },
        location: {
          href: "/assets"
        }
      })
    ).resolves.toBeUndefined()
    expect(ensureSession).toHaveBeenCalledTimes(1)
  })

  it("renders page metadata and actions in the authenticated shell", async () => {
    const { Route } = await import("@/routes/_authenticated.tsx")
    mocks.page = {
      actions: [
        {
          label: "Create finding",
          onClick: mocks.actionClick
        },
        {
          disabled: true,
          label: "Disabled action",
          onClick: vi.fn(),
          variant: "outline"
        }
      ],
      description: "Review active findings that need analyst attention.",
      title: "Triage queue"
    }
    const Component = Route.options.component as () => ReactNode

    await act(() => {
      render(<Component />)
    })

    expect(await screen.findByText("Header")).toBeTruthy()
    expect(screen.getByText("Sidebar")).toBeTruthy()
    expect(screen.getByText("Outlet")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Triage queue" })).toBeTruthy()
    expect(
      screen.getByText("Review active findings that need analyst attention.")
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Create finding" }))

    expect(mocks.actionClick).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Disabled action"
      }).disabled
    ).toBe(true)
  })
})
