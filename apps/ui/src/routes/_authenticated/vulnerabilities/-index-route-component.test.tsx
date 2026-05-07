import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import type {
  Vulnerability,
  VulnerabilitySeverity
} from "@exposurenexus/types/model/vulnerability"

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

  return {
    dialogProps: undefined as undefined | Record<string, unknown>,
    navigate: vi.fn(),
    usePageMeta: vi.fn(),
    vulnerability
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/vulnerability-table", () => ({
  VulnerabilityTable: ({
    onSelectVulnerability,
    selectedVulnerabilityId
  }: {
    onSelectVulnerability?: (vulnerability: Vulnerability) => void
    selectedVulnerabilityId?: string
  }) => (
    <div>
      <div data-testid="selected-vulnerability">{selectedVulnerabilityId}</div>
      <button
        type="button"
        onClick={() => onSelectVulnerability?.(mocks.vulnerability)}
      >
        select vulnerability
      </button>
    </div>
  )
}))

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: (props: {
    children?: ReactNode
    description: string
    fullPageHref?: string
    onClose: () => void
    selectedId?: string
    title: string
  }) => {
    mocks.dialogProps = props

    return (
      <section>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
        <div data-testid="full-page-href">{props.fullPageHref}</div>
        <button type="button" onClick={props.onClose}>
          close dialog
        </button>
        {props.children}
      </section>
    )
  }
}))

vi.mock("@/components/vulnerability-detail-content.tsx", () => ({
  VulnerabilityDetailContent: ({
    vulnerabilityId
  }: {
    vulnerabilityId: string
  }) => <div>Detail for {vulnerabilityId}</div>
}))

describe("VulnerabilitiesRouteComponent", () => {
  beforeEach(() => {
    mocks.dialogProps = undefined
    mocks.navigate.mockReset()
    mocks.usePageMeta.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders table and preview dialog metadata without a selection", async () => {
    const { VulnerabilitiesRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-index-route-component.tsx")

    render(<VulnerabilitiesRouteComponent />)

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Vulnerabilities",
      description:
        "Browse the underlying vulnerability catalog and inspect severity classification."
    })
    expect(screen.getByText("Vulnerability details")).toBeTruthy()
    expect(
      screen.getByText(
        "Review the selected vulnerability without leaving the vulnerability table."
      )
    ).toBeTruthy()
    expect(screen.getByTestId("selected-vulnerability").textContent).toBe("")
    expect(screen.getByTestId("full-page-href").textContent).toBe("")
  })

  it("selects vulnerabilities and renders the selected preview content", async () => {
    const { VulnerabilitiesRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-index-route-component.tsx")

    render(<VulnerabilitiesRouteComponent selected={mocks.vulnerability.id} />)

    expect(screen.getByTestId("selected-vulnerability").textContent).toBe(
      mocks.vulnerability.id
    )
    expect(screen.getByTestId("full-page-href").textContent).toBe(
      `/vulnerabilities/${mocks.vulnerability.id}`
    )
    expect(
      screen.getByText(`Detail for ${mocks.vulnerability.id}`)
    ).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: /select vulnerability/i })
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities",
      search: expect.any(Function)
    })

    const selectSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(selectSearch({ filter: "admin" })).toEqual({
      filter: "admin",
      selected: mocks.vulnerability.id
    })

    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }))
    const closeSearch = mocks.navigate.mock.calls[1][0].search as (
      previous: Record<string, unknown>
    ) => Record<string, unknown>

    expect(closeSearch({ selected: mocks.vulnerability.id })).toEqual({
      selected: undefined
    })
  })
})
