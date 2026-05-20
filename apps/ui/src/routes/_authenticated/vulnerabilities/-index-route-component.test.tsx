import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
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
    confirmDelete: vi.fn(),
    deleteVulnerability: vi.fn(),
    dialogProps: undefined as undefined | Record<string, unknown>,
    invalidateQueries: vi.fn(),
    navigate: vi.fn(),
    toastSuccess: vi.fn(),
    usePageMeta: vi.fn(),
    vulnerability
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries
  })
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess
  }
}))

vi.mock("@/api/vulnerability.ts", () => ({
  createListVulnerabilitiesQueryOptions: () => ({
    queryKey: ["vulnerabilities"]
  }),
  createVulnerabilityByIDQueryOptions: (id: string) => ({
    queryKey: ["vulnerabilities", id]
  }),
  deleteVulnerability: mocks.deleteVulnerability,
  useDeleteVulnerabilityMutation: () => ({
    mutateAsync: mocks.deleteVulnerability
  })
}))

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDelete
  }
}))

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/components/vulnerability-table", () => ({
  VulnerabilityTable: ({
    onCreateVulnerability,
    onDeleteVulnerabilities,
    onSelectVulnerability,
    selectedVulnerabilityId
  }: {
    onCreateVulnerability?: () => void
    onDeleteVulnerabilities?: (
      vulnerabilities: Array<Vulnerability>
    ) => Promise<void>
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
      <button type="button" onClick={onCreateVulnerability}>
        create vulnerability
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteVulnerabilities?.([mocks.vulnerability])
        }}
      >
        delete vulnerability
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
    mocks.confirmDelete.mockReset()
    mocks.confirmDelete.mockResolvedValue(true)
    mocks.deleteVulnerability.mockReset()
    mocks.deleteVulnerability.mockResolvedValue(mocks.vulnerability)
    mocks.dialogProps = undefined
    mocks.invalidateQueries.mockReset()
    mocks.invalidateQueries.mockResolvedValue(undefined)
    mocks.navigate.mockReset()
    mocks.toastSuccess.mockReset()
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

  it("navigates to the create vulnerability route", async () => {
    const { VulnerabilitiesRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-index-route-component.tsx")

    render(<VulnerabilitiesRouteComponent />)

    fireEvent.click(
      screen.getByRole("button", { name: /create vulnerability/i })
    )

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities/new"
    })
  })

  it("confirms selected vulnerability deletion, invalidates queries, and clears deleted selection", async () => {
    const { VulnerabilitiesRouteComponent } =
      await import("@/routes/_authenticated/vulnerabilities/-index-route-component.tsx")

    render(<VulnerabilitiesRouteComponent selected={mocks.vulnerability.id} />)

    fireEvent.click(
      screen.getByRole("button", { name: /delete vulnerability/i })
    )

    await waitFor(() => {
      expect(mocks.confirmDelete).toHaveBeenCalledWith({
        title: "Delete Vulnerabilities",
        description: "This action cannot be undone",
        message: "Are you sure you want to delete 1 vulnerability record(s)?",
        confirmVariant: "destructive"
      })
      expect(mocks.deleteVulnerability).toHaveBeenCalledWith(
        mocks.vulnerability.id
      )
    })

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["vulnerabilities"]
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["vulnerabilities", mocks.vulnerability.id]
    })
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities",
      search: expect.any(Function)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Deleted 1 vulnerability record(s)!"
    )
  })
})
