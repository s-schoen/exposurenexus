import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type {
  Vulnerability,
  VulnerabilitySeverity
} from "@exposurenexus/types/model/vulnerability"

interface QueryState<TData> {
  data?: TData
  isPending: boolean
  isSuccess: boolean
}

const mocks = vi.hoisted(() => {
  const vulnerability: Vulnerability = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    title: "Exposed Admin Endpoint",
    severity: "high" as VulnerabilitySeverity,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: "CVE-2026-0001",
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z")
  }
  const vulnerabilityQuery: QueryState<Vulnerability> = {
    data: vulnerability,
    isPending: false,
    isSuccess: true
  }

  return {
    navigate: vi.fn(),
    usePageMeta: vi.fn(),
    vulnerability,
    vulnerabilityQuery
  }
})

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => (
    <a className={className} href="/vulnerabilities">
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.vulnerabilityQuery
}))

vi.mock("@/api/vulnerability.ts", () => ({
  createVulnerabilityByIDQueryOptions: (id: string) => ({
    queryKey: ["vulnerabilities", id]
  })
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/vulnerability-detail-content.tsx", () => ({
  VulnerabilityDetailContent: ({
    titleAction,
    vulnerabilityId
  }: {
    titleAction?: ReactNode
    vulnerabilityId: string
  }) => (
    <div>
      {titleAction}
      <div>Detail for {vulnerabilityId}</div>
    </div>
  )
}))

describe("VulnerabilityDetailRouteComponent", () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.usePageMeta.mockReset()
    mocks.vulnerabilityQuery = {
      data: mocks.vulnerability,
      isPending: false,
      isSuccess: true
    }
  })

  afterEach(() => {
    cleanup()
  })

  it("uses loaded vulnerability data for page metadata and renders the back link", async () => {
    const { VulnerabilityDetailRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-detail-route-component.tsx")

    render(
      <VulnerabilityDetailRouteComponent
        vulnerabilityId={mocks.vulnerability.id}
      />
    )

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Exposed Admin Endpoint",
      description:
        "Review vulnerability metadata, classification references, and the full technical description.",
      actions: [
        expect.objectContaining({
          label: "Edit vulnerability"
        })
      ]
    })
    expect(
      screen.getByRole("link", { name: /back to vulnerabilities/i })
    ).toBeTruthy()
    expect(
      screen.getByText(`Detail for ${mocks.vulnerability.id}`)
    ).toBeTruthy()
  })

  it("uses fallback page metadata before vulnerability data is available", async () => {
    const { VulnerabilityDetailRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-detail-route-component.tsx")
    mocks.vulnerabilityQuery = {
      isPending: true,
      isSuccess: false
    }

    render(
      <VulnerabilityDetailRouteComponent
        vulnerabilityId={mocks.vulnerability.id}
      />
    )

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Vulnerability",
      description:
        "Review vulnerability metadata, classification references, and the full technical description.",
      actions: []
    })
  })

  it("navigates to edit from the page action", async () => {
    const { VulnerabilityDetailRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-detail-route-component.tsx")

    render(
      <VulnerabilityDetailRouteComponent
        vulnerabilityId={mocks.vulnerability.id}
      />
    )

    const meta = mocks.usePageMeta.mock.calls[0][0]
    meta.actions[0].onClick()

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities/$id/edit",
      params: { id: mocks.vulnerability.id }
    })
  })
})
