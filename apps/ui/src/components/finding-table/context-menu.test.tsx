import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FindingContextMenu } from "@/components/finding-table/context-menu.tsx";
import type { Finding } from "@exposurenexus/types/model/finding";
import type { ReactElement, ReactNode, RefObject } from "react";

vi.mock("@/components/ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  ContextMenuTrigger: ({ render: trigger }: { render: ReactElement }) => trigger,
}));

const finding: Finding = {
  id: "2713d833-eb13-4517-ac7c-7761545ed42a",
  assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
  title: "Exposed Admin Endpoint",
  severity: VulnerabilitySeverity.High,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilities: [],
  observationCount: 0,
  observingSources: [],
  firstSeen: null,
  lastSeen: null,
  createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
  updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

function renderContextMenu(
  Component: typeof FindingContextMenu,
  findings: Array<Finding>,
  onDelete = vi.fn(),
) {
  const findingsRef = { current: findings } as RefObject<Array<Finding>>;

  return render(
    <Component findingsRef={findingsRef} onDelete={onDelete}>
      <button type="button">Selected row</button>
    </Component>,
  );
}

describe("FindingContextMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the selected count and deletion action without legacy workflow controls", async () => {
    const { FindingContextMenu } = await import("@/components/finding-table/context-menu.tsx");

    renderContextMenu(FindingContextMenu, [finding]);

    expect(screen.getByText("1 finding selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
    expect(screen.queryByText("Set Status")).toBeNull();
    expect(screen.queryByText("Set Severity")).toBeNull();
  });

  it("delegates deletion for multiple selected findings", async () => {
    const { FindingContextMenu } = await import("@/components/finding-table/context-menu.tsx");
    const onDelete = vi.fn();

    renderContextMenu(
      FindingContextMenu,
      [finding, { ...finding, id: "73e8f746-a620-4996-909b-60b99f52e9a2" }],
      onDelete,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
  });
});
