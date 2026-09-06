import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TriageFindingsPage } from "@/features/findings/pages/triage-findings-page.tsx";

import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { ReactNode } from "react";

type NavigateCall = {
  replace?: boolean;
  search?: unknown;
  to?: string;
};

type SearchUpdater = (previous: Record<string, unknown>) => Record<string, unknown>;

type RouteState = {
  search: Record<string, unknown>;
  selected?: string;
};

const mocks = vi.hoisted(() => ({
  finding: {
    id: "2713d833-eb13-4517-ac7c-7761545ed42a",
    assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    title: "Triage finding",
    severity: "high",
    status: "active",
    mitigation: null,
    assigneeId: null,
    dueDate: null,
    weakness: { identifiers: {} },
    affectedResource: { type: "unspecified" },
    vulnerabilities: [],
    observationCount: 1,
    firstSeen: new Date("2026-01-02T00:00:00.000Z"),
    lastSeen: new Date("2026-01-03T00:00:00.000Z"),
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
  } as Finding,
  navigate: vi.fn(),
  useFindingTableSearchState: vi.fn(() => ({
    filterState: { status: [FindingStatus.Active] },
    onFilterStateChange: vi.fn(),
  })),
  usePageMeta: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/features/findings/hooks/use-finding-table-search-state.ts", () => ({
  useFindingTableSearchState: mocks.useFindingTableSearchState,
}));

vi.mock("@/features/findings/components/finding-table/index.tsx", () => ({
  FindingTable: ({
    initialGrouping,
    onSelectFinding,
    selectedFindingId,
  }: {
    initialGrouping?: Array<string>;
    onSelectFinding?: (finding: Finding) => void;
    selectedFindingId?: string;
  }) => (
    <div>
      <div
        data-testid="finding-table"
        data-initial-grouping={initialGrouping?.join(",")}
        data-selected-finding-id={selectedFindingId}
      />
      <button type="button" onClick={() => onSelectFinding?.(mocks.finding)}>
        Select triage finding
      </button>
    </div>
  ),
}));

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: ({
    children,
    description,
    fullPageHref,
    onClose,
    selectedId,
    title,
  }: {
    children: ReactNode;
    description: string;
    fullPageHref?: string;
    onClose: () => void;
    selectedId?: string;
    title: string;
  }) =>
    selectedId ? (
      <section aria-label={title} data-selected-id={selectedId} role="dialog">
        <p>{description}</p>
        {fullPageHref ? <a href={fullPageHref}>Open full page</a> : null}
        <button type="button" onClick={onClose}>
          Close preview
        </button>
        {children}
      </section>
    ) : null,
}));

function StatefulTriageRoute({ initialSearch = {} }: { initialSearch?: Record<string, unknown> }) {
  const [routeState, setRouteState] = useState<RouteState>({
    search: initialSearch,
    selected: typeof initialSearch.selected === "string" ? initialSearch.selected : undefined,
  });

  mocks.navigate.mockImplementation((options: NavigateCall) => {
    if (options.to !== "/findings/triage" || typeof options.search !== "function") return;

    const updateSearch = options.search as SearchUpdater;
    setRouteState((current) => {
      const nextSearch = updateSearch({
        ...current.search,
        selected: current.selected,
      });

      return {
        search: nextSearch,
        selected: typeof nextSearch.selected === "string" ? nextSearch.selected : undefined,
      };
    });
  });

  return <TriageFindingsPage search={routeState.search} selected={routeState.selected} />;
}

vi.mock("@/features/findings/components/finding-preview.tsx", () => ({
  FindingPreview: ({ findingId }: { findingId: string }) => (
    <div>Finding detail for {findingId}</div>
  ),
}));

describe("TriageFindingsPage", () => {
  beforeEach(() => {
    mocks.useFindingTableSearchState.mockReturnValue({
      filterState: { status: [FindingStatus.Active] },
      onFilterStateChange: vi.fn(),
    });
    mocks.usePageMeta.mockReset();
    mocks.navigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("configures the triage queue search state and preview", () => {
    render(
      <TriageFindingsPage
        search={{ selected: "2713d833-eb13-4517-ac7c-7761545ed42a" }}
        selected="2713d833-eb13-4517-ac7c-7761545ed42a"
      />,
    );

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Triage Queue",
      description: "Work through active findings in a queue optimized for repetitive triage.",
    });
    expect(mocks.useFindingTableSearchState).toHaveBeenCalledWith({
      search: { selected: "2713d833-eb13-4517-ac7c-7761545ed42a" },
      to: "/findings/triage",
      defaultStatusFilter: [FindingStatus.Active],
    });
    expect(screen.getByTestId("finding-table")).toHaveAttribute("data-initial-grouping", "assetId");
    expect(
      screen.getByText("Finding detail for 2713d833-eb13-4517-ac7c-7761545ed42a"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      "/findings/2713d833-eb13-4517-ac7c-7761545ed42a",
    );
  });

  it("selects a triage row, opens its full-page link, and clears only selected from search", async () => {
    const actor = userEvent.setup();
    const initialSearch = {
      filter: "admin",
      severity: ["high"],
      status: ["active"],
      assignee: ["__unassigned_assignee__"],
    };
    render(<StatefulTriageRoute initialSearch={initialSearch} />);

    expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
    await actor.click(screen.getByRole("button", { name: "Select triage finding" }));

    expect(await screen.findByText(`Finding detail for ${mocks.finding.id}`)).toBeVisible();
    expect(screen.getByRole("link", { name: "Open full page" })).toHaveAttribute(
      "href",
      `/findings/${mocks.finding.id}`,
    );
    const selectCall = mocks.navigate.mock.calls[0][0] as NavigateCall;
    expect(selectCall).toMatchObject({ to: "/findings/triage", replace: true });
    const selectedSearch = selectCall.search as SearchUpdater;
    expect(selectedSearch({ ...initialSearch, selected: undefined })).toEqual({
      ...initialSearch,
      selected: mocks.finding.id,
    });

    await actor.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
    const closeCall = mocks.navigate.mock.calls[1][0] as NavigateCall;
    expect(closeCall).toMatchObject({ to: "/findings/triage", replace: true });
    const clearedSearch = closeCall.search as SearchUpdater;
    expect(
      clearedSearch({ ...initialSearch, selected: mocks.finding.id, unrelated: "preserved" }),
    ).toEqual({
      ...initialSearch,
      selected: undefined,
      unrelated: "preserved",
    });
  });
});
