import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { Vulnerability } from "@exposurenexus/types/model/vulnerability"
import type { VulnerabilityFormValues } from "@/components/vulnerability-form.tsx"
import { EditVulnerabilityRouteComponent } from "@/routes/_authenticated/vulnerabilities/-edit-route-component.tsx"

interface QueryState<TData> {
  data?: TData
  error?: Error
  isPending: boolean
  isSuccess: boolean
}

const vulnerabilityId = "9d7acdd0-fad1-46c9-8218-1793f421f0fe"

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
  const submitValues = {
    title: "  Exposed Management Endpoint  ",
    severity: "critical",
    description: "  Management interface is reachable externally  ",
    cve: "",
    cwe: ""
  } as VulnerabilityFormValues
  const vulnerabilityQuery: QueryState<Vulnerability> = {
    data: vulnerability,
    isPending: false,
    isSuccess: true
  }

  return {
    invalidateQueries: vi.fn(),
    navigate: vi.fn(),
    submitValues,
    toastActionError: vi.fn(),
    toastSuccess: vi.fn(),
    updateVulnerability: vi.fn(),
    usePageMeta: vi.fn(),
    vulnerability,
    vulnerabilityQuery
  }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate
}))

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => mocks.vulnerabilityQuery,
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries
  })
}))

vi.mock("@/api/vulnerability.ts", () => ({
  createListVulnerabilitiesQueryOptions: () => ({
    queryKey: ["vulnerabilities"]
  }),
  createVulnerabilityByIDQueryOptions: (id: string) => ({
    queryKey: ["vulnerabilities", id]
  }),
  updateVulnerability: mocks.updateVulnerability,
  useUpdateVulnerabilityMutation: () => ({
    mutateAsync: ({
      id,
      vulnerability
    }: {
      id: string
      vulnerability: unknown
    }) => mocks.updateVulnerability(id, vulnerability)
  })
}))

vi.mock("@/components/vulnerability-form.tsx", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    VulnerabilityForm: ({
      defaultValues,
      mode,
      onCancel,
      onSubmit
    }: {
      defaultValues?: Partial<VulnerabilityFormValues>
      mode: string
      onCancel: () => void
      onSubmit: (values: VulnerabilityFormValues) => Promise<void> | void
    }) => (
      <div>
        <div data-testid="mode">{mode}</div>
        <div data-testid="default-values">{JSON.stringify(defaultValues)}</div>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
        <button type="button" onClick={() => void onSubmit(mocks.submitValues)}>
          submit
        </button>
      </div>
    )
  })
})

vi.mock("@/context/page.tsx", () => ({
  usePageMeta: mocks.usePageMeta
}))

vi.mock("@/lib/action-error-toast.ts", () => ({
  toastActionError: mocks.toastActionError
}))

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess
  }
}))

describe("EditVulnerabilityRouteComponent", () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockReset()
    mocks.navigate.mockReset()
    mocks.toastActionError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.updateVulnerability.mockReset()
    mocks.usePageMeta.mockReset()
    mocks.vulnerabilityQuery = {
      data: mocks.vulnerability,
      isPending: false,
      isSuccess: true
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders the loading state while the vulnerability is pending", () => {
    mocks.vulnerabilityQuery = {
      isPending: true,
      isSuccess: false
    }

    render(
      <EditVulnerabilityRouteComponent vulnerabilityId={vulnerabilityId} />
    )

    expect(
      screen.getAllByText("Loading vulnerability details.").length
    ).toBeGreaterThan(0)
  })

  it("renders the loading error state", () => {
    mocks.vulnerabilityQuery = {
      error: new Error("Vulnerability request failed"),
      isPending: false,
      isSuccess: false
    }

    render(
      <EditVulnerabilityRouteComponent vulnerabilityId={vulnerabilityId} />
    )

    expect(screen.getByText("Unable to load edit form")).toBeTruthy()
    expect(screen.getByText("Vulnerability request failed")).toBeTruthy()
  })

  it("passes default form values from the loaded vulnerability", () => {
    render(
      <EditVulnerabilityRouteComponent vulnerabilityId={vulnerabilityId} />
    )

    expect(screen.getByTestId("mode").textContent).toBe("edit")
    expect(
      JSON.parse(screen.getByTestId("default-values").textContent)
    ).toEqual({
      title: "Exposed Admin Endpoint",
      severity: VulnerabilitySeverity.High,
      description: "Administrative interface is reachable externally",
      cve: "CVE-2026-0001",
      cwe: "284"
    })
    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Edit Exposed Admin Endpoint",
      description: "Update vulnerability catalog metadata."
    })
  })

  it("updates a vulnerability, invalidates queries, and navigates back to detail", async () => {
    mocks.updateVulnerability.mockResolvedValueOnce({
      ...mocks.vulnerability,
      title: "Exposed Management Endpoint"
    })

    render(
      <EditVulnerabilityRouteComponent vulnerabilityId={vulnerabilityId} />
    )
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.updateVulnerability).toHaveBeenCalledWith(vulnerabilityId, {
        title: "Exposed Management Endpoint",
        severity: VulnerabilitySeverity.Critical,
        description: "Management interface is reachable externally",
        cve: null,
        cwe: null
      })
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["vulnerabilities"]
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["vulnerabilities", vulnerabilityId]
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Updated vulnerability Exposed Management Endpoint"
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities/$id",
      params: { id: vulnerabilityId }
    })
  })

  it("reports update failures without navigating", async () => {
    const error = new Error("Update failed")
    mocks.updateVulnerability.mockRejectedValueOnce(error)

    render(
      <EditVulnerabilityRouteComponent vulnerabilityId={vulnerabilityId} />
    )
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        error,
        `Failed to update vulnerability: ${error}`
      )
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("cancels back to vulnerability detail", async () => {
    render(
      <EditVulnerabilityRouteComponent vulnerabilityId={vulnerabilityId} />
    )
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/vulnerabilities/$id",
        params: { id: vulnerabilityId }
      })
    })
  })
})
