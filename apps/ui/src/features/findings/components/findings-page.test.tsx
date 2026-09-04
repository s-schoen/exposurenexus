import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FindingsPage } from "@/features/findings/components/findings-page.tsx";

import type { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

type NavigateCall = {
  params?: Record<string, unknown>;
  replace?: boolean;
  search?: unknown;
  to?: string;
};

type SearchUpdater = (previous: Record<string, unknown>) => Record<string, unknown>;

interface RouteState {
  search: Record<string, unknown>;
  selected?: string;
}

interface QueryOptionsLike {
  queryKey: ReadonlyArray<unknown>;
}

const mocks = vi.hoisted(() => {
  const users: Array<UserProfile> = [
    {
      id: "1fab3f6c-4b82-4a52-a5d0-59d9c33f8206",
      username: "alex",
      displayName: "Alex Assignee",
      email: "alex@example.com",
      enabled: true,
      roleIds: [],
    },
  ];
  const assets: Array<Asset> = [
    {
      id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      displayName: "api-01",
      type: "host" as Asset["type"],
      environment: "production" as Asset["environment"],
      lifecycleState: "active" as Asset["lifecycleState"],
      ownerId: users[0].id,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: users[0].id,
      updatedBy: users[0].id,
    },
  ];
  const findings: Array<Finding> = [
    {
      id: "2713d833-eb13-4517-ac7c-7761545ed42a",
      assetId: assets[0].id,
      title: "Exposed Admin Endpoint",
      severity: "high" as Finding["severity"],
      status: "active" as Finding["status"],
      mitigation: "Restrict access to internal networks",
      assigneeId: users[0].id,
      dueDate: null,
      weakness: { identifiers: { cwe: ["CWE-200"] } },
      affectedResource: { type: "unspecified" as AffectedResourceType.Unspecified },
      vulnerabilities: [],
      observationCount: 2,
      firstSeen: new Date("2026-01-02T00:00:00.000Z"),
      lastSeen: new Date("2026-01-03T00:00:00.000Z"),
      createdBy: users[0].id,
      updatedBy: users[0].id,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    },
    {
      id: "3703bd68-5d5e-4209-90dc-365bc7030f67",
      assetId: assets[0].id,
      title: "Outdated API Dependency",
      severity: "medium" as Finding["severity"],
      status: "confirmed" as Finding["status"],
      mitigation: null,
      assigneeId: null,
      dueDate: null,
      weakness: { identifiers: {} },
      affectedResource: { type: "unspecified" as AffectedResourceType.Unspecified },
      vulnerabilities: [],
      observationCount: 0,
      firstSeen: null,
      lastSeen: null,
      createdBy: users[0].id,
      updatedBy: users[0].id,
      createdAt: new Date("2026-01-04T00:00:00.000Z"),
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
    },
  ];

  return {
    assets,
    confirmDelete: vi.fn(),
    deleteFindings: vi.fn(),
    findings,
    navigate: vi.fn(),
    users,
    usePageMeta: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: QueryOptionsLike) => {
    const queryKey = options.queryKey.join("/");

    if (queryKey === "findings") {
      return {
        data: mocks.findings,
        isFetching: false,
        isPending: false,
        isSuccess: true,
        refetch: vi.fn(),
      };
    }

    if (queryKey === "assets") {
      return {
        data: mocks.assets,
        isFetching: false,
        isPending: false,
        isSuccess: true,
        refetch: vi.fn(),
      };
    }

    if (queryKey === "users") {
      return {
        data: mocks.users,
        isFetching: false,
        isPending: false,
        isSuccess: true,
        refetch: vi.fn(),
      };
    }

    throw new Error(`Unhandled query key ${queryKey}`);
  },
}));

vi.mock("@/api/asset.ts", () => ({
  createListAssetsQueryOptions: () => ({
    queryKey: ["assets"],
  }),
}));

vi.mock("@/api/finding.ts", () => ({
  createListFindingsQueryOptions: () => ({
    queryKey: ["findings"],
  }),
}));

vi.mock("@/features/users", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"],
  }),
  createUserProfileById: (users: Array<UserProfile> | undefined) =>
    new Map((users ?? []).map((user) => [user.id, user])),
  formatUserProfileReference: (
    userId: string | null | undefined,
    usersById: Map<string, UserProfile>,
    {
      emptyLabel = "No User",
      unknownLabel = "Unknown User",
    }: {
      emptyLabel?: string;
      unknownLabel?: string;
    } = {},
  ) => (!userId ? emptyLabel : (usersById.get(userId)?.displayName ?? unknownLabel)),
  getUserProfileDisplayName: (user: UserProfile) => user.displayName,
  UserLabel: ({ user }: { user?: UserProfile | null }) => (
    <span>{user?.displayName ?? "No User"}</span>
  ),
}));

vi.mock("@/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    deleteFindings: mocks.deleteFindings,
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
      <section aria-label={title} role="dialog">
        <p>{description}</p>
        {fullPageHref && <a href={fullPageHref}>Open full page</a>}
        <button type="button" onClick={onClose}>
          Close
        </button>
        {children}
      </section>
    ) : null,
}));

vi.mock("@/components/finding-detail-content.tsx", () => ({
  FindingDetailContent: ({ findingId }: { findingId: string }) => (
    <div>Finding detail for {findingId}</div>
  ),
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

function StatefulFindingsPage({
  initialSearch = {},
  initialSelected,
}: {
  initialSearch?: Record<string, unknown>;
  initialSelected?: string;
}) {
  const [routeState, setRouteState] = useState<RouteState>({
    search: initialSearch,
    selected: initialSelected,
  });

  mocks.navigate.mockImplementation((options: NavigateCall) => {
    if (options.to !== "/findings" || typeof options.search !== "function") {
      return;
    }

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

  return <FindingsPage search={routeState.search} selected={routeState.selected} />;
}

function renderFindingsRoute({
  initialSearch,
  initialSelected,
}: {
  initialSearch?: Record<string, unknown>;
  initialSelected?: string;
} = {}) {
  return render(
    <StatefulFindingsPage initialSearch={initialSearch} initialSelected={initialSelected} />,
  );
}

describe("FindingsPage", () => {
  beforeEach(() => {
    mocks.confirmDelete.mockReset();
    mocks.confirmDelete.mockResolvedValue(true);
    mocks.deleteFindings.mockReset();
    mocks.deleteFindings.mockResolvedValue({
      successful: mocks.findings,
      failed: [],
    });
    mocks.navigate.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens and closes the selected finding preview", async () => {
    const user = userEvent.setup();

    renderFindingsRoute();

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Findings",
      description:
        "Track active findings, assignment, severity, and mitigation status across assets.",
    });

    const findingRow = screen.getByText("Exposed Admin Endpoint").closest("tr");

    if (!findingRow) {
      throw new Error("Expected finding row");
    }

    fireEvent.click(findingRow);

    expect(await screen.findByText(`Finding detail for ${mocks.findings[0].id}`)).toBeVisible();
    expect(screen.getByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      `/findings/${mocks.findings[0].id}`,
    );

    await user.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByTestId("data-table-active-row")).not.toBeInTheDocument();
    });
  });

  it("updates visible finding results from route-owned search state", async () => {
    const user = userEvent.setup();

    renderFindingsRoute();
    await user.type(
      screen.getByRole("textbox", { name: /search across visible columns/i }),
      "dependency",
    );

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(screen.getByText("Outdated API Dependency")).toBeVisible();
      expect(screen.queryByText("Exposed Admin Endpoint")).not.toBeInTheDocument();
    });
  });

  it("navigates to new finding and deletes selected findings", async () => {
    const user = userEvent.setup();

    renderFindingsRoute();

    await user.click(screen.getByRole("button", { name: /new finding/i }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/findings/new",
    });

    await user.click(screen.getByLabelText("Select all"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mocks.confirmDelete).toHaveBeenCalledWith({
        title: "Delete Findings",
        description: "This action cannot be undone",
        message: "Are you sure you want to delete 2 findings(s)?",
        confirmVariant: "destructive",
      });
      expect(mocks.deleteFindings).toHaveBeenCalledWith(mocks.findings);
    });
  });
});
