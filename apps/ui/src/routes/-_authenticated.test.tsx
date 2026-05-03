import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

const mocks = vi.hoisted(() => ({
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
  usePage: () => ({
    actions: [],
    description: "Page description",
    title: "Page title"
  })
}))

describe("authenticated route guard", () => {
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
})
