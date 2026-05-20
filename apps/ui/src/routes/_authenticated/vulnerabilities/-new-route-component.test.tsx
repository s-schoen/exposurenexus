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
import { CreateVulnerabilityRouteComponent } from "@/routes/_authenticated/vulnerabilities/-new-route-component.tsx"

const mocks = vi.hoisted(() => {
  const submitValues = {
    title: "  Exposed Admin Endpoint  ",
    severity: "high",
    description: "  Administrative interface is reachable externally  ",
    cve: "  CVE-2026-0001  ",
    cwe: "284"
  } as VulnerabilityFormValues
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
    createVulnerability: vi.fn(),
    invalidateQueries: vi.fn(),
    navigate: vi.fn(),
    submitValues,
    toastActionError: vi.fn(),
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

vi.mock("@/api/vulnerability.ts", () => ({
  createListVulnerabilitiesQueryOptions: () => ({
    queryKey: ["vulnerabilities"]
  }),
  createVulnerability: mocks.createVulnerability,
  useCreateVulnerabilityMutation: () => ({
    mutateAsync: mocks.createVulnerability
  })
}))

vi.mock("@/components/vulnerability-form.tsx", async (importOriginal) => {
  const actual = await importOriginal()

  return Object.assign({}, actual, {
    VulnerabilityForm: ({
      mode,
      onCancel,
      onSubmit
    }: {
      mode: string
      onCancel: () => void
      onSubmit: (values: VulnerabilityFormValues) => Promise<void> | void
    }) => (
      <div>
        <div data-testid="mode">{mode}</div>
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

describe("CreateVulnerabilityRouteComponent", () => {
  beforeEach(() => {
    mocks.createVulnerability.mockReset()
    mocks.invalidateQueries.mockReset()
    mocks.navigate.mockReset()
    mocks.toastActionError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.usePageMeta.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders the vulnerability form in create mode", () => {
    render(<CreateVulnerabilityRouteComponent />)

    expect(screen.getByTestId("mode").textContent).toBe("create")
    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Create Vulnerability",
      description: "Add a catalog entry for a reusable vulnerability."
    })
  })

  it("creates a vulnerability, invalidates the list, and navigates to detail", async () => {
    mocks.createVulnerability.mockResolvedValueOnce(mocks.vulnerability)

    render(<CreateVulnerabilityRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.createVulnerability).toHaveBeenCalledWith({
        title: "Exposed Admin Endpoint",
        severity: VulnerabilitySeverity.High,
        description: "Administrative interface is reachable externally",
        cve: "CVE-2026-0001",
        cwe: 284
      })
    })
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["vulnerabilities"]
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Created vulnerability Exposed Admin Endpoint"
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities/$id",
      params: { id: mocks.vulnerability.id }
    })
  })

  it("reports create failures without navigating", async () => {
    const error = new Error("Create failed")
    mocks.createVulnerability.mockRejectedValueOnce(error)

    render(<CreateVulnerabilityRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => {
      expect(mocks.toastActionError).toHaveBeenCalledWith(
        error,
        `Failed to create vulnerability: ${error}`
      )
    })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it("cancels back to the vulnerabilities list", async () => {
    render(<CreateVulnerabilityRouteComponent />)
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/vulnerabilities",
        search: { selected: undefined }
      })
    })
  })
})
