import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AuthState } from "@/context/auth.tsx"
import type { LoginRedirects } from "@/lib/login-redirect.ts"
import { LoginPage } from "@/features/auth/components/login-page.tsx"
import {
  createTestAuthState,
  createTestRedirects
} from "@/test/harness.tsx"

function renderLoginPage({
  login = vi.fn<AuthState["login"]>().mockResolvedValue(undefined),
  redirect = "/findings",
  safeLoginRedirect = vi.fn<LoginRedirects["safeLoginRedirect"]>((value) =>
    typeof value === "string" ? value : "/"
  )
}: {
  login?: AuthState["login"]
  redirect?: string
  safeLoginRedirect?: LoginRedirects["safeLoginRedirect"]
} = {}) {
  const navigate = vi.fn().mockResolvedValue(undefined)
  const view = render(
    <LoginPage
      auth={createTestAuthState({ login })}
      redirects={createTestRedirects({ safeLoginRedirect })}
      redirect={redirect}
      navigate={navigate}
    />
  )

  return {
    user: userEvent.setup(),
    login,
    safeLoginRedirect,
    navigate,
    ...view
  }
}

describe("LoginPage", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("does not submit empty credentials", async () => {
    const { user, login } = renderLoginPage()

    await user.click(screen.getByRole("button", { name: /^login$/i }))

    await waitFor(() => {
      expect(login).not.toHaveBeenCalled()
    })
  })

  it("shows failed login feedback", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const { user, login, navigate } = renderLoginPage({
      login: vi.fn().mockRejectedValueOnce(new Error("Invalid credentials"))
    })

    await user.type(screen.getByLabelText(/username/i), "alice")
    await user.type(screen.getByLabelText(/password/i), "wrong-password")
    await user.click(screen.getByRole("button", { name: /^login$/i }))

    expect(
      await screen.findByText("Invalid username or password.")
    ).toBeInTheDocument()
    expect(login).toHaveBeenCalledWith("alice", "wrong-password")
    expect(navigate).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it("logs in and navigates to the requested redirect", async () => {
    const { user, login, safeLoginRedirect, navigate } = renderLoginPage({
      redirect: "/findings/triage"
    })

    await user.type(screen.getByLabelText(/username/i), "alice")
    await user.type(
      screen.getByLabelText(/password/i),
      "correct-horse-battery-staple"
    )
    await user.click(screen.getByRole("button", { name: /^login$/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        "alice",
        "correct-horse-battery-staple"
      )
      expect(safeLoginRedirect).toHaveBeenCalledWith("/findings/triage")
      expect(navigate).toHaveBeenCalledWith({
        href: "/findings/triage"
      })
    })
  })

  it("falls back to a safe redirect after login", async () => {
    const { user, login, safeLoginRedirect, navigate } = renderLoginPage({
      redirect: "/future-route",
      safeLoginRedirect: vi.fn().mockReturnValueOnce("/")
    })

    await user.type(screen.getByLabelText(/username/i), "alice")
    await user.type(
      screen.getByLabelText(/password/i),
      "correct-horse-battery-staple"
    )
    await user.click(screen.getByRole("button", { name: /^login$/i }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith(
        "alice",
        "correct-horse-battery-staple"
      )
      expect(safeLoginRedirect).toHaveBeenCalledWith("/future-route")
      expect(navigate).toHaveBeenCalledWith({ href: "/" })
    })
  })
})
