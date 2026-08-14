import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomFieldsPage } from "@/features/custom-fields/components/custom-fields-page.tsx";

import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field";
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

const mocks = vi.hoisted(() => {
  const customFields: Array<AssetCustomFieldDefinition> = [
    {
      id: "0d277a57-52a8-42f3-8559-24ac18ff5d50",
      key: "category",
      name: "Category",
      required: false,
      type: "text",
      defaultValue: null,
    } as AssetCustomFieldDefinition,
    {
      id: "2de88e3b-1176-4705-8d95-fd784b0a83e7",
      key: "priority",
      name: "Priority",
      required: true,
      type: "number",
      defaultValue: 3,
    } as AssetCustomFieldDefinition,
    {
      id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
      key: "environment",
      name: "Environment",
      required: true,
      type: "select",
      defaultValue: "production",
      options: [
        {
          id: "6b567696-6808-45be-ab67-a8683d98a138",
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "production",
          label: "Production",
        },
        {
          id: "fb663885-6b41-4ae0-8b46-c0f647088876",
          fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
          value: "staging",
          label: "Staging",
        },
      ],
    } as AssetCustomFieldDefinition,
  ];

  return {
    confirmDelete: vi.fn(),
    customFields,
    deleteDefinitions: vi.fn(),
    navigate: vi.fn(),
    refetchCustomFields: vi.fn(),
    usePageMeta: vi.fn(),
    useQuery: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: mocks.useQuery,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/api/asset-custom-field.ts", () => ({
  createListAssetCustomFieldDefinitionsQueryOptions: () => ({
    queryKey: ["asset-custom-fields"],
  }),
}));

vi.mock("@/hooks/use-asset-custom-field-definition-lifecycle.ts", () => ({
  useAssetCustomFieldDefinitionLifecycle: () => ({
    deleteDefinitions: mocks.deleteDefinitions,
  }),
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDelete,
  },
}));

vi.mock("@/context/page.tsx", () => ({
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

vi.mock("@/components/asset-custom-field-detail-content", () => ({
  AssetCustomFieldDetailContent: ({ customFieldId }: { customFieldId: string }) => (
    <section>Detail for custom field {customFieldId}</section>
  ),
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

function StatefulCustomFieldsRoute({
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

  useEffect(() => {
    mocks.navigate.mockImplementation((options: NavigateCall) => {
      if (options.to !== "/custom-fields" || typeof options.search !== "function") {
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
  }, []);

  return <CustomFieldsPage search={routeState.search} selected={routeState.selected} />;
}

function renderCustomFieldsRoute({
  initialSearch,
  initialSelected,
}: {
  initialSearch?: Record<string, unknown>;
  initialSelected?: string;
} = {}) {
  return render(
    <StatefulCustomFieldsRoute initialSearch={initialSearch} initialSelected={initialSelected} />,
  );
}

function getEnvironmentField() {
  const field = mocks.customFields.find(
    (customField) => customField.type === AssetCustomFieldType.Select,
  );

  if (!field) {
    throw new Error("Expected select custom field fixture");
  }

  return field;
}

describe("CustomFieldsPage", () => {
  beforeEach(() => {
    mocks.confirmDelete.mockReset();
    mocks.confirmDelete.mockResolvedValue(true);
    mocks.deleteDefinitions.mockReset();
    mocks.deleteDefinitions.mockResolvedValue({
      successful: [getEnvironmentField()],
      failed: [],
    });
    mocks.navigate.mockReset();
    mocks.refetchCustomFields.mockReset();
    mocks.usePageMeta.mockReset();
    mocks.useQuery.mockReset();
    mocks.useQuery.mockReturnValue({
      data: mocks.customFields,
      isFetching: false,
      isPending: false,
      refetch: mocks.refetchCustomFields,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a selected custom field preview with a full-page detail link", async () => {
    const user = userEvent.setup();
    const environmentField = getEnvironmentField();

    renderCustomFieldsRoute();

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-total-rows",
        "3",
      );
    });
    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Custom Fields",
      description: "Manage asset metadata fields.",
    });

    await user.click(screen.getByText("Environment"));

    expect(await screen.findByText(`Detail for custom field ${environmentField.id}`)).toBeVisible();
    expect(screen.getByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      `/custom-fields/${environmentField.id}`,
    );
    expect(screen.getByTestId("data-table-active-row")).toHaveTextContent("Environment");
  });

  it("clears the selected custom field when the preview closes", async () => {
    const user = userEvent.setup();
    const environmentField = getEnvironmentField();

    renderCustomFieldsRoute({
      initialSearch: { selected: environmentField.id },
      initialSelected: environmentField.id,
    });

    expect(await screen.findByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      `/custom-fields/${environmentField.id}`,
    );

    await user.click(screen.getByRole("button", { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /open full page/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("data-table-active-row")).not.toBeInTheDocument();
    });
  });

  it("updates visible table results from route-owned search state", async () => {
    const user = userEvent.setup();

    renderCustomFieldsRoute();

    await user.type(
      screen.getByRole("textbox", { name: /search across visible columns/i }),
      "priority",
    );

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(screen.getByText("Priority")).toBeVisible();
      expect(screen.queryByText("Category")).not.toBeInTheDocument();
      expect(screen.queryByText("Environment")).not.toBeInTheDocument();
    });
  });

  it("navigates from the create action", async () => {
    const user = userEvent.setup();

    renderCustomFieldsRoute();

    await user.click(screen.getByRole("button", { name: /new custom field/i }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/new",
    });
  });

  it("deletes selected custom fields and clears the deleted preview", async () => {
    const user = userEvent.setup();
    const environmentField = getEnvironmentField();

    renderCustomFieldsRoute({
      initialSearch: { selected: environmentField.id },
      initialSelected: environmentField.id,
    });

    await screen.findByTestId("data-table-active-row");
    await user.click(screen.getByLabelText("Select all"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(mocks.confirmDelete).toHaveBeenCalledWith({
        title: "Delete Custom Fields",
        description: "This action cannot be undone",
        message: "Are you sure you want to delete 3 custom field(s)?",
        confirmVariant: "destructive",
      });
      expect(mocks.deleteDefinitions).toHaveBeenCalledWith(mocks.customFields);
    });

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /open full page/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("data-table-active-row")).not.toBeInTheDocument();
    });
  });
});
