import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/components/account-menu", () => ({
  AccountMenu: () => <div>Account menu slot</div>
}))

describe("AppHeader", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders the product brand and account menu slot", async () => {
    const { default: AppHeader } = await import("@/components/app-header.tsx")

    render(<AppHeader />)

    expect(screen.getByText("OpenVLP")).toBeTruthy()
    expect(screen.getByAltText("OpenVLP Logo")).toBeTruthy()
    expect(screen.getByText("Account menu slot")).toBeTruthy()
  })
})
