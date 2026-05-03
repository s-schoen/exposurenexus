import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { FindingSource, FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { ReactNode } from "react"
import type { Finding } from "@openvlp/types/model/finding"
import type { Asset, AssetType } from "@openvlp/types/model/asset"

interface QueryState<TData> {
  data?: TData
  isLoading?: boolean
  isPending: boolean
  isSuccess: boolean
}

const mocks = vi.hoisted(() => {
  const finding: Finding = {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    severity: "high" as VulnerabilitySeverity,
    status: "active" as FindingStatus,
    source: "manual",
    evidence:
      "## Validation\n\nScanner reported **remote access**.\n\n```\nopen port 8443\n```",
    mitigation: "Restrict access to internal networks",
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    fingerprint: "fingerprint-2713d833",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "4e33f42e-764b-4812-88fb-11a183d43434",
    createdAt: new Date("2026-01-04T00:00:00.000Z"),
    updatedAt: new Date("2026-01-05T00:00:00.000Z"),
    vulnerability: {
      id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      title: "Exposed Admin Endpoint",
      severity: "critical" as VulnerabilitySeverity,
      description:
        "## Impact\n\nAdministrative interface is reachable externally.",
      cwe: 284,
      cve: "CVE-2026-0001",
      createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
      updatedBy: "4e33f42e-764b-4812-88fb-11a183d43434",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  }

  const asset: Asset = {
    id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    name: "web-01",
    type: "host" as AssetType,
    ownerId: null
  }

  return {
    asset,
    assetQuery: {
      data: asset,
      isLoading: false,
      isPending: false,
      isSuccess: true
    } as QueryState<Asset>,
    finding,
    findingQuery: {
      data: finding,
      isLoading: false,
      isPending: false,
      isSuccess: true
    } as QueryState<Finding>,
    selectOnValueChange: undefined as undefined | ((value: string) => void),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    updateFindingField: vi.fn(),
    userLabels: {
      "1f9c36d2-1355-49d1-8464-b01ce955d88f": "Alice Example",
      "4e33f42e-764b-4812-88fb-11a183d43434": "Bob Example"
    } as Record<string, string>
  }
})

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: Array<string> }) => {
    if (options.queryKey?.[0] === "assets") {
      return mocks.assetQuery
    }

    return mocks.findingQuery
  }
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>
}))

vi.mock("@/api/asset.ts", () => ({
  createAssetByIDQueryOptions: (id: string) => ({
    queryKey: ["assets", id]
  })
}))

vi.mock("@/api/finding.ts", () => ({
  createFindingByIDQueryOptions: (id: string) => ({
    queryKey: ["findings", id]
  })
}))

vi.mock("@/components/ui/select.tsx", () => ({
  Select: ({
    children,
    onValueChange
  }: {
    children: ReactNode
    onValueChange?: (value: string) => void
  }) => {
    mocks.selectOnValueChange = onValueChange

    return <div>{children}</div>
  },
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <button type="button" onClick={() => mocks.selectOnValueChange?.(value)}>
      {children}
    </button>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button" role="combobox">
      {children}
    </button>
  )
}))

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    updateFindingField: mocks.updateFindingField
  })
}))

vi.mock("@/components/user-label.tsx", () => ({
  UserLabel: ({ userId }: { userId: string }) => (
    <span>{mocks.userLabels[userId] ?? ""}</span>
  )
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess
  }
}))

function resetQueries() {
  mocks.findingQuery = {
    data: mocks.finding,
    isLoading: false,
    isPending: false,
    isSuccess: true
  }
  mocks.assetQuery = {
    data: mocks.asset,
    isLoading: false,
    isPending: false,
    isSuccess: true
  }
}

describe("FindingDetailContent", () => {
  beforeEach(() => {
    resetQueries()
    mocks.selectOnValueChange = undefined
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.updateFindingField.mockReset()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders a placeholder while the finding is pending", async () => {
    const { FindingDetailContent } = await import(
      "@/components/finding-detail-content.tsx"
    )
    mocks.findingQuery = {
      isLoading: true,
      isPending: true,
      isSuccess: false
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    expect(screen.getByText("Finding details")).toBeTruthy()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })

  it("renders finding, asset, vulnerability, evidence, and user context", async () => {
    const { FindingDetailContent } = await import(
      "@/components/finding-detail-content.tsx"
    )

    render(
      <FindingDetailContent
        findingId={mocks.finding.id}
        titleAction={<button type="button">Edit finding</button>}
      />
    )

    expect(screen.getByRole("button", { name: "Edit finding" })).toBeTruthy()
    expect(screen.getAllByText("Exposed Admin Endpoint").length).toBeGreaterThan(
      0
    )
    expect(screen.getAllByText("High").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0)
    expect(screen.getAllByText("web-01").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Host").length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Validation" })).toBeTruthy()
    expect(screen.getByText(/Scanner reported/)).toBeTruthy()
    expect(screen.getByText("remote access")).toBeTruthy()
    expect(screen.getByText(/open port 8443/)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Impact" })).toBeTruthy()
    expect(screen.getByText(/Administrative interface is reachable/)).toBeTruthy()
    expect(screen.getByText("Alice Example")).toBeTruthy()
    expect(screen.getByText("Bob Example")).toBeTruthy()
  })

  it("updates editable severity, status, and source metadata", async () => {
    const { FindingDetailContent } = await import(
      "@/components/finding-detail-content.tsx"
    )

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    const editableSeverity = screen.getAllByText("High").at(-1)
    expect(editableSeverity).toBeTruthy()
    fireEvent.click(editableSeverity!)
    fireEvent.click(screen.getByRole("button", { name: "Critical" }))

    const editableStatus = screen.getAllByText("Active").at(-1)
    expect(editableStatus).toBeTruthy()
    fireEvent.click(editableStatus!)
    fireEvent.click(screen.getByRole("button", { name: "Confirmed" }))

    const editableSource = screen.getAllByText(FindingSource.Manual).at(-1)
    expect(editableSource).toBeTruthy()
    fireEvent.click(editableSource!)
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: FindingSource.Nuclei }
    })
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.finding,
        "severity",
        VulnerabilitySeverity.Critical
      )
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.finding,
        "status",
        FindingStatus.Confirmed
      )
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.finding,
        "source",
        FindingSource.Nuclei
      )
    })
  })

  it("copies evidence and reports success or failure", async () => {
    const { FindingDetailContent } = await import(
      "@/components/finding-detail-content.tsx"
    )
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWrite
      }
    })

    const { rerender } = render(
      <FindingDetailContent findingId={mocks.finding.id} />
    )

    fireEvent.click(screen.getByRole("button", { name: "Copy evidence" }))

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledWith(mocks.finding.evidence)
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Evidence copied")
    })

    clipboardWrite.mockRejectedValueOnce(new Error("Clipboard denied"))
    rerender(<FindingDetailContent findingId={mocks.finding.id} />)
    fireEvent.click(screen.getByRole("button", { name: "Copy evidence" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("Failed to copy evidence")
    })
  })

  it("renders fallbacks for empty evidence, unknown assets, and missing dates", async () => {
    const { FindingDetailContent } = await import(
      "@/components/finding-detail-content.tsx"
    )
    mocks.findingQuery = {
      data: {
        ...mocks.finding,
        evidence: "   ",
        firstSeen: null,
        lastSeen: null
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }
    mocks.assetQuery = {
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    expect(screen.getByText("No evidence available")).toBeTruthy()
    expect(
      screen.getByText(
        "This finding does not include validation notes or scanner output yet."
      )
    ).toBeTruthy()
    expect(screen.getAllByText("Unknown asset").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Unclassified").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Not available").length).toBeGreaterThanOrEqual(
      2
    )
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Copy evidence" })
        .disabled
    ).toBe(true)
  })

  it("keeps asset sections stable while linked asset data is loading", async () => {
    const { FindingDetailContent } = await import(
      "@/components/finding-detail-content.tsx"
    )
    mocks.assetQuery = {
      isLoading: true,
      isPending: true,
      isSuccess: false
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    expect(screen.getAllByText("Unknown asset").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Unclassified").length).toBeGreaterThan(0)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeTruthy()
  })
})
