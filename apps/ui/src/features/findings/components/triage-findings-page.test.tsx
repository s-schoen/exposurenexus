import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TriageFindingsPage } from "@/features/findings/components/triage-findings-page.tsx";

import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  clearSelected: vi.fn(),
  onFilterStateChange: vi.fn(),
  selectRow: vi.fn(),
  useFindingTableSearchState: vi.fn(() => ({
    filterState: { status: [FindingStatus.Active] },
    onFilterStateChange: vi.fn(),
  })),
  usePageMeta: vi.fn(),
  useSelectedSearchParam: vi.fn(() => ({
    clearSelected: vi.fn(),
    selectRow: vi.fn(),
    selectedId: undefined as string | undefined,
  })),
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/hooks/use-finding-table-search-state.ts", () => ({
  useFindingTableSearchState: mocks.useFindingTableSearchState,
}));

vi.mock("@/hooks/use-selected-search-param.ts", () => ({
  useSelectedSearchParam: mocks.useSelectedSearchParam,
}));

vi.mock("@/components/finding-table", () => ({
  FindingTable: ({
    initialGrouping,
    selectedFindingId,
  }: {
    initialGrouping?: Array<string>;
    selectedFindingId?: string;
  }) => (
    <div
      data-testid="finding-table"
      data-initial-grouping={initialGrouping?.join(",")}
      data-selected-finding-id={selectedFindingId}
    />
  ),
}));

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: ({
    children,
    description,
    fullPageHref,
    selectedId,
    title,
  }: {
    children: ReactNode;
    description: string;
    fullPageHref?: string;
    selectedId?: string;
    title: string;
  }) => (
    <section aria-label={title} data-selected-id={selectedId}>
      <p>{description}</p>
      {fullPageHref ? <a href={fullPageHref}>Open full page</a> : null}
      {children}
    </section>
  ),
}));

vi.mock("@/components/finding-detail-content.tsx", () => ({
  FindingDetailContent: ({ findingId }: { findingId: string }) => (
    <div>Finding detail for {findingId}</div>
  ),
}));

describe("TriageFindingsPage", () => {
  beforeEach(() => {
    mocks.onFilterStateChange = vi.fn();
    mocks.clearSelected = vi.fn();
    mocks.selectRow = vi.fn();
    mocks.useFindingTableSearchState.mockReturnValue({
      filterState: { status: [FindingStatus.Active] },
      onFilterStateChange: mocks.onFilterStateChange,
    });
    mocks.usePageMeta.mockReset();
    mocks.useSelectedSearchParam.mockReturnValue({
      clearSelected: mocks.clearSelected,
      selectRow: mocks.selectRow,
      selectedId: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });
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
    expect(mocks.useSelectedSearchParam).toHaveBeenCalledWith({
      selectedId: "2713d833-eb13-4517-ac7c-7761545ed42a",
      to: "/findings/triage",
      replace: true,
      getId: expect.any(Function),
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
});
