import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssetsPage } from "@/features/assets/pages/assets-page.tsx";

import type { AssetWithCustomFields, CreateAsset } from "@exposurenexus/contracts/model/asset";
import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";
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
      id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      username: "robin",
      displayName: "Robin Owner",
      email: "robin@example.com",
      enabled: true,
      roleIds: [],
    },
  ];
  const assets: Array<AssetWithCustomFields> = [
    {
      id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      displayName: "api-01",
      type: "host" as AssetWithCustomFields["type"],
      environment: "production" as AssetWithCustomFields["environment"],
      lifecycleState: "active" as AssetWithCustomFields["lifecycleState"],
      ownerId: users[0].id,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: users[0].id,
      updatedBy: users[0].id,
      customFields: [],
    },
    {
      id: "0bb9b410-7763-4e7a-9942-b752367fd63d",
      displayName: "worker-02",
      type: "software" as AssetWithCustomFields["type"],
      environment: "unknown" as AssetWithCustomFields["environment"],
      lifecycleState: "active" as AssetWithCustomFields["lifecycleState"],
      ownerId: null,
      identifiers: [],
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: users[0].id,
      updatedBy: users[0].id,
      customFields: [],
    },
  ];
  const createdAsset: CreateAsset = {
    displayName: "queue-01",
    type: "host" as CreateAsset["type"],
    environment: "unknown" as NonNullable<CreateAsset["environment"]>,
    lifecycleState: "active" as NonNullable<CreateAsset["lifecycleState"]>,
    ownerId: null,
    identifiers: [],
  };
  const assetListOptions: unknown = undefined;

  return {
    assetDialogCall: vi.fn(),
    assetListOptions,
    assets,
    confirmDelete: vi.fn(),
    createAsset: vi.fn(),
    customFieldDefinitions: [] as Array<AssetCustomFieldDefinition>,
    deleteAssets: vi.fn(),
    navigate: vi.fn(),
    createdAsset,
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

    if (queryKey === "assets/with-custom-fields") {
      return {
        data: mocks.assets,
        isFetching: false,
        isPending: false,
        isSuccess: true,
        refetch: vi.fn(),
      };
    }

    if (queryKey === "asset-custom-fields") {
      return {
        data: mocks.customFieldDefinitions,
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

vi.mock("@/features/assets/queries/assets.ts", () => ({
  createListAssetsWithCustomFieldsQueryOptions: (options?: unknown) => {
    mocks.assetListOptions = options;

    return {
      queryKey: ["assets", "with-custom-fields"],
    };
  },
}));

vi.mock("@/features/custom-fields", () => ({
  createListAssetCustomFieldDefinitionsQueryOptions: () => ({
    queryKey: ["asset-custom-fields"],
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
  UserLabel: ({ user }: { user?: UserProfile | null }) => (
    <span>{user?.displayName ?? "No User"}</span>
  ),
}));

vi.mock("@/features/assets/hooks/use-asset-lifecycle.ts", () => ({
  useAssetLifecycle: () => ({
    createAsset: mocks.createAsset,
    deleteAssets: mocks.deleteAssets,
  }),
}));

vi.mock("@/features/assets/components/asset-dialog.tsx", () => ({
  AssetDialog: {
    call: mocks.assetDialogCall,
  },
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

vi.mock("@/features/assets/components/asset-detail-content.tsx", () => ({
  AssetDetailContent: ({ assetId }: { assetId: string }) => <div>Asset detail for {assetId}</div>,
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

function StatefulAssetsRoute({
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
    if (options.to !== "/assets" || typeof options.search !== "function") {
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

  return <AssetsPage search={routeState.search} selected={routeState.selected} />;
}

function renderAssetsRoute({
  initialSearch,
  initialSelected,
}: {
  initialSearch?: Record<string, unknown>;
  initialSelected?: string;
} = {}) {
  return render(
    <StatefulAssetsRoute initialSearch={initialSearch} initialSelected={initialSelected} />,
  );
}

describe("AssetsPage", () => {
  beforeEach(() => {
    mocks.assetDialogCall.mockReset();
    mocks.assetListOptions = undefined;
    mocks.assetDialogCall.mockResolvedValue(mocks.createdAsset);
    mocks.confirmDelete.mockReset();
    mocks.confirmDelete.mockResolvedValue(true);
    mocks.createAsset.mockReset();
    mocks.deleteAssets.mockReset();
    mocks.deleteAssets.mockResolvedValue({ successful: mocks.assets, failed: [] });
    mocks.navigate.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens and closes the selected asset preview", async () => {
    const user = userEvent.setup();

    renderAssetsRoute();

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Assets",
      description: "View systems in scope.",
    });

    const assetRow = screen.getByText("api-01").closest("tr");

    if (!assetRow) {
      throw new Error("Expected asset row");
    }

    fireEvent.click(assetRow);

    expect(await screen.findByText(`Asset detail for ${mocks.assets[0].id}`)).toBeVisible();
    expect(screen.getByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      `/assets/${mocks.assets[0].id}`,
    );

    await user.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByTestId("data-table-active-row")).not.toBeInTheDocument();
    });
  });

  it("updates visible asset results from route-owned search state", async () => {
    const user = userEvent.setup();

    renderAssetsRoute();
    await user.type(
      screen.getByRole("textbox", { name: /search across visible columns/i }),
      "worker",
    );

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(screen.getByText("worker-02")).toBeVisible();
      expect(screen.queryByText("api-01")).not.toBeInTheDocument();
    });
  });

  it("sends route-owned core search and filters to the asset query", () => {
    renderAssetsRoute({
      initialSearch: {
        filter: "api.example.com",
        assetType: "host",
        assetEnvironment: "production",
        assetLifecycleState: "archived",
        assetOwnerId: "none",
      },
    });

    expect(mocks.assetListOptions).toEqual({
      filter: "api.example.com",
      assetType: ["host"],
      assetEnvironment: ["production"],
      assetLifecycleState: ["archived"],
      assetOwnerId: ["none"],
    });
  });

  it("creates and deletes assets through the table actions", async () => {
    const user = userEvent.setup();

    renderAssetsRoute();

    await user.click(screen.getByRole("button", { name: /new asset/i }));

    await waitFor(() => {
      expect(mocks.assetDialogCall).toHaveBeenCalledWith({});
      expect(mocks.createAsset).toHaveBeenCalledWith(mocks.createdAsset);
    });

    await user.click(screen.getByLabelText("Select all"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mocks.confirmDelete).toHaveBeenCalledWith({
        title: "Delete Assets",
        description: "This action cannot be undone",
        message: "Are you sure you want to delete 2 asset(s)?",
        confirmVariant: "destructive",
      });
      expect(mocks.deleteAssets).toHaveBeenCalledWith(mocks.assets);
    });
  });
});
