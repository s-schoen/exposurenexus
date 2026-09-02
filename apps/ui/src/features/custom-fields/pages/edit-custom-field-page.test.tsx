import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditCustomFieldPage } from "@/features/custom-fields/pages/edit-custom-field-page.tsx";

import type { AssetCustomFieldDefinition } from "@exposurenexus/contracts/model/asset-custom-field";

interface QueryState<TData> {
  data?: TData;
  error?: Error | null;
  isPending: boolean;
}

type TextAssetCustomFieldDefinition = Extract<
  AssetCustomFieldDefinition,
  { type: AssetCustomFieldType.Text }
>;

const customFieldId = "7f732d2b-8985-4551-b45d-0eaf527a1577";

const mocks = vi.hoisted(() => {
  const customField: TextAssetCustomFieldDefinition = {
    id: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "category",
    name: "Category",
    required: false,
    type: "text" as AssetCustomFieldType.Text,
    defaultValue: null,
  };
  const customFieldQuery: QueryState<AssetCustomFieldDefinition> = {
    data: customField,
    error: null,
    isPending: false,
  };

  return {
    customField,
    customFieldQuery,
    navigate: vi.fn(),
    updateDefinition: vi.fn(),
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

vi.mock("@/features/custom-fields/queries/definitions.ts", () => ({
  createAssetCustomFieldDefinitionByIDQueryOptions: (id: string) => ({
    queryKey: ["asset-custom-fields", id],
  }),
}));

vi.mock("@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts", () => ({
  useAssetCustomFieldDefinitionLifecycle: () => ({
    updateDefinition: mocks.updateDefinition,
  }),
}));

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
HTMLElement.prototype.scrollIntoView = vi.fn();

describe("EditCustomFieldPage", () => {
  beforeEach(() => {
    mocks.customFieldQuery = {
      data: mocks.customField,
      error: null,
      isPending: false,
    };
    mocks.navigate.mockReset();
    mocks.updateDefinition.mockReset();
    mocks.updateDefinition.mockResolvedValue(mocks.customField);
    mocks.usePageMeta.mockReset();
    mocks.useQuery.mockReset();
    mocks.useQuery.mockReturnValue(mocks.customFieldQuery);
  });

  afterEach(() => {
    cleanup();
  });

  it("loads existing values and sets edit page metadata", () => {
    render(<EditCustomFieldPage customFieldId={customFieldId} />);

    expect(mocks.usePageMeta).toHaveBeenCalledWith({
      title: "Edit Category",
      description: "Update the asset custom field definition and allowed values.",
    });
    expect(screen.getByRole("textbox", { name: /^name$/i })).toHaveValue("Category");
    expect(screen.getByRole("textbox", { name: /^key$/i })).toHaveValue("category");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeVisible();
  });

  it("cancels back to the custom field detail page", async () => {
    const user = userEvent.setup();

    render(<EditCustomFieldPage customFieldId={customFieldId} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/$id",
      params: { id: customFieldId },
    });
  });

  it("updates through the lifecycle hook and navigates back to detail", async () => {
    const user = userEvent.setup();
    const updatedField = {
      ...mocks.customField,
      name: "Business Unit",
      defaultValue: "Security",
    };
    mocks.updateDefinition.mockResolvedValueOnce(updatedField);

    render(<EditCustomFieldPage customFieldId={customFieldId} />);
    await user.clear(screen.getByRole("textbox", { name: /^name$/i }));
    await user.type(screen.getByRole("textbox", { name: /^name$/i }), "Business Unit");
    await user.type(screen.getByRole("textbox", { name: /default value/i }), "Security");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateDefinition).toHaveBeenCalledWith(customFieldId, {
        name: "Business Unit",
        key: "category",
        type: AssetCustomFieldType.Text,
        required: false,
        defaultValue: "Security",
      });
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/custom-fields/$id",
      params: { id: customFieldId },
    });
  });

  it("does not navigate after a handled update failure", async () => {
    const user = userEvent.setup();
    mocks.updateDefinition.mockResolvedValueOnce(null);

    render(<EditCustomFieldPage customFieldId={customFieldId} />);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateDefinition).toHaveBeenCalledTimes(1);
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });

  it("renders loading and missing-data states", () => {
    mocks.useQuery.mockReturnValueOnce({
      error: null,
      isPending: true,
    });
    const { rerender } = render(<EditCustomFieldPage customFieldId={customFieldId} />);

    expect(screen.getByText("Loading custom field details.")).toBeVisible();

    mocks.useQuery.mockReturnValueOnce({
      error: new Error("Custom field request failed"),
      isPending: false,
    });
    rerender(<EditCustomFieldPage customFieldId={customFieldId} />);

    expect(screen.getByText("Unable to load edit form")).toBeVisible();
    expect(screen.getByText("Custom field request failed")).toBeVisible();
  });
});
