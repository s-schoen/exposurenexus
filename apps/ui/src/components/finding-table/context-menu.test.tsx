import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { FindingStatus } from "@openvlp/types/model/finding"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { ReactElement, ReactNode, RefObject } from "react"
import type { Finding } from "@openvlp/types/model/finding"
import type { FindingContextMenu } from "@/components/finding-table/context-menu.tsx"

const mocks = vi.hoisted(() => ({
  bulkUpdateFindingField: vi.fn()
}))

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    bulkUpdateFindingField: mocks.bulkUpdateFindingField
  })
}))

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuItem: ({
    children,
    onClick
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuSub: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ContextMenuTrigger: ({ render: trigger }: { render: ReactElement }) => trigger
}))

const finding: Finding = {
  id: "2713d833-eb13-4517-ac7c-7761545ed42a",
  vulnerabilityId: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  source: "manual",
  evidence: "Observed exposed admin endpoint",
  mitigation: "Restrict access to internal networks",
  assigneeId: null,
  dueDate: null,
  firstSeen: new Date("2026-01-02T00:00:00.000Z"),
  lastSeen: new Date("2026-01-03T00:00:00.000Z"),
  fingerprint: "fingerprint-1",
  assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
  updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  vulnerability: {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    title: "Exposed Admin Endpoint",
    severity: VulnerabilitySeverity.High,
    description: "Administrative interface is reachable externally",
    cwe: 284,
    cve: null,
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  }
}

type FindingContextMenuComponent = typeof FindingContextMenu

function renderContextMenu(
  Component: FindingContextMenuComponent,
  findings: Array<Finding>,
  onDelete = vi.fn()
) {
  const findingsRef = { current: findings } as RefObject<Array<Finding>>

  return {
    onDelete,
    ...render(
      <Component findingsRef={findingsRef} onDelete={onDelete}>
        <button type="button">Selected row</button>
      </Component>
    )
  }
}

describe("FindingContextMenu", () => {
  beforeEach(() => {
    mocks.bulkUpdateFindingField.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it("renders selected count and all status/severity actions", async () => {
    const { FindingContextMenu } = await import(
      "@/components/finding-table/context-menu.tsx"
    )

    renderContextMenu(FindingContextMenu, [finding])

    expect(screen.getByText("1 finding selected")).toBeTruthy()
    expect(screen.getByText("Set Status")).toBeTruthy()
    expect(screen.getByText("Set Severity")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Confirmed" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Critical" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy()
  })

  it("updates selected findings and deletes from menu actions", async () => {
    const { FindingContextMenu } = await import(
      "@/components/finding-table/context-menu.tsx"
    )
    const secondFinding = {
      ...finding,
      id: "73e8f746-a620-4996-909b-60b99f52e9a2",
      status: FindingStatus.Confirmed
    }
    const selectedFindings = [finding, secondFinding]
    const { onDelete } = renderContextMenu(FindingContextMenu, selectedFindings)

    expect(screen.getByText("2 findings selected")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Mitigated" }))
    fireEvent.click(screen.getByRole("button", { name: "Critical" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(mocks.bulkUpdateFindingField).toHaveBeenCalledWith(
        selectedFindings,
        "status",
        FindingStatus.Mitigated
      )
      expect(mocks.bulkUpdateFindingField).toHaveBeenCalledWith(
        selectedFindings,
        "severity",
        VulnerabilitySeverity.Critical
      )
    })
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
