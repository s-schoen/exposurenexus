import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  matchRoute: vi.fn(),
  vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe"
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    Outlet: () => <div>Vulnerability edit child route</div>,
    useMatchRoute: () => mocks.matchRoute
  })
})

vi.mock(
  "@/routes/_authenticated/vulnerabilities/-detail-route-component.tsx",
  () => ({
    VulnerabilityDetailRouteComponent: ({
      vulnerabilityId
    }: {
      vulnerabilityId: string
    }) => <div>Vulnerability detail for {vulnerabilityId}</div>
  })
)

describe("vulnerability id route", () => {
  beforeEach(() => {
    mocks.matchRoute.mockReset()
    mocks.matchRoute.mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  async function renderRouteComponent() {
    const { VulnerabilityIdRouteComponent } = await import(
      "@/routes/_authenticated/vulnerabilities/-id-route-component.tsx"
    )

    render(
      <VulnerabilityIdRouteComponent vulnerabilityId={mocks.vulnerabilityId} />
    )
  }

  it("renders vulnerability detail for the detail route", async () => {
    await renderRouteComponent()

    expect(mocks.matchRoute).toHaveBeenCalledWith({
      to: "/vulnerabilities/$id/edit",
      params: { id: mocks.vulnerabilityId }
    })
    expect(
      screen.getByText(`Vulnerability detail for ${mocks.vulnerabilityId}`)
    ).toBeTruthy()
  })

  it("renders the child route for vulnerability edit", async () => {
    mocks.matchRoute.mockReturnValue(true)

    await renderRouteComponent()

    expect(screen.getByText("Vulnerability edit child route")).toBeTruthy()
    expect(
      screen.queryByText(`Vulnerability detail for ${mocks.vulnerabilityId}`)
    ).toBeNull()
  })
})
