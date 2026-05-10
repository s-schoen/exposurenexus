import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { FindingSource, FindingStatus } from "@exposurenexus/types/model/finding"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { ReactNode } from "react"
import type { Finding } from "@exposurenexus/types/model/finding"
import type { Asset, AssetType } from "@exposurenexus/types/model/asset"
import type { UserProfile } from "@exposurenexus/types/model/user"

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
    assigneeId: "7b2b7d98-6242-4efe-b630-5908727103fb",
    dueDate: null,
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
    ownerId: "8f5f4c3b-c369-481d-98f7-cf7148d80d21"
  }
  const users: Array<UserProfile> = [
    {
      id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
      username: "robin",
      displayName: "Robin Owner",
      email: "robin@example.com",
      enabled: false,
      roleIds: []
    },
    {
      id: "7b2b7d98-6242-4efe-b630-5908727103fb",
      username: "alex",
      displayName: "Alex Assignee",
      email: "alex@example.com",
      enabled: true,
      roleIds: []
    },
    {
      id: "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12",
      username: "casey",
      displayName: "Casey Handler",
      email: "casey@example.com",
      enabled: false,
      roleIds: []
    }
  ]
  const assetQuery: QueryState<Asset> = {
    data: asset,
    isLoading: false,
    isPending: false,
    isSuccess: true
  }
  const findingQuery: QueryState<Finding> = {
    data: finding,
    isLoading: false,
    isPending: false,
    isSuccess: true
  }
  const usersQuery: QueryState<Array<UserProfile>> = {
    data: users,
    isLoading: false,
    isPending: false,
    isSuccess: true
  }
  const userLabels: Record<string, string> = {
    "1f9c36d2-1355-49d1-8464-b01ce955d88f": "Alice Example",
    "4e33f42e-764b-4812-88fb-11a183d43434": "Bob Example",
    "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12": "Casey Handler",
    "7b2b7d98-6242-4efe-b630-5908727103fb": "Alex Assignee",
    "8f5f4c3b-c369-481d-98f7-cf7148d80d21": "Robin Owner"
  }

  return {
    asset,
    assetQuery,
    finding,
    findingQuery,
    selectOnValueChange: undefined as undefined | ((value: string) => void),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    updateFindingField: vi.fn(),
    users,
    usersQuery,
    userLabels
  }
})

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey?: Array<string> }) => {
    if (options.queryKey?.[0] === "assets") {
      return mocks.assetQuery
    }

    if (options.queryKey?.[0] === "users") {
      return mocks.usersQuery
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

vi.mock("@/api/user.ts", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"]
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

vi.mock("@/components/ui/popover.tsx", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ render: trigger }: { render: ReactNode }) => <>{trigger}</>
}))

vi.mock("@/components/ui/command.tsx", () => ({
  Command: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input aria-label={placeholder} />
  ),
  CommandItem: ({
    children,
    onSelect
  }: {
    children: ReactNode
    onSelect?: () => void
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    updateFindingField: mocks.updateFindingField
  })
}))

vi.mock("@/components/user-label.tsx", () => ({
  createUserProfileById: (users: Array<UserProfile> | undefined) =>
    new Map((users ?? []).map((user) => [user.id, user])),
  formatUserProfileReference: (
    userId: string | null | undefined,
    userProfileById: Map<string, UserProfile>,
    {
      emptyLabel = "No User",
      unknownLabel = "Unknown User"
    }: {
      emptyLabel?: string
      unknownLabel?: string
    } = {}
  ) => {
    if (!userId) {
      return emptyLabel
    }

    return userProfileById.get(userId)?.displayName ?? unknownLabel
  },
  UserLabel: ({
    emptyLabel = "No User",
    unknownLabel = "Unknown User",
    user,
    userId
  }: {
    emptyLabel?: string
    unknownLabel?: string
    user?: UserProfile | null
    userId?: string | null
  }) => {
    if (!userId && !user) {
      return <span>{emptyLabel}</span>
    }

    if (user) {
      return <span>{user.displayName}</span>
    }

    if (emptyLabel === "Unassigned" && typeof user === "undefined") {
      return <span>Loading Assignee</span>
    }

    return <span>{mocks.userLabels[userId ?? ""] ?? unknownLabel}</span>
  }
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
  mocks.usersQuery = {
    data: mocks.users,
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
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")
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
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

    render(
      <FindingDetailContent
        findingId={mocks.finding.id}
        titleAction={<button type="button">Edit finding</button>}
      />
    )

    expect(screen.getByRole("button", { name: "Edit finding" })).toBeTruthy()
    expect(
      screen.getAllByText("Exposed Admin Endpoint").length
    ).toBeGreaterThan(0)
    expect(screen.getAllByText("High").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0)
    expect(screen.getAllByText("web-01").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Host").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Robin Owner").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Alex Assignee").length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Validation" })).toBeTruthy()
    expect(screen.getByText(/Scanner reported/)).toBeTruthy()
    expect(screen.getByText("remote access")).toBeTruthy()
    expect(screen.getByText(/open port 8443/)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Impact" })).toBeTruthy()
    expect(
      screen.getByText(/Administrative interface is reachable/)
    ).toBeTruthy()
    expect(screen.getByText("Alice Example")).toBeTruthy()
    expect(screen.getByText("Bob Example")).toBeTruthy()
  })

  it("updates editable severity, status, and source metadata", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

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

  it("assigns and reassigns an existing finding from the assignee metadata", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    const editableAssignee = screen.getAllByText("Alex Assignee").at(-1)
    expect(editableAssignee).toBeTruthy()
    fireEvent.click(editableAssignee!)
    fireEvent.click(screen.getByText("Casey Handler"))

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.finding,
        "assigneeId",
        "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12"
      )
    })
  })

  it("assigns an unassigned finding and clears an existing assignee", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

    mocks.findingQuery = {
      data: {
        ...mocks.finding,
        assigneeId: null
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    const unassigned = render(
      <FindingDetailContent findingId={mocks.finding.id} />
    )

    const editableUnassigned = screen.getAllByText("Unassigned").at(-1)
    expect(editableUnassigned).toBeTruthy()
    fireEvent.click(editableUnassigned!)
    fireEvent.click(screen.getByText("Casey Handler"))

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.findingQuery.data,
        "assigneeId",
        "6a2bfca3-15b1-48aa-9dfd-d2cd3c15ea12"
      )
    })

    unassigned.unmount()
    mocks.updateFindingField.mockReset()
    mocks.findingQuery = {
      data: mocks.finding,
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    const editableAssignee = screen.getAllByText("Alex Assignee").at(-1)
    expect(editableAssignee).toBeTruthy()
    fireEvent.click(editableAssignee!)
    fireEvent.click(screen.getByText("Unassigned"))

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.finding,
        "assigneeId",
        null
      )
    })
  })

  it("sets, changes, and clears due dates from metadata", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

    const undated = render(
      <FindingDetailContent findingId={mocks.finding.id} />
    )

    const emptyDueDate = screen.getByText("No due date")
    fireEvent.click(emptyDueDate)
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "2026-05-06" }
    })
    fireEvent.keyDown(screen.getByDisplayValue("2026-05-06"), {
      key: "Enter"
    })

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.finding,
        "dueDate",
        new Date("2026-05-06T00:00:00.000Z")
      )
    })

    undated.unmount()
    mocks.updateFindingField.mockReset()
    mocks.findingQuery = {
      data: {
        ...mocks.finding,
        dueDate: new Date("2026-05-06T00:00:00.000Z")
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    const dated = render(<FindingDetailContent findingId={mocks.finding.id} />)

    fireEvent.click(screen.getByText("2026-05-06"))
    fireEvent.change(screen.getByDisplayValue("2026-05-06"), {
      target: { value: "2026-05-07" }
    })
    fireEvent.keyDown(screen.getByDisplayValue("2026-05-07"), {
      key: "Enter"
    })

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.findingQuery.data,
        "dueDate",
        new Date("2026-05-07T00:00:00.000Z")
      )
    })

    dated.unmount()
    mocks.updateFindingField.mockReset()

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    fireEvent.click(screen.getByText("2026-05-06"))
    fireEvent.change(screen.getByDisplayValue("2026-05-06"), {
      target: { value: "" }
    })
    fireEvent.keyDown(screen.getByDisplayValue(""), { key: "Enter" })

    await waitFor(() => {
      expect(mocks.updateFindingField).toHaveBeenCalledWith(
        mocks.findingQuery.data,
        "dueDate",
        null
      )
    })
  })

  it("copies evidence and reports success or failure", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")
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

  it("renders fallbacks for empty evidence and unknown assets", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")
    mocks.findingQuery = {
      data: {
        ...mocks.finding,
        evidence: "   "
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
    expect(screen.getAllByText("Unknown Asset").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Unclassified").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0)
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Copy evidence" })
        .disabled
    ).toBe(true)
  })

  it("renders responsible owner fallbacks for ownerless assets and unknown users", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

    mocks.assetQuery = {
      data: {
        ...mocks.asset,
        ownerId: null
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    const ownerless = render(
      <FindingDetailContent findingId={mocks.finding.id} />
    )

    expect(screen.getAllByText("No Owner").length).toBeGreaterThan(0)

    ownerless.unmount()
    mocks.assetQuery = {
      data: {
        ...mocks.asset,
        ownerId: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206"
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }
    mocks.usersQuery = {
      data: [],
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    expect(screen.getAllByText("Unknown Owner").length).toBeGreaterThan(0)
  })

  it("renders assignee fallbacks for unassigned and unknown users", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")

    mocks.findingQuery = {
      data: {
        ...mocks.finding,
        assigneeId: null
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    const unassigned = render(
      <FindingDetailContent findingId={mocks.finding.id} />
    )

    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0)

    unassigned.unmount()
    mocks.findingQuery = {
      data: {
        ...mocks.finding,
        assigneeId: "9d760e21-9439-4fa9-b708-8e2a30a80895"
      },
      isLoading: false,
      isPending: false,
      isSuccess: true
    }
    mocks.usersQuery = {
      data: [],
      isLoading: false,
      isPending: false,
      isSuccess: true
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    expect(screen.getAllByText("Unknown Assignee").length).toBeGreaterThan(0)
  })

  it("renders assignee loading state while user profiles are loading", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")
    mocks.usersQuery = {
      isLoading: true,
      isPending: true,
      isSuccess: false
    }

    render(<FindingDetailContent findingId={mocks.finding.id} />)

    expect(screen.getAllByText("Loading Assignee").length).toBeGreaterThan(0)
  })

  it("keeps asset sections stable while linked asset data is loading", async () => {
    const { FindingDetailContent } =
      await import("@/components/finding-detail-content.tsx")
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
