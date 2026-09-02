import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  VulnerabilityCatalog,
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const vulnerability: VulnerabilityCatalog = {
    id: "9d7acdd0-fad1-46c9-8218-1793f421f0fe",
    type: "cve" as VulnerabilityType,
    identifier: "CVE-2026-0001",
    title: "Exposed Admin Endpoint",
    severity: "high" as VulnerabilitySeverity,
    description: "Administrative interface is reachable externally",
    metadata: { cwe: 284 },
    createdBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    updatedBy: "1f9c36d2-1355-49d1-8464-b01ce955d88f",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  };

  return {
    confirmDelete: vi.fn(),
    deleteVulnerabilities: vi.fn(),
    dialogProps: undefined as undefined | Record<string, unknown>,
    navigate: vi.fn(),
    usePageMeta: vi.fn(),
    vulnerability,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/hooks/use-vulnerability-lifecycle.ts", () => ({
  useVulnerabilityLifecycle: () => ({
    deleteVulnerabilities: mocks.deleteVulnerabilities,
  }),
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDelete,
  },
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/components/vulnerability-table", () => ({
  VulnerabilityTable: ({
    filterState,
    onCreateVulnerability,
    onDeleteVulnerabilities,
    onFilterStateChange,
    onSelectVulnerability,
    selectedVulnerabilityId,
  }: {
    filterState?: unknown;
    onCreateVulnerability?: () => void;
    onDeleteVulnerabilities?: (vulnerabilities: Array<VulnerabilityCatalog>) => Promise<void>;
    onFilterStateChange?: (filterState: {
      globalFilter: string;
      selectFilters: Record<string, Array<string>>;
    }) => void;
    onSelectVulnerability?: (vulnerability: VulnerabilityCatalog) => void;
    selectedVulnerabilityId?: string;
  }) => (
    <div>
      <div data-testid="selected-vulnerability">{selectedVulnerabilityId}</div>
      <div data-testid="filter-state">{JSON.stringify(filterState)}</div>
      <button type="button" onClick={() => onSelectVulnerability?.(mocks.vulnerability)}>
        select vulnerability
      </button>
      <button type="button" onClick={onCreateVulnerability}>
        create vulnerability
      </button>
      <button
        type="button"
        onClick={() => {
          void onDeleteVulnerabilities?.([mocks.vulnerability]);
        }}
      >
        delete vulnerability
      </button>
      <button
        type="button"
        onClick={() =>
          onFilterStateChange?.({
            globalFilter: "remote code",
            selectFilters: {
              severity: ["critical"],
              type: ["cve"],
            },
          })
        }
      >
        change filters
      </button>
    </div>
  ),
}));

vi.mock("@/components/detail-preview-dialog.tsx", () => ({
  DetailPreviewDialog: (props: {
    children?: ReactNode;
    description: string;
    fullPageHref?: string;
    onClose: () => void;
    selectedId?: string;
    title: string;
  }) => {
    mocks.dialogProps = props;

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
    );
  },
}));

vi.mock("@/components/vulnerability-detail-content.tsx", () => ({
  VulnerabilityDetailContent: ({ vulnerabilityId }: { vulnerabilityId: string }) => (
    <div>Detail for {vulnerabilityId}</div>
  ),
}));

describe("VulnerabilitiesPage", () => {
  beforeEach(() => {
    mocks.confirmDelete.mockReset();
    mocks.confirmDelete.mockResolvedValue(true);
    mocks.deleteVulnerabilities.mockReset();
    mocks.deleteVulnerabilities.mockResolvedValue({
      successful: [mocks.vulnerability],
      failed: [],
    });
    mocks.dialogProps = undefined;
    mocks.navigate.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("passes route-owned filters and preview metadata to the table", async () => {
    const { VulnerabilitiesPage } =
      await import("@/features/vulnerabilities/components/vulnerabilities-page.tsx");

    render(
      <VulnerabilitiesPage
        search={{ filter: "openssl", severity: "critical,high", type: "cve,ghsa" }}
      />,
    );

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Vulnerabilities",
      description: "Browse catalog entries and inspect their enrichment metadata.",
    });
    expect(screen.getByText("Catalog entry details")).toBeTruthy();
    expect(
      screen.getByText(
        "Review the selected catalog entry without leaving the vulnerability table.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("selected-vulnerability").textContent).toBe("");
    expect(JSON.parse(screen.getByTestId("filter-state").textContent)).toEqual({
      globalFilter: "openssl",
      selectFilters: {
        severity: ["critical", "high"],
        type: ["cve", "ghsa"],
      },
    });
    expect(screen.getByTestId("full-page-href").textContent).toBe("");
  });

  it("updates route-owned filters and preserves unrelated search params", async () => {
    const { VulnerabilitiesPage } =
      await import("@/features/vulnerabilities/components/vulnerabilities-page.tsx");

    render(<VulnerabilitiesPage />);
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities",
      replace: true,
      search: expect.any(Function),
    });

    const search = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(search({ page: "2", selected: "vulnerability-1" })).toEqual({
      filter: "remote code",
      page: "2",
      selected: "vulnerability-1",
      severity: "critical",
      type: "cve",
    });
  });

  it("selects vulnerabilities and renders the selected preview content", async () => {
    const { VulnerabilitiesPage } =
      await import("@/features/vulnerabilities/components/vulnerabilities-page.tsx");

    render(<VulnerabilitiesPage selected={mocks.vulnerability.id} />);

    expect(screen.getByTestId("selected-vulnerability").textContent).toBe(mocks.vulnerability.id);
    expect(screen.getByTestId("full-page-href").textContent).toBe(
      `/vulnerabilities/${mocks.vulnerability.id}`,
    );
    expect(screen.getByText(`Detail for ${mocks.vulnerability.id}`)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /select vulnerability/i }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities",
      search: expect.any(Function),
    });

    const selectSearch = mocks.navigate.mock.calls[0][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(selectSearch({ filter: "admin" })).toEqual({
      filter: "admin",
      selected: mocks.vulnerability.id,
    });

    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    const closeSearch = mocks.navigate.mock.calls[1][0].search as (
      previous: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(closeSearch({ selected: mocks.vulnerability.id })).toEqual({
      selected: undefined,
    });
  });

  it("navigates to the create vulnerability route", async () => {
    const { VulnerabilitiesPage } =
      await import("@/features/vulnerabilities/components/vulnerabilities-page.tsx");

    render(<VulnerabilitiesPage />);

    fireEvent.click(screen.getByRole("button", { name: /create vulnerability/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities/new",
    });
  });

  it("confirms selected vulnerability deletion and clears deleted selection", async () => {
    const { VulnerabilitiesPage } =
      await import("@/features/vulnerabilities/components/vulnerabilities-page.tsx");

    render(<VulnerabilitiesPage selected={mocks.vulnerability.id} />);

    fireEvent.click(screen.getByRole("button", { name: /delete vulnerability/i }));

    await waitFor(() => {
      expect(mocks.confirmDelete).toHaveBeenCalledWith({
        title: "Delete Vulnerabilities",
        description: "This action cannot be undone",
        message:
          "Are you sure you want to delete 1 catalog entry? Linked enrichment will be removed while findings and observations are preserved.",
        confirmVariant: "destructive",
      });
      expect(mocks.deleteVulnerabilities).toHaveBeenCalledWith([mocks.vulnerability]);
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/vulnerabilities",
      search: expect.any(Function),
    });
  });

  it("leaves the selected preview open when lifecycle reports delete failure", async () => {
    mocks.deleteVulnerabilities.mockResolvedValueOnce({
      successful: [],
      failed: [
        {
          vulnerability: mocks.vulnerability,
          error: new Error("Delete failed"),
        },
      ],
    });
    const { VulnerabilitiesPage } =
      await import("@/features/vulnerabilities/components/vulnerabilities-page.tsx");

    render(<VulnerabilitiesPage selected={mocks.vulnerability.id} />);

    fireEvent.click(screen.getByRole("button", { name: /delete vulnerability/i }));

    await waitFor(() => {
      expect(mocks.deleteVulnerabilities).toHaveBeenCalledWith([mocks.vulnerability]);
    });
    expect(mocks.navigate).not.toHaveBeenCalledWith({
      to: "/vulnerabilities",
      search: expect.any(Function),
    });
  });
});
