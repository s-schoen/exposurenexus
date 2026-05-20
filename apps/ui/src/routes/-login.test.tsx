import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  auth: {
    ensureSession: vi.fn(),
    login: vi.fn()
  },
  redirects: {
    safeLoginRedirect: vi.fn((redirect: unknown) =>
      typeof redirect === "string" ? redirect : "/"
    )
  },
  navigate: vi.fn(),
  redirect: "/findings",
  redirectResult: vi.fn((options: unknown) => ({
    redirect: true,
    options
  }))
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useNavigate: () => mocks.navigate,
      useRouteContext: () => ({
        auth: mocks.auth,
        redirects: mocks.redirects
      }),
      useSearch: () => ({
        redirect: mocks.redirect
      })
    }),
    redirect: mocks.redirectResult,
    useNavigate: () => mocks.navigate
  })
})

async function renderLogin() {
  const { Login } = await import("@/routes/login.tsx")

  return render(<Login />)
}

describe("login route", () => {
  beforeEach(() => {
    mocks.auth.ensureSession.mockReset()
    mocks.auth.ensureSession.mockResolvedValue(false)
    mocks.auth.login.mockReset()
    mocks.redirects.safeLoginRedirect.mockReset()
    mocks.redirects.safeLoginRedirect.mockImplementation((redirect: unknown) =>
      typeof redirect === "string" ? redirect : "/"
    )
    mocks.navigate.mockReset()
    mocks.redirect = "/findings"
    mocks.redirectResult.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("defaults the redirect search value and redirects authenticated users", async () => {
    const { Route } = await import("@/routes/login.tsx")

    expect(
      (
        Route.options.validateSearch as (search: Record<string, unknown>) => {
          redirect: string
        }
      )({})
    ).toEqual({ redirect: "/" })
    expect(
      (
        Route.options.validateSearch as (search: Record<string, unknown>) => {
          redirect: string
        }
      )({ redirect: "/assets" })
    ).toEqual({ redirect: "/assets" })
    expect(
      (
        Route.options.validateSearch as (search: Record<string, unknown>) => {
          redirect: string
        }
      )({ redirect: 42 })
    ).toEqual({ redirect: "/" })

    mocks.auth.ensureSession.mockResolvedValueOnce(true)
    await expect(
      (
        Route.options.beforeLoad as (args: {
          context: {
            auth: { ensureSession: () => Promise<boolean> }
            redirects: { safeLoginRedirect: (redirect: unknown) => string }
          }
          search: { redirect: string }
        }) => Promise<void>
      )({
        context: {
          auth: {
            ensureSession: mocks.auth.ensureSession
          },
          redirects: mocks.redirects
        },
        search: {
          redirect: "/assets"
        }
      })
    ).rejects.toEqual({
      options: { href: "/assets" },
      redirect: true
    })
    expect(mocks.auth.ensureSession).toHaveBeenCalledTimes(1)
    expect(mocks.redirects.safeLoginRedirect).toHaveBeenCalledWith("/assets")
    expect(mocks.redirectResult).toHaveBeenCalledWith({ href: "/assets" })
  })

  it("does not submit empty credentials", async () => {
    await renderLogin()

    fireEvent.click(screen.getByRole("button", { name: /^login$/i }))

    await waitFor(() => {
      expect(mocks.auth.login).not.toHaveBeenCalled()
    })
  })

  it("shows failed login feedback", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    mocks.auth.login.mockRejectedValueOnce(new Error("Invalid credentials"))
    await renderLogin()

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: "alice" }
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "wrong-password" }
    })
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }))

    expect(
      await screen.findByText("Invalid username or password.")
    ).toBeTruthy()
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
  })

  it("logs in and navigates to the requested redirect", async () => {
    mocks.auth.login.mockResolvedValueOnce(undefined)
    mocks.redirect = "/findings/triage"
    await renderLogin()

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: "alice" }
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct-horse-battery-staple" }
    })
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }))

    await waitFor(() => {
      expect(mocks.auth.login).toHaveBeenCalledWith(
        "alice",
        "correct-horse-battery-staple"
      )
      expect(mocks.redirects.safeLoginRedirect).toHaveBeenCalledWith(
        "/findings/triage"
      )
      expect(mocks.navigate).toHaveBeenCalledWith({
        href: "/findings/triage"
      })
    })
  })

  it("falls back to a safe redirect after login", async () => {
    mocks.auth.login.mockResolvedValueOnce(undefined)
    mocks.redirect = "/future-route"
    mocks.redirects.safeLoginRedirect.mockReturnValueOnce("/")
    await renderLogin()

    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: "alice" }
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct-horse-battery-staple" }
    })
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }))

    await waitFor(() => {
      expect(mocks.auth.login).toHaveBeenCalledWith(
        "alice",
        "correct-horse-battery-staple"
      )
      expect(mocks.redirects.safeLoginRedirect).toHaveBeenCalledWith(
        "/future-route"
      )
      expect(mocks.navigate).toHaveBeenCalledWith({ href: "/" })
    })
  })
})
