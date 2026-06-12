import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { Suspense } from "react"
import type { ComponentType } from "react"

const mocks = vi.hoisted(() => ({
  matchRoute: vi.fn(),
  vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe"
}))

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    createFileRoute: () => (options: Record<string, unknown>) => ({
      options,
      useParams: () => ({ id: mocks.vulnerabilityId })
    }),
    Outlet: () => <div>Vulnerability edit child route</div>,
    useMatchRoute: () => mocks.matchRoute
  })
})

vi.mock(
  "@/features/vulnerabilities/components/vulnerability-detail-page.tsx",
  () => ({
    VulnerabilityDetailPage: ({
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
    const { Route } = await import("@/routes/_authenticated/vulnerabilities/$id.tsx")
    const RouteComponent = Route.options.component as ComponentType

    await act(() => {
      render(
        <Suspense fallback={null}>
          <RouteComponent />
        </Suspense>
      )
    })
  }

  it("renders vulnerability detail for the detail route", async () => {
    await renderRouteComponent()

    await waitFor(() => {
      expect(mocks.matchRoute).toHaveBeenCalledWith({
        to: "/vulnerabilities/$id/edit",
        params: { id: mocks.vulnerabilityId }
      })
    })
    expect(
      await screen.findByText(`Vulnerability detail for ${mocks.vulnerabilityId}`)
    ).toBeTruthy()
  })

  it("renders the child route for vulnerability edit", async () => {
    mocks.matchRoute.mockReturnValue(true)

    await renderRouteComponent()

    expect(await screen.findByText("Vulnerability edit child route")).toBeTruthy()
    expect(
      screen.queryByText(`Vulnerability detail for ${mocks.vulnerabilityId}`)
    ).toBeNull()
  })
})
