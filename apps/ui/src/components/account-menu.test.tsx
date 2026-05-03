import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

interface SessionQuery {
  data?: {
    user: {
      displayName?: string | null
      email?: string | null
    }
  }
  isPending: boolean
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signOut: vi.fn(),
  sessionQuery: {
    data: {
      user: {
        displayName: "Alice Example",
        email: "alice@example.com"
      }
    },
    isPending: false
  } as SessionQuery
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@/lib/auth", () => ({
  authClient: {
    signOut: mocks.signOut,
    useSession: () => mocks.sessionQuery
  }
}))

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )
}))

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ render: trigger }: { render: ReactNode }) => (
    <>{trigger}</>
  )
}))

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span>Loading account</span>
}))

describe("AccountMenu", () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.signOut.mockReset()
    mocks.sessionQuery = {
      data: {
        user: {
          displayName: "Alice Example",
          email: "alice@example.com"
        }
      },
      isPending: false
    }
  })

  afterEach(() => {
    cleanup()
  })

  it("renders the current user and signs out through the auth client", async () => {
    const { AccountMenu } = await import("@/components/account-menu.tsx")
    mocks.signOut.mockImplementationOnce(
      (options: { fetchOptions?: { onSuccess?: () => void } }) => {
        options.fetchOptions?.onSuccess?.()
        return Promise.resolve({ data: { revoked: true } })
      }
    )

    render(<AccountMenu />)

    expect(screen.getByText("Alice Example")).toBeTruthy()
    expect(screen.getByText("A")).toBeTruthy()
    expect(screen.getByText("Account")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }))

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledTimes(1)
      expect(mocks.navigate).toHaveBeenCalledWith({
        search: { redirect: "/" },
        to: "/login"
      })
    })
  })

  it("falls back to email and shows a spinner while the session is pending", async () => {
    const { AccountMenu } = await import("@/components/account-menu.tsx")
    mocks.sessionQuery = {
      data: {
        user: {
          displayName: null,
          email: "alice@example.com"
        }
      },
      isPending: false
    }

    const { rerender } = render(<AccountMenu />)

    expect(screen.getByText("alice@example.com")).toBeTruthy()
    expect(screen.getByText("A")).toBeTruthy()

    mocks.sessionQuery = {
      data: undefined,
      isPending: true
    }
    rerender(<AccountMenu />)

    expect(screen.getByText("Loading account")).toBeTruthy()
  })
})
